import { addDays, today } from "./dates";
import { createClient } from "./supabase/server";
import { DEFAULT_PROFILE, type ExerciseEntry, type FoodPreset, type Meal, type MealItem, type Nudge, type Profile, type ProgressPhoto, type PublicSquad, type ScanHistoryItem, type Squad, type SquadMember, type WaterEntry, type WeightEntry, type Workout, type JoinRequest, type LeaderRow, type SquadInvite, type SquadMemberDetail, type SquadPost, type Challenge, type ChallengeBoardRow } from "./types";
import { normalizeBoard, normalizeChallenge } from "./challenges";
import { parse as parseReminders } from "./reminders";
import { calorieGoalDays, longestDayRun, type BadgeProgress } from "./badges";
import { scanName } from "./scanNames";
import { isMealType, missingMealTypeColumn } from "./mealType";

const PROFILE_COLS =
  "weekly_workout_target, protein_target_g, calorie_target, name, dob, gender, height_cm, weight_kg, goal_weight_kg, goal_type, goal_speed_kg_wk, step_goal, carb_target_g, fat_target_g, reminders, lens_default, share_stats, avatar_path, fiber_target, sugar_target, add_burned_to_goal, rollover_calories, water_goal_ml, units, username, water_glass_ml, water_reminder_from, water_reminder_to, water_reminder_every_min";

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
/** Postgres `time` ("08:00:00") → "08:00". */
const hhmm = (v: unknown, fallback: string): string => (typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : fallback);

/** The signed-in user's `profiles` row with Android's defaults filled in for anything unset. */
export async function getProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PROFILE_COLS).maybeSingle();
  if (!data) return { ...DEFAULT_PROFILE };
  const d = data as Record<string, unknown>;
  return {
    weekly_workout_target: num(d.weekly_workout_target) ?? DEFAULT_PROFILE.weekly_workout_target,
    protein_target_g: num(d.protein_target_g) ?? DEFAULT_PROFILE.protein_target_g,
    calorie_target: num(d.calorie_target) ?? DEFAULT_PROFILE.calorie_target,
    name: typeof d.name === "string" ? d.name : "",
    dob: typeof d.dob === "string" && d.dob ? d.dob.slice(0, 10) : null,
    gender: d.gender === "male" || d.gender === "female" || d.gender === "other" ? d.gender : null,
    height_cm: num(d.height_cm),
    weight_kg: num(d.weight_kg),
    goal_weight_kg: num(d.goal_weight_kg),
    goal_type: d.goal_type === "lose" || d.goal_type === "gain" ? d.goal_type : "maintain",
    goal_speed_kg_wk: num(d.goal_speed_kg_wk) ?? DEFAULT_PROFILE.goal_speed_kg_wk,
    step_goal: num(d.step_goal) ?? DEFAULT_PROFILE.step_goal,
    carb_target_g: num(d.carb_target_g),
    fat_target_g: num(d.fat_target_g),
    reminders: parseReminders(d.reminders),
    lens_default: (["protein", "goal", "snack", "cutting", "bulking"] as const).includes(d.lens_default as never) ? (d.lens_default as Profile["lens_default"]) : "protein",
    share_stats: d.share_stats !== false,
    avatar_path: typeof d.avatar_path === "string" && d.avatar_path ? d.avatar_path : null,
    fiber_target: num(d.fiber_target),
    sugar_target: num(d.sugar_target),
    add_burned_to_goal: d.add_burned_to_goal === true,
    rollover_calories: d.rollover_calories === true,
    water_goal_ml: num(d.water_goal_ml) ?? DEFAULT_PROFILE.water_goal_ml,
    units: d.units === "imperial" ? "imperial" : "metric",
    username: typeof d.username === "string" && d.username ? d.username : null,
    water_glass_ml: num(d.water_glass_ml) ?? DEFAULT_PROFILE.water_glass_ml,
    water_reminder_from: hhmm(d.water_reminder_from, DEFAULT_PROFILE.water_reminder_from),
    water_reminder_to: hhmm(d.water_reminder_to, DEFAULT_PROFILE.water_reminder_to),
    water_reminder_every_min: num(d.water_reminder_every_min) ?? 0,
  };
}

/** Weigh-ins, newest first (Profile → Weight history and the Progress sparkline). */
export async function getWeights(limit = 400): Promise<WeightEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weight_log")
    .select("id, date, weight_kg, note")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({ id: r.id as string, date: r.date as string, weight_kg: Number(r.weight_kg), note: (r.note as string | null) ?? "" }));
}

/**
 * Lifetime numbers the badges need beyond the 120-day dashboard window: every workout date ever
 * (for the longest day run) and the meals row count via PostgREST's exact count (no rows sent).
 */
export async function getBadgeTotals(): Promise<{ workoutDates: string[]; totalMeals: number }> {
  const supabase = await createClient();
  const [dates, count] = await Promise.all([
    supabase.from("workouts").select("date").order("date", { ascending: true }),
    supabase.from("meals").select("id", { count: "exact", head: true }),
  ]);
  return { workoutDates: (dates.data ?? []).map((r) => r.date as string), totalMeals: count.count ?? 0 };
}

/** The three badge counters, exactly as Android's `AppViewModel.badgeProgress`. */
export async function getBadgeProgress(profile: Profile, workouts: Workout[], meals: Meal[]): Promise<BadgeProgress> {
  const { workoutDates, totalMeals } = await getBadgeTotals();
  return {
    streakDays: longestDayRun(workoutDates.length ? workoutDates : workouts.map((w) => w.date)),
    meals: Math.max(totalMeals, meals.length),
    goalDays: calorieGoalDays(meals, profile.calorie_target),
  };
}

/** Calories-burned rows (logged exercise + the auto-burn each band workout writes), newest first. */
export async function getExercises(from: string, to: string): Promise<ExerciseEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exercise_log")
    .select("id, date, activity_code, name, minutes, intensity, kcal, source, note, created_at, started_at, intensity_pct, distance_km, steps")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    ...r,
    kcal: Number(r.kcal),
    minutes: Number(r.minutes),
    note: r.note ?? "",
    intensity_pct: r.intensity_pct == null ? null : Number(r.intensity_pct),
    distance_km: r.distance_km == null ? null : Number(r.distance_km),
    steps: r.steps == null ? null : Number(r.steps),
  })) as ExerciseEntry[];
}

const WORKOUT_COLS = "id, date, muscles, band_level, resistance_kg, minutes, exercises, notes, kind, exercises_json";

/** v2.5: the last few gym / bodyweight sessions, newest first — the set grid's "last time" ghost values. */
export async function getRecentLiftWorkouts(n = 20): Promise<Workout[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("workouts").select(WORKOUT_COLS).in("kind", ["gym", "bodyweight"]).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(n);
  return (data ?? []) as Workout[];
}

export async function getWorkouts(from: string, to: string): Promise<Workout[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select(WORKOUT_COLS)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });
  return (data ?? []) as Workout[];
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select(WORKOUT_COLS)
    .eq("id", id)
    .maybeSingle();
  return (data as Workout) ?? null;
}

/** The most recent workout, for the Workout form's "Same as last time". */
export async function getLatestWorkout(): Promise<Workout | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select(WORKOUT_COLS)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Workout) ?? null;
}

/**
 * How often each food was eaten in the last `days` days (meal_items.food_id → count). Add food
 * uses it to build "Yours" and to order categories and presets by what this person actually eats.
 */
export async function getFoodUsage(days = 60): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("meals").select("meal_items(food_id)").gte("date", addDays(today(), -days));
  const out: Record<string, number> = {};
  for (const m of (data ?? []) as { meal_items: { food_id: string | null }[] | null }[]) {
    for (const i of m.meal_items ?? []) if (i.food_id) out[i.food_id] = (out[i.food_id] ?? 0) + 1;
  }
  return out;
}

/** Meals with items; `photo_path` becomes a 1-hour signed URL in `photo_url` when a photo exists. */
const MEAL_ITEM_COLS = "id, food_id, name, grams, calories, protein_g, carbs_g, fat_g, source, confidence, micros, unit, servings, cooked_in";

type MealRowData = { id: unknown; date: unknown; raw_text: unknown; created_at: unknown; photo_path: unknown; meal_type?: unknown; meal_items: unknown };

function mealFromRow(m: MealRowData): Meal & { photo_url: string | null } {
  return {
    id: m.id as string,
    date: m.date as string,
    raw_text: m.raw_text as string,
    created_at: m.created_at as string,
    photo_path: (m.photo_path as string | null) ?? null,
    items: ((m.meal_items ?? []) as MealItem[]).map((i) => ({ ...i, grams: Number(i.grams), servings: i.servings == null ? null : Number(i.servings) })),
    // v2.8: null (or no column before schema_v30) → the hour rule, in lib/mealType.ts.
    meal_type: isMealType(m.meal_type) ? m.meal_type : null,
    photo_url: null,
  };
}

/**
 * Meals with items; `photo_path` becomes a 1-hour signed URL in `photo_url` when a photo exists.
 * v2.8: selects `meal_type`, and again without it while schema_v30 isn't applied.
 */
export async function getMeals(from: string, to: string): Promise<(Meal & { photo_url?: string | null })[]> {
  const supabase = await createClient();
  const query = (withType: boolean) =>
    supabase
      .from("meals")
      .select(`id, date, raw_text, created_at, photo_path${withType ? ", meal_type" : ""}, meal_items(${MEAL_ITEM_COLS})`)
      .gte("date", from)
      .lte("date", to)
      .order("created_at", { ascending: false });
  let res = await query(true);
  if (res.error && missingMealTypeColumn(res.error)) res = await query(false);
  const meals = ((res.data ?? []) as unknown as MealRowData[]).map(mealFromRow);
  const paths = meals.filter((m) => m.photo_path).map((m) => m.photo_path as string);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("meal-photos").createSignedUrls(paths, 3600);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const m of meals) if (m.photo_path) m.photo_url = byPath.get(m.photo_path) ?? null;
  }
  return meals;
}

/** v2.8: one meal with its items, for the meal editor (null when it's gone or not mine). */
export async function getMeal(id: string): Promise<Meal | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const query = (withType: boolean) =>
    supabase
      .from("meals")
      .select(`id, date, raw_text, created_at, photo_path${withType ? ", meal_type" : ""}, meal_items(${MEAL_ITEM_COLS})`)
      .eq("id", id)
      .maybeSingle();
  let res = await query(true);
  if (res.error && missingMealTypeColumn(res.error)) res = await query(false);
  if (res.error || !res.data) return null;
  const { photo_url, ...meal } = mealFromRow(res.data as unknown as MealRowData);
  void photo_url;
  return meal;
}

/** v2.3: glasses / bottles logged between `from` and `to`, newest first. */
export async function getWater(from: string, to: string): Promise<WaterEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("water_log").select("id, date, ml, created_at, vessel").gte("date", from).lte("date", to).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id as string, date: r.date as string, ml: Number(r.ml), created_at: r.created_at as string, vessel: (r.vessel as WaterEntry["vessel"]) ?? null }));
}

/** v2.3: progress photos, newest first, each with a 1-hour signed URL (private bucket). */
export async function getProgressPhotos(limit = 30): Promise<ProgressPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("progress_photos").select("id, date, path, note").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (error || !data?.length) return [];
  const { data: signed } = await supabase.storage.from("progress-photos").createSignedUrls(data.map((r) => r.path as string), 3600);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((r) => ({ id: r.id as string, date: r.date as string, path: r.path as string, note: (r.note as string | null) ?? "", url: byPath.get(r.path as string) ?? null }));
}

/** v2.3: every public squad with its member count and whether I'm in it. */
export async function getPublicSquads(): Promise<PublicSquad[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_groups");
  if (error) return [];
  return ((data ?? []) as PublicSquad[]).map((g) => ({ ...g, member_count: Number(g.member_count ?? 0), joined: !!g.joined, join_policy: g.join_policy === "request" ? "request" : "open" }));
}

/** Everything the Today and Calendar screens need, in one round trip each. */
export async function getDashboard() {
  const t = today();
  const from = addDays(t, -120);
  const [profile, workouts, meals, exercises] = await Promise.all([getProfile(), getWorkouts(from, t), getMeals(from, t), getExercises(from, t)]);
  return { today: t, profile, workouts, meals, exercises };
}

/** Every Indian food preset joined to its foods row (per-100 g numbers), in category + sort order. */
export async function getPresets(): Promise<FoodPreset[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_presets")
    .select("id, food_id, label, label_hi, category, servings, default_serving, sort, icon, image_url, foods(name, calories, protein_g, carbs_g, fat_g, micros)")
    .order("sort", { ascending: true });
  type Row = { id: string; food_id: string; label: string; label_hi: string | null; category: string; servings: unknown; default_serving: string | null; sort: number | null; icon: string | null; image_url: string | null; foods: { name: string; calories: unknown; protein_g: unknown; carbs_g: unknown; fat_g: unknown; micros: unknown } | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.foods)
    .map((r) => ({
      id: r.id,
      food_id: r.food_id,
      label: r.label,
      label_hi: r.label_hi,
      category: r.category as FoodPreset["category"],
      servings: (Array.isArray(r.servings) ? r.servings : []) as FoodPreset["servings"],
      default_serving: r.default_serving,
      sort: Number(r.sort ?? 100),
      icon: r.icon,
      food_name: r.foods?.name ?? r.label,
      calories: Number(r.foods?.calories ?? 0),
      protein_g: Number(r.foods?.protein_g ?? 0),
      carbs_g: Number(r.foods?.carbs_g ?? 0),
      fat_g: Number(r.foods?.fat_g ?? 0),
      micros: (r.foods?.micros ?? {}) as Record<string, number>,
      image_url: r.image_url ?? null,
    }));
}

/**
 * Latest scans for the History list (label / barcode / photo), newest first. Pictures, in order:
 * the scan's own thumbnail (scan-photos, signed in one batch), the Open Food Facts image, the plate
 * photo (meal-photos, signed in one batch). Names never come back blank or "<UNKNOWN>".
 */
export async function getScans(limit = 30): Promise<ScanHistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("label_scans")
    .select("id, kind, lens, product, verdict, created_at, image_path, thumb_path, image_url, report")
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = { id: string; kind: string | null; lens: string | null; product: string | null; verdict: string | null; created_at: string; image_path: string | null; thumb_path: string | null; image_url: string | null; report: Record<string, unknown> | null };
  const rows = (data ?? []) as Row[];
  const sign = async (bucket: string, paths: string[]) => {
    const out = new Map<string, string>();
    if (!paths.length) return out;
    const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    if (error) console.error(`[getScans] signing ${bucket} failed`, error);
    for (const s of signed ?? []) if (s.signedUrl && s.path) out.set(s.path, s.signedUrl);
    return out;
  };
  const [thumbs, plates] = await Promise.all([
    sign("scan-photos", rows.filter((r) => r.thumb_path).map((r) => r.thumb_path as string)),
    sign("meal-photos", rows.filter((r) => r.image_path).map((r) => r.image_path as string)),
  ]);
  return rows.map((r) => {
    const report = r.report ?? {};
    const info = (report.infographic ?? null) as { score_out_of_10?: number } | null;
    const kind = (r.kind === "barcode" || r.kind === "photo" ? r.kind : r.kind === "plate" ? "photo" : "label") as ScanHistoryItem["kind"];
    const offImage = r.image_url ?? (typeof report.image_url === "string" ? report.image_url : null);
    return {
      id: r.id,
      kind,
      lens: r.lens ?? "protein",
      product: scanName(kind, { model: r.product, off: report.product, ingredients: report.transcript }),
      verdict: r.verdict ?? "",
      created_at: r.created_at,
      score: info?.score_out_of_10 ?? null,
      image_url: (r.thumb_path ? thumbs.get(r.thumb_path) : null) ?? offImage ?? (r.image_path ? plates.get(r.image_path) ?? null : null),
      image_path: r.image_path,
      what_it_is: typeof report.what_it_is === "string" ? report.what_it_is.replace(/\s+/g, " ").trim() : kind === "photo" && typeof report.plate_note === "string" ? report.plate_note : "",
    };
  });
}

/** The full stored report of one scan (for the read-only view). */
export async function getScan(id: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("label_scans").select("id, kind, lens, report, image_path").eq("id", id).maybeSingle();
  if (!data) return null;
  const report: Record<string, unknown> = { id: data.id, kind: data.kind, lens: data.lens, ...(data.report as Record<string, unknown>) };
  if (data.image_path && !report.photo_url) {
    const { data: s } = await supabase.storage.from("meal-photos").createSignedUrl(data.image_path as string, 3600);
    if (s?.signedUrl) report.photo_url = s.signedUrl;
  }
  return report;
}

// ---- v2.0: squads ----

/** Every squad the signed-in user is in, oldest first. */
export async function getMySquads(): Promise<Squad[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mine } = await supabase.from("group_members").select("group_id, joined_at").eq("user_id", user.id).order("joined_at", { ascending: true });
  const ids = (mine ?? []).map((m) => m.group_id as string);
  if (!ids.length) return [];
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from("groups").select(SQUAD_COLS).in("id", ids),
    supabase.from("group_members").select("group_id").in("group_id", ids),
  ]);
  const members = new Map<string, number>();
  for (const r of counts ?? []) members.set(r.group_id as string, (members.get(r.group_id as string) ?? 0) + 1);
  const byId = new Map<string, Squad>(((data ?? []) as Squad[]).map((g) => [g.id, { ...g, member_count: members.get(g.id) ?? 1 }]));
  return ids.map((id) => byId.get(id)).filter((g): g is Squad => !!g);
}

/** The squad board: members with name, share preference and their last 7 days of rollups. */
export async function getSquadBoard(groupId: string): Promise<SquadMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("squad_board", { g: groupId });
  if (error) return [];
  return ((data ?? []) as SquadMember[]).map((m) => ({
    ...m,
    days: (m.days ?? []).map((d) => ({
      ...d,
      protein_g: d.protein_g == null ? null : Number(d.protein_g),
      calories: d.calories == null ? null : Number(d.calories),
      burned: d.burned == null ? null : Number(d.burned),
      meals: d.meals == null ? null : Number(d.meals),
      week_streak: Number(d.week_streak ?? 0),
    })),
  }));
}

/** Nudges sent to me in the last 24 h (Home shows them as a banner). */
export async function getMyNudges(): Promise<Nudge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_nudges");
  if (error) return [];
  return (data ?? []) as Nudge[];
}

/** Who I've already nudged in the last 20 h, so the board can show "Nudged". */
export async function getSentNudges(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data } = await supabase.from("nudges").select("to_user").eq("from_user", user.id).gte("created_at", since);
  return [...new Set((data ?? []).map((r) => r.to_user as string))];
}

// ---- v2.6: squads v2 ----

const SQUAD_COLS = "id, name, code, owner_id, created_at, description, icon, cover_url, tagline, is_public, join_policy, battle_enabled";

/** One squad I'm in (RLS hides the rest), with its member count. */
export async function getSquad(id: string): Promise<Squad | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select(SQUAD_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const { count } = await supabase.from("group_members").select("user_id", { count: "exact", head: true }).eq("group_id", id);
  return { ...(data as Squad), member_count: count ?? 1 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = Awaited<ReturnType<typeof createClient>> | import("@supabase/supabase-js").SupabaseClient<any, any, any>;

/** Chat / feed rows, newest first, with feed photos signed (group-photos, 1 h). Shared with the actions. */
export async function fetchSquadPosts(supabase: Client, groupId: string, kinds: string[] | null, before: string | null = null, n = 40): Promise<SquadPost[]> {
  const { data, error } = await supabase.rpc("group_feed", { g: groupId, before, n, kinds });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SquadPost[];
  const paths = [...new Set(rows.filter((r) => r.photo_path).map((r) => r.photo_path as string))];
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("group-photos").createSignedUrls(paths, 3600);
    const byPath = new Map<string, string>();
    for (const x of (signed ?? []) as { path: string | null; signedUrl: string | null }[]) if (x.path && x.signedUrl) byPath.set(x.path, x.signedUrl);
    for (const r of rows) if (r.photo_path) r.photo_url = byPath.get(r.photo_path) ?? null;
  }
  return rows;
}

export async function getSquadPosts(groupId: string, kinds: string[] | null): Promise<SquadPost[]> {
  const supabase = await createClient();
  try {
    return await fetchSquadPosts(supabase, groupId, kinds);
  } catch {
    return [];
  }
}

export async function getLeaderboard(groupId: string): Promise<LeaderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_leaderboard", { g: groupId });
  if (error) return [];
  return ((data ?? []) as LeaderRow[]).map((r) => ({ ...r, rank: Number(r.rank), flames: Number(r.flames ?? 0), week_points: Number(r.week_points ?? 0) }));
}

export async function getSquadMembers(groupId: string): Promise<SquadMemberDetail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_members_detail", { g: groupId });
  if (error) return [];
  return ((data ?? []) as SquadMemberDetail[]).map((r) => ({ ...r, flames: Number(r.flames ?? 0) }));
}

/** Pending join requests (empty unless I own the squad). */
export async function getJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_requests", { g: groupId });
  if (error) return [];
  return (data ?? []) as JoinRequest[];
}

/** The /join/<code> preview, or null for an unknown code. */
export async function getSquadByCode(code: string): Promise<SquadInvite | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_by_code", { p_code: code });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as SquadInvite | undefined;
  return row ? { ...row, member_count: Number(row.member_count ?? 0), join_policy: row.join_policy === "request" ? "request" : "open" } : null;
}

// ---- v2.7: squad challenges ----

/** Upcoming + active + ended-in-the-last-30-days challenges of a squad, newest first. */
export async function fetchChallenges(supabase: Client, groupId: string): Promise<Challenge[]> {
  const { data, error } = await supabase.rpc("group_challenge_list", { g: groupId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Challenge[]).map(normalizeChallenge);
}

/** The ranked board of one challenge (every squad member). */
export async function fetchChallengeBoard(supabase: Client, challengeId: string): Promise<ChallengeBoardRow[]> {
  const { data, error } = await supabase.rpc("challenge_board", { c: challengeId });
  if (error) throw new Error(error.message);
  return normalizeBoard((data ?? []) as ChallengeBoardRow[]);
}

export async function getChallenges(groupId: string): Promise<Challenge[]> {
  const supabase = await createClient();
  try {
    return await fetchChallenges(supabase, groupId);
  } catch {
    return [];
  }
}

/** One challenge (RLS: squad members only) as a list row, or null. */
export async function getChallenge(groupId: string, challengeId: string): Promise<Challenge | null> {
  const list = await getChallenges(groupId);
  return list.find((c) => c.id === challengeId) ?? null;
}

export async function getChallengeBoard(challengeId: string): Promise<ChallengeBoardRow[]> {
  const supabase = await createClient();
  try {
    return await fetchChallengeBoard(supabase, challengeId);
  } catch {
    return [];
  }
}

export { totalsFor } from "./totals";
