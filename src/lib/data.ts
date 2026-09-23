import { addDays, today } from "./dates";
import { createClient } from "./supabase/server";
import type { ExerciseEntry, Meal, MealItem, Profile, ScanHistoryItem, Workout } from "./types";

export async function getProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("weekly_workout_target, protein_target_g, calorie_target, weight_kg").maybeSingle();
  if (!data) return { weekly_workout_target: 3, protein_target_g: 120, calorie_target: 2200, weight_kg: null };
  return { ...data, weight_kg: data.weight_kg == null ? null : Number(data.weight_kg) } as Profile;
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
