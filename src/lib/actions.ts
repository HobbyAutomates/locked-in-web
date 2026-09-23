"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { ONBOARD_SKIP_COOKIE } from "./onboarding";
import { bandCode, bandIntensity, bandKcal } from "./burn";
import type { Activity, DescribedExercise, MealItem, Profile, SavedMeal } from "./types";

async function userOrThrow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

export async function saveWorkout(input: {
  id?: string;
  date: string;
  muscles: string[];
  band_level: string;
  resistance_kg: number | null;
  minutes: number | null;
  exercises: string;
  notes: string;
}) {
  const { supabase, user } = await userOrThrow();
  const row = { ...input, user_id: user.id };
  const { data, error } = input.id
    ? await supabase.from("workouts").update(row).eq("id", input.id).eq("user_id", user.id).select("id").single()
    : await supabase.from("workouts").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  const workoutId = (data?.id as string | undefined) ?? input.id;
  // Auto-burn: one exercise_log row per workout, tagged with the workout id in `note`. An edit
  // replaces the row so minutes / band changes flow through to the burn. Best-effort.
  if (workoutId) {
    try {
      if (input.id) await supabase.from("exercise_log").delete().eq("user_id", user.id).eq("source", "workout").eq("note", workoutId);
      const { data: prof } = await supabase.from("profiles").select("weight_kg").eq("id", user.id).maybeSingle();
      const weight = prof?.weight_kg == null ? null : Number(prof.weight_kg);
      const minutes = Math.max(1, input.minutes ?? 30);
      await supabase.from("exercise_log").insert({
        user_id: user.id,
        date: input.date,
        activity_code: bandCode(input.band_level),
        name: `Bands: ${input.muscles.join(", ")}`,
        minutes,
        intensity: bandIntensity(input.band_level),
        kcal: bandKcal(input.band_level, weight, minutes),
        source: "workout",
        note: workoutId,
      });
    } catch {
      // The workout itself saved; a missing burn row is not worth failing the save over.
    }
  }
  revalidatePath("/", "layout");
}

export async function deleteWorkout(id: string) {
  const { supabase, user } = await userOrThrow();
  await supabase.from("exercise_log").delete().eq("user_id", user.id).eq("source", "workout").eq("note", id);
  const { error } = await supabase.from("workouts").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- exercise log (calories burned) ----

export async function saveExercise(input: {
  date: string;
  activity_code: string | null;
  name: string;
  minutes: number;
  intensity: "low" | "medium" | "high";
  kcal: number;
  source: "manual" | "describe";
}) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("exercise_log").insert({
    user_id: user.id,
    date: input.date,
    activity_code: input.activity_code,
    name: input.name,
    minutes: Math.max(1, Math.round(input.minutes)),
    intensity: input.intensity,
    kcal: Math.round(input.kcal * 10) / 10,
    source: input.source,
    note: "",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Every activity Haiku found in a description, saved as its own row. */
export async function saveDescribedExercises(date: string, items: DescribedExercise[]) {
  const { supabase, user } = await userOrThrow();
  const rows = items
    .filter((i) => i.kcal > 0)
    .map((i) => ({
      user_id: user.id,
      date,
      activity_code: i.activity_code,
      name: i.name,
      minutes: Math.max(1, Math.round(i.minutes)),
      intensity: i.intensity,
      kcal: Math.round(i.kcal * 10) / 10,
      source: "describe",
      note: "",
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("exercise_log").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteExercise(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("exercise_log").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Codes shown before the user types anything: the everyday picks. */
const POPULAR_ACTIVITIES = ["LI-17190", "LI-17200", "LI-17133", "12150", "LI-15150", "LI-15030", "LI-02101", "LI-15551", "01015", "02020", "02040", "LI-05010"];

/** Activity search: name / description substring or an exact tag. Blank query → the popular set. */
export async function searchActivities(q: string): Promise<Activity[]> {
  const { supabase } = await userOrThrow();
  const term = q.trim().toLowerCase().replace(/[^a-z0-9 -]/g, "");
  const cols = "code, name, description, met, category, tags";
  if (!term) {
    const { data } = await supabase.from("activities").select(cols).in("code", POPULAR_ACTIVITIES);
    const rows = (data ?? []) as Activity[];
    return rows.map((r) => ({ ...r, met: Number(r.met), tags: r.tags ?? [] })).sort((a, b) => POPULAR_ACTIVITIES.indexOf(a.code) - POPULAR_ACTIVITIES.indexOf(b.code));
  }
  const { data } = await supabase
    .from("activities")
    .select(cols)
    .or(`name.ilike.*${term}*,description.ilike.*${term}*,tags.cs.{${term}}`)
    .order("name")
    .order("met")
    .limit(40);
  return ((data ?? []) as Activity[]).map((r) => ({ ...r, met: Number(r.met), tags: r.tags ?? [] }));
}

export async function saveMeal(input: { date: string; raw_text: string; items: MealItem[]; photo_path?: string | null }) {
  const { supabase, user } = await userOrThrow();
  const { data: meal, error } = await supabase
    .from("meals")
    .insert({ user_id: user.id, date: input.date, raw_text: input.raw_text, photo_path: input.photo_path ?? null })
    .select("id")
    .single();
  if (error || !meal) throw new Error(error?.message ?? "Could not save meal");
  const items = input.items
    .filter((i) => i.grams > 0)
    .map((i) => ({
      meal_id: meal.id,
      user_id: user.id,
      food_id: i.food_id,
      name: i.name,
      grams: i.grams,
      calories: i.calories,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
      source: i.source,
      confidence: i.confidence,
      micros: i.micros ?? {},
    }));
  if (items.length) {
    const { error: e2 } = await supabase.from("meal_items").insert(items);
    if (e2) throw new Error(e2.message);
  }
  revalidatePath("/", "layout");
}

export async function deleteMeal(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("meals").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- profile ----

/** Columns a client may write; anything else in the patch is dropped. */
const PROFILE_KEYS: (keyof Profile)[] = [
  "weekly_workout_target",
  "protein_target_g",
  "calorie_target",
  "name",
  "dob",
  "gender",
  "height_cm",
  "weight_kg",
  "goal_weight_kg",
  "goal_type",
  "goal_speed_kg_wk",
  "step_goal",
  "carb_target_g",
  "fat_target_g",
  "reminders",
];

/** Upserts the given profile columns for the signed-in user (a partial patch is fine). */
export async function saveProfile(patch: Partial<Profile>) {
  const { supabase, user } = await userOrThrow();
  const row: Record<string, unknown> = { id: user.id };
  for (const k of PROFILE_KEYS) if (k in patch) row[k] = patch[k];
  if (typeof row.name === "string") row.name = row.name.trim().slice(0, 40);
  const { error } = await supabase.from("profiles").upsert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Kept for older callers: the three classic targets. */
export async function saveTargets(p: Pick<Profile, "weekly_workout_target" | "protein_target_g" | "calorie_target">) {
  await saveProfile(p);
}

/** Onboarding's last screen: the whole profile plus the generated targets, in one go. */
export async function completeOnboarding(patch: Partial<Profile>) {
  await saveProfile(patch);
  const jar = await cookies();
  jar.delete(ONBOARD_SKIP_COOKIE);
}

/** "Skip for now": stay out of onboarding for 30 days on this device. */
export async function skipOnboarding() {
  const jar = await cookies();
  jar.set(ONBOARD_SKIP_COOKIE, "1", { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", httpOnly: true });
}

// ---- weight log ----

/** Logs a weigh-in and mirrors it onto `profiles.weight_kg` so every screen agrees. */
export async function logWeight(input: { date: string; weight_kg: number; note: string }) {
  const { supabase, user } = await userOrThrow();
  const kg = Math.round(Number(input.weight_kg) * 10) / 10;
  if (!Number.isFinite(kg) || kg < 20 || kg > 300) throw new Error("Enter a weight between 20 and 300 kg");
  const { error } = await supabase.from("weight_log").insert({ user_id: user.id, date: input.date, weight_kg: kg, note: input.note.trim().slice(0, 80) || null });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from("profiles").upsert({ id: user.id, weight_kg: kg });
  if (e2) throw new Error(e2.message);
  revalidatePath("/", "layout");
}

export async function deleteWeight(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("weight_log").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Repeat meals: the one-tap cards at the top of the Meal form. */
export async function listSavedMeals(): Promise<SavedMeal[]> {
  const { supabase, user } = await userOrThrow();
  const { data, error } = await supabase
    .from("saved_meals")
    .select("id, name, items, calories, protein_g")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name ?? "") as string,
    items: ((r.items ?? []) as MealItem[]),
    calories: Number(r.calories ?? 0),
    protein_g: Number(r.protein_g ?? 0),
  }));
}

export async function createSavedMeal(input: { name: string; items: MealItem[] }) {
  const { supabase, user } = await userOrThrow();
  const calories = input.items.reduce((a, i) => a + Number(i.calories), 0);
  const protein = input.items.reduce((a, i) => a + Number(i.protein_g), 0);
  const { error } = await supabase.from("saved_meals").insert({
    user_id: user.id,
    name: input.name,
    items: input.items,
    calories: Math.round(calories * 10) / 10,
    protein_g: Math.round(protein * 10) / 10,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteSavedMeal(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("saved_meals").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Remove one scan from History. */
export async function deleteScan(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("label_scans").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/scan");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
