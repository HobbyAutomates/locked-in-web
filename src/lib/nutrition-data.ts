import { createClient } from "./supabase/server";
import { addDays, today as todayIso } from "./dates";
import { getMeals, getProfile, getWeights } from "./data";
import { isDietMode } from "./dietModes";
import { adaptiveFloor, checkinWeek, goalRateFor, weeklyCheckin } from "./adaptive";
import { clampHours } from "./fasting";
import { recipeFromRow, type Recipe } from "./recipes";
import { missingV36 } from "./v36";
import { totalsFor } from "./totals";
import type { Meal, Profile } from "./types";
import { DEFAULT_SETTINGS, type CheckinRow, type CheckinState, type FastSession, type NutritionSettings } from "./nutritionTypes";

export type { CheckinRow, CheckinState, FastSession, NutritionSettings };
export { DEFAULT_SETTINGS };

/**
 * v2.13 nutrition reads (server only). Everything here tolerates schema_v36 not being applied:
 * `available: false` means the table or column isn't there yet and the screen says "Coming with the
 * next update". Writes are in nutrition-actions.ts.
 */

/** diet_mode / adaptive_targets / fasting_hours in their own query, so a pre-v36 database still loads everything else. */
export async function getNutritionSettings(): Promise<NutritionSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("diet_mode, adaptive_targets, fasting_hours").maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  const d = data as Record<string, unknown>;
  return {
    available: true,
    diet_mode: isDietMode(d.diet_mode) ? d.diet_mode : "balanced",
    adaptive_targets: d.adaptive_targets === true,
    fasting_hours: d.fasting_hours == null ? null : clampHours(Number(d.fasting_hours)),
  };
}

// ---------------------------------------------------------------- recipes

export async function getRecipes(): Promise<{ available: boolean; recipes: Recipe[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").select("id, name, servings, cooked_weight_g, items, per_serving, note, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (error) return { available: !missingV36(error), recipes: [] };
  return { available: true, recipes: (data ?? []).map((r) => recipeFromRow(r as Record<string, unknown>)) };
}

export async function getRecipe(id: string): Promise<{ available: boolean; recipe: Recipe | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { available: true, recipe: null };
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").select("id, name, servings, cooked_weight_g, items, per_serving, note, updated_at").eq("id", id).maybeSingle();
  if (error) return { available: !missingV36(error), recipe: null };
  return { available: true, recipe: data ? recipeFromRow(data as Record<string, unknown>) : null };
}

// ---------------------------------------------------------------- fasting

export async function getFasting(): Promise<{ available: boolean; active: FastSession | null; history: FastSession[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fasting_sessions").select("id, started_at, ended_at, target_hours, note").order("started_at", { ascending: false }).limit(15);
  if (error) return { available: !missingV36(error), active: null, history: [] };
  const rows = (data ?? []).map((r) => ({ id: r.id as string, started_at: r.started_at as string, ended_at: (r.ended_at as string | null) ?? null, target_hours: Number(r.target_hours) || 16, note: (r.note as string | null) ?? null }));
  const active = rows.find((r) => !r.ended_at) ?? null;
  return { available: true, active, history: rows.filter((r) => r.ended_at).slice(0, 14) };
}

// ---------------------------------------------------------------- weekly check-in

const rowOf = (r: Record<string, unknown>): CheckinRow => ({
  id: String(r.id),
  week_start: String(r.week_start),
  avg_weight_kg: r.avg_weight_kg == null ? null : Number(r.avg_weight_kg),
  trend_kg_per_week: r.trend_kg_per_week == null ? null : Number(r.trend_kg_per_week),
  avg_kcal: r.avg_kcal == null ? null : Number(r.avg_kcal),
  old_target: r.old_target == null ? null : Number(r.old_target),
  new_target: r.new_target == null ? null : Number(r.new_target),
  reason: String(r.reason ?? ""),
  applied: r.applied === true,
});

/** Daily kcal on the days with at least one food log. */
export function dayKcalOf(meals: Meal[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of meals) if (m.date >= from && m.date <= to && m.items.length) out[m.date] = 0;
  for (const d of Object.keys(out)) out[d] = Math.round(totalsFor(meals, d).calories);
  return out;
}

/**
 * This week's check-in, computing and storing it on the first open on / after Monday when adaptive
 * targets are on and there's enough data. Never applies anything. `meals` can be passed when the
 * page already has the last few weeks loaded.
 */
export async function getWeeklyCheckin(profile: Profile, settings: NutritionSettings, meals?: Meal[]): Promise<CheckinState> {
  if (!settings.available) return { available: false, row: null, pending: null };
  if (!settings.adaptive_targets) return { available: true, row: null, pending: null };
  const supabase = await createClient();
  const t = todayIso();
  const { weekStart, asOf } = checkinWeek(t);
  const existing = await supabase.from("weekly_checkins").select("id, week_start, avg_weight_kg, trend_kg_per_week, avg_kcal, old_target, new_target, reason, applied").eq("week_start", weekStart).maybeSingle();
  if (existing.error) return { available: !missingV36(existing.error), row: null, pending: null };
  if (existing.data) return { available: true, row: rowOf(existing.data as Record<string, unknown>), pending: null };

  const from = addDays(asOf, -20);
  const [weights, recent] = await Promise.all([getWeights(60), meals ? Promise.resolve(meals) : getMeals(from, asOf)]);
  const result = weeklyCheckin(
    { asOf, weighIns: weights.map((w) => ({ date: w.date, kg: w.weight_kg })), dayKcal: dayKcalOf(recent, addDays(asOf, -13), asOf) },
    { goalRateKgPerWeek: goalRateFor(profile, t), oldTarget: profile.calorie_target, floor: adaptiveFloor(profile, t) },
  );
  if (!result.ok) return { available: true, row: null, pending: result };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { available: true, row: null, pending: null };
  const insert = {
    user_id: user.id,
    week_start: weekStart,
    avg_weight_kg: result.avgWeightKg,
    trend_kg_per_week: result.trendKgPerWeek,
    avg_kcal: result.avgKcal,
    old_target: result.oldTarget,
    new_target: result.newTarget,
    reason: result.reason,
    applied: false,
  };
  // ignoreDuplicates: a second tab racing this one keeps the first row (and its applied flag).
  const saved = await supabase.from("weekly_checkins").upsert(insert, { onConflict: "user_id,week_start", ignoreDuplicates: true }).select("id, week_start, avg_weight_kg, trend_kg_per_week, avg_kcal, old_target, new_target, reason, applied").maybeSingle();
  if (saved.error) {
    if (missingV36(saved.error)) return { available: false, row: null, pending: null };
    console.error("[getWeeklyCheckin] save failed", saved.error);
  }
  const row = saved.data ? rowOf(saved.data as Record<string, unknown>) : { id: "", ...insert, reason: result.reason };
  return { available: true, row: row as CheckinRow, pending: null };
}

/** Everything the micros dashboard needs: the profile, the mode and the last 7 days of meals. */
export async function getMicrosData() {
  const t = todayIso();
  const [profile, settings, meals] = await Promise.all([getProfile(), getNutritionSettings(), getMeals(addDays(t, -6), t)]);
  return { today: t, profile, settings, meals };
}
