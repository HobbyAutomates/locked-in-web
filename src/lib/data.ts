import { addDays, today } from "./dates";
import { createClient } from "./supabase/server";
import { DEFAULT_PROFILE, type ExerciseEntry, type FoodPreset, type Meal, type MealItem, type Nudge, type Profile, type ScanHistoryItem, type Squad, type SquadMember, type WeightEntry, type Workout } from "./types";
import { parse as parseReminders } from "./reminders";
import { calorieGoalDays, longestDayRun, type BadgeProgress } from "./badges";

const PROFILE_COLS =
  "weekly_workout_target, protein_target_g, calorie_target, name, dob, gender, height_cm, weight_kg, goal_weight_kg, goal_type, goal_speed_kg_wk, step_goal, carb_target_g, fat_target_g, reminders, lens_default, share_stats";

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
    lens_default: (["protein", "goal", "snack", "cutting", "bulking"] as const).includes(d.lens_default as never) ? (d.lens_default as Profile["lens_default"]) : "protein",
    share_stats: d.share_stats !== false,
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

/** The most recent workout, for the Workout form's "Same as last time". */
export async function getLatestWorkout(): Promise<Workout | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workouts")
    .select("id, date, muscles, band_level, resistance_kg, minutes, exercises, notes")
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
export async function getMeals(from: string, to: string): Promise<(Meal & { photo_url?: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meals")
    .select("id, date, raw_text, created_at, photo_path, meal_items(id, food_id, name, grams, calories, protein_g, carbs_g, fat_g, source, confidence, micros, unit, servings, cooked_in)")
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

/** Every Indian food preset joined to its foods row (per-100 g numbers), in category + sort order. */
export async function getPresets(): Promise<FoodPreset[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_presets")
    .select("id, food_id, label, label_hi, category, servings, default_serving, sort, icon, foods(name, calories, protein_g, carbs_g, fat_g, micros)")
    .order("sort", { ascending: true });
  type Row = { id: string; food_id: string; label: string; label_hi: string | null; category: string; servings: unknown; default_serving: string | null; sort: number | null; icon: string | null; foods: { name: string; calories: unknown; protein_g: unknown; carbs_g: unknown; fat_g: unknown; micros: unknown } | null };
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
    }));
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
  const { data } = await supabase.from("groups").select("id, name, code, owner_id, created_at").in("id", ids);
  const byId = new Map(((data ?? []) as Squad[]).map((g) => [g.id, g]));
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

export { totalsFor } from "./totals";
