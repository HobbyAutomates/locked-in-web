import type { AdminClient } from "./apiAuth";
import { DEFAULT_PROFILE, type MealItem, type Profile } from "./types";
import { today } from "./dates";
import { ageYears } from "./goals";
import { effectiveDietMode } from "./dietModes";
import { defaultMealType, isMealType, missingMealTypeColumn } from "./mealType";
import { rollupQuietly } from "./rollup";
import { answersToProfile, effectiveCoachStyle, onboardingPlan, sanitizeAnswers, seedMemories, type OnbAnswers, type OnbPlan } from "./onboardingV2";
import { missingV37 } from "./coachSchema";

/**
 * v2.14 onboarding save (server side of /api/onboarding/finish). Runs with the service-role client
 * and always filters by the caller's id. Every newer column group is written on its own so a
 * database without schema_v36 / schema_v37 still gets the classic profile + targets.
 */

const CLASSIC = "name, dob, gender, height_cm, weight_kg, goal_weight_kg, goal_type, goal_speed_kg_wk, weekly_workout_target, calorie_target, protein_target_g";

function profileFrom(row: Record<string, unknown> | null): Profile {
  const num = (v: unknown) => (v == null ? null : Number(v));
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    ...DEFAULT_PROFILE,
    name: typeof row.name === "string" ? row.name : "",
    dob: typeof row.dob === "string" ? row.dob.slice(0, 10) : null,
    gender: row.gender === "male" || row.gender === "female" || row.gender === "other" ? row.gender : null,
    height_cm: num(row.height_cm),
    weight_kg: num(row.weight_kg),
    goal_weight_kg: num(row.goal_weight_kg),
    goal_type: row.goal_type === "lose" || row.goal_type === "gain" ? row.goal_type : "maintain",
    goal_speed_kg_wk: num(row.goal_speed_kg_wk) ?? DEFAULT_PROFILE.goal_speed_kg_wk,
    weekly_workout_target: num(row.weekly_workout_target) ?? DEFAULT_PROFILE.weekly_workout_target,
    calorie_target: num(row.calorie_target) ?? DEFAULT_PROFILE.calorie_target,
    protein_target_g: num(row.protein_target_g) ?? DEFAULT_PROFILE.protein_target_g,
  };
}

/** Clamps one client-sent meal item to sane numbers (the replayed first log). */
function cleanItem(raw: unknown): MealItem | null {
  const i = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, hi: number) => Math.max(0, Math.min(hi, Number(v) || 0));
  const name = String(i.name ?? "").trim().slice(0, 80);
  const grams = n(i.grams, 5000);
  if (!name || !(grams > 0)) return null;
  return {
    food_id: typeof i.food_id === "string" && /^[0-9a-f-]{36}$/i.test(i.food_id) ? i.food_id : null,
    name,
    grams,
    calories: Math.round(n(i.calories, 10000)),
    protein_g: Math.round(n(i.protein_g, 500) * 10) / 10,
    carbs_g: Math.round(n(i.carbs_g, 1000) * 10) / 10,
    fat_g: Math.round(n(i.fat_g, 500) * 10) / 10,
    source: i.source === "table" || i.source === "scan" ? i.source : "estimated",
    confidence: i.confidence == null ? null : n(i.confidence, 1),
    micros: i.micros && typeof i.micros === "object" ? (i.micros as MealItem["micros"]) : {},
    unit: typeof i.unit === "string" ? i.unit.slice(0, 12) : null,
    servings: i.servings == null ? null : n(i.servings, 100),
  };
}

/** Writes the pre-account first log into `meals` once (a repeat with the same text + date is skipped). */
async function replayFirstLog(admin: AdminClient, userId: string, raw: unknown): Promise<string | null> {
  const log = (raw && typeof raw === "object" ? raw : null) as { text?: unknown; meal_type?: unknown; date?: unknown; items?: unknown } | null;
  if (!log || !Array.isArray(log.items)) return null;
  const items = log.items.map(cleanItem).filter((x): x is MealItem => !!x).slice(0, 20);
  if (!items.length) return null;
  const text = String(log.text ?? "").trim().slice(0, 500);
  const t = today();
  // Only today or the last couple of days: an old device-stored log shouldn't back-fill a week.
  const date = typeof log.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(log.date) && log.date <= t && log.date >= addDaysIso(t, -2) ? log.date : t;
  const { data: dupe } = await admin.from("meals").select("id").eq("user_id", userId).eq("date", date).eq("raw_text", text).limit(1);
  if (dupe?.length) return dupe[0].id as string;
  const row = { user_id: userId, date, raw_text: text };
  const mealType = isMealType(log.meal_type) ? log.meal_type : defaultMealType();
  let res = await admin.from("meals").insert({ ...row, meal_type: mealType }).select("id").single();
  if (res.error && missingMealTypeColumn(res.error)) res = await admin.from("meals").insert(row).select("id").single();
  if (res.error || !res.data) return null;
  const mealId = res.data.id as string;
  await admin.from("meal_items").insert(
    items.map((i) => ({ meal_id: mealId, user_id: userId, food_id: i.food_id, name: i.name, grams: i.grams, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, source: i.source, confidence: i.confidence, micros: i.micros ?? {}, unit: i.unit ?? null, servings: i.servings ?? null })),
  );
  await rollupQuietly(admin, userId, [date]);
  return mealId;
}

function addDaysIso(s: string, n: number) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Adds the onboarding memories once (skipped when this account already has onboarding memories). */
async function seed(admin: AdminClient, userId: string, a: OnbAnswers, plan: OnbPlan | null, onlyKinds?: string[]) {
  const mems = seedMemories(a, plan).filter((m) => !onlyKinds || onlyKinds.includes(m.kind));
  if (!mems.length) return;
  const { data: existing, error } = await admin.from("coach_memory").select("text").eq("user_id", userId).is("deleted_at", null);
  if (error) return;
  const have = new Set((existing ?? []).map((r) => String(r.text).toLowerCase()));
  const fresh = mems.filter((m) => !have.has(m.text.toLowerCase()));
  if (fresh.length) await admin.from("coach_memory").insert(fresh.map((m) => ({ user_id: userId, kind: m.kind, text: m.text, source: "onboarding", kept: true })));
}

export type FinishResult = { targets: OnbPlan["targets"] | null; goal_date: string | null; v37: boolean; meal_id: string | null };

export async function finishOnboarding(admin: AdminClient, userId: string, body: Record<string, unknown>): Promise<FinishResult> {
  const a = sanitizeAnswers(body.answers);
  const { data: row } = await admin.from("profiles").select(CLASSIC).eq("id", userId).maybeSingle();
  const current = profileFrom(row as Record<string, unknown> | null);
  const age = ageYears(a.dob ?? current.dob);
  const style = a.coach_style ? effectiveCoachStyle(a.coach_style, age) : null;

  const v37row: Record<string, unknown> = { onboarded_v2: true };
  if (style) v37row.coach_style = style;
  if (a.obstacles) v37row.obstacles = a.obstacles;
  if (a.training_days != null) v37row.training_days = a.training_days;
  if (a.sports) v37row.sports = a.sports;

  if (body.mode === "tune") {
    const { error } = await admin.from("profiles").update(v37row).eq("id", userId);
    if (error && !missingV37(error)) throw new Error(error.message);
    if (!error) await seed(admin, userId, a, null, ["life", "food", "style"]);
    return { targets: null, goal_date: null, v37: !error, meal_id: null };
  }

  // Full: fill gaps from what the profile already has, so a signed-in user who skipped a question keeps it.
  const merged: OnbAnswers = {
    ...a,
    height_cm: a.height_cm ?? current.height_cm,
    weight_kg: a.weight_kg ?? current.weight_kg,
    dob: a.dob ?? current.dob,
    gender: a.gender ?? current.gender,
  };
  const plan = onboardingPlan(merged, today());
  const p = answersToProfile(merged, current, today());
  const classic: Record<string, unknown> = {
    height_cm: p.height_cm,
    weight_kg: p.weight_kg,
    dob: p.dob,
    gender: p.gender,
    goal_type: p.goal_type,
    goal_weight_kg: p.goal_weight_kg,
    goal_speed_kg_wk: p.goal_speed_kg_wk,
    weekly_workout_target: p.weekly_workout_target,
  };
  if (a.name) classic.name = a.name;
  if (plan) Object.assign(classic, { calorie_target: plan.targets.calories, protein_target_g: plan.targets.protein, carb_target_g: plan.targets.carbs, fat_target_g: plan.targets.fat, fiber_target: plan.targets.fiber });
  const { error: e1 } = await admin.from("profiles").update(classic).eq("id", userId);
  if (e1) throw new Error(e1.message);
  // First weigh-in, so Progress has a starting point (only when there's none yet).
  if (p.weight_kg) {
    const { data: w } = await admin.from("weight_log").select("id").eq("user_id", userId).limit(1);
    if (!w?.length) await admin.from("weight_log").insert({ user_id: userId, date: today(), weight_kg: p.weight_kg, note: null });
  }
  // v36 diet mode (skipped quietly when schema_v36 isn't there).
  if (a.diet_mode) await admin.from("profiles").update({ diet_mode: effectiveDietMode(a.diet_mode, age) }).eq("id", userId);
  // v37 answers.
  if (a.heard_from) v37row.heard_from = a.heard_from;
  if (a.first_challenge) v37row.first_challenge = a.first_challenge;
  const { error: e3 } = await admin.from("profiles").update(v37row).eq("id", userId);
  const v37 = !e3;
  if (e3 && !missingV37(e3)) throw new Error(e3.message);
  if (v37) await seed(admin, userId, merged, plan);
  const meal_id = await replayFirstLog(admin, userId, body.first_log).catch(() => null);
  return { targets: plan?.targets ?? null, goal_date: plan?.goal_date ?? null, v37, meal_id };
}
