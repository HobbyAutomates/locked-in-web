import { addDays, today } from "./dates";
import { createClient } from "./supabase/server";
import { DEFAULT_PROFILE, type ExerciseEntry, type Meal, type MealItem, type Profile, type ScanHistoryItem, type WeightEntry, type Workout } from "./types";
import { parse as parseReminders } from "./reminders";
import { calorieGoalDays, longestDayRun, type BadgeProgress } from "./badges";

const PROFILE_COLS =
  "weekly_workout_target, protein_target_g, calorie_target, name, dob, gender, height_cm, weight_kg, goal_weight_kg, goal_type, goal_speed_kg_wk, step_goal, carb_target_g, fat_target_g, reminders";

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

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
    .select("id, date, activity_code, name, minutes, intensity, kcal, source, note, created_at")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ ...r, kcal: Number(r.kcal), minutes: Number(r.minutes), note: r.note ?? "" })) as ExerciseEntry[];
}

export async function getWorkouts(from: string, to: string): Promise<Workout[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select("id, date, muscles, band_level, resistance_kg, minutes, exercises, notes")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });
  return (data ?? []) as Workout[];
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select("id, date, muscles, band_level, resistance_kg, minutes, exercises, notes")
    .eq("id", id)
    .maybeSingle();
  return (data as Workout) ?? null;
}

/** Meals with items; `photo_path` becomes a 1-hour signed URL in `photo_url` when a photo exists. */
export async function getMeals(from: string, to: string): Promise<(Meal & { photo_url?: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meals")
    .select("id, date, raw_text, created_at, photo_path, meal_items(id, food_id, name, grams, calories, protein_g, carbs_g, fat_g, source, confidence, micros)")
    .gte("date", from)
    .lte("date", to)
    .order("created_at", { ascending: false });
  const meals = (data ?? []).map((m) => ({
    id: m.id as string,
    date: m.date as string,
    raw_text: m.raw_text as string,
    created_at: m.created_at as string,
    photo_path: (m.photo_path as string | null) ?? null,
    items: (m.meal_items ?? []) as MealItem[],
    photo_url: null as string | null,
  }));
  const paths = meals.filter((m) => m.photo_path).map((m) => m.photo_path as string);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("meal-photos").createSignedUrls(paths, 3600);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const m of meals) if (m.photo_path) m.photo_url = byPath.get(m.photo_path) ?? null;
  }
  return meals;
}

/** Everything the Today and Calendar screens need, in one round trip each. */
export async function getDashboard() {
  const t = today();
  const from = addDays(t, -120);
  const [profile, workouts, meals, exercises] = await Promise.all([getProfile(), getWorkouts(from, t), getMeals(from, t), getExercises(from, t)]);
  return { today: t, profile, workouts, meals, exercises };
}

/** Latest scans for the History list (label / barcode / photo), newest first. */
export async function getScans(limit = 30): Promise<ScanHistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("label_scans").select("id, kind, lens, product, verdict, created_at, image_path, report").order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as { id: string; kind: string | null; lens: string | null; product: string; verdict: string; created_at: string; image_path: string | null; report: Record<string, unknown> }[];
  const paths = rows.filter((r) => r.image_path).map((r) => r.image_path as string);
  const byPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("meal-photos").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.signedUrl) byPath.set(s.path ?? "", s.signedUrl);
  }
  return rows.map((r) => {
    const info = (r.report?.infographic ?? null) as { score_out_of_10?: number } | null;
    return {
      id: r.id,
      kind: (r.kind ?? "label") as ScanHistoryItem["kind"],
      lens: r.lens ?? "protein",
      product: r.product,
      verdict: r.verdict,
      created_at: r.created_at,
      score: info?.score_out_of_10 ?? null,
      image_url: (r.report?.image_url as string | undefined) ?? (r.image_path ? byPath.get(r.image_path) ?? null : null),
      image_path: r.image_path,
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

export { totalsFor } from "./totals";
