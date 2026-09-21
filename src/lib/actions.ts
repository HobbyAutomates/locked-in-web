"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { MealItem, Profile, SavedMeal } from "./types";

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
  const { error } = input.id
    ? await supabase.from("workouts").update(row).eq("id", input.id).eq("user_id", user.id)
    : await supabase.from("workouts").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteWorkout(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("workouts").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function saveMeal(input: { date: string; raw_text: string; items: MealItem[] }) {
  const { supabase, user } = await userOrThrow();
  const { data: meal, error } = await supabase
    .from("meals")
    .insert({ user_id: user.id, date: input.date, raw_text: input.raw_text })
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

export async function saveTargets(p: Profile) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("profiles").upsert({ id: user.id, ...p });
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
