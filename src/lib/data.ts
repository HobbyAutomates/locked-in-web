import { addDays, today } from "./dates";
import { createClient } from "./supabase/server";
import type { Meal, MealItem, Profile, Workout } from "./types";

export async function getProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("weekly_workout_target, protein_target_g, calorie_target").maybeSingle();
  return data ?? { weekly_workout_target: 3, protein_target_g: 120, calorie_target: 2200 };
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

export async function getMeals(from: string, to: string): Promise<Meal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meals")
    .select("id, date, raw_text, created_at, meal_items(id, food_id, name, grams, calories, protein_g, carbs_g, fat_g, source, confidence)")
    .gte("date", from)
    .lte("date", to)
    .order("created_at", { ascending: false });
  return (data ?? []).map((m) => ({
    id: m.id,
    date: m.date,
    raw_text: m.raw_text,
    created_at: m.created_at,
    items: (m.meal_items ?? []) as MealItem[],
  }));
}

/** Everything the Today and Calendar screens need, in one round trip each. */
export async function getDashboard() {
  const t = today();
  const from = addDays(t, -120);
  const [profile, workouts, meals] = await Promise.all([getProfile(), getWorkouts(from, t), getMeals(from, t)]);
  return { today: t, profile, workouts, meals };
}

export { totalsFor } from "./totals";
