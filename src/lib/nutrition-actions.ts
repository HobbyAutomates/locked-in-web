"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { addDays, today as todayIso } from "./dates";
import { getExercises, getFoodUsage, getMeals, getPresets, getProfile } from "./data";
import { getNutritionSettings } from "./nutrition-data";
import { ageYears, capToFloor, floorFor, type Targets } from "./goals";
import { NOT_FOR_TEENS, dietTargets, isDietMode, modeAllowed, type DietMode } from "./dietModes";
import { clampHours } from "./fasting";
import { perServing, recipeFromRow, recipeMealItem, type RecipeIngredient } from "./recipes";
import { suggestFoods, usualPicks, remainingFrom, type Remaining, type Suggestion } from "./whatToEat";
import { calorieBudget, totalsFor } from "./totals";
import { defaultMealType, isMealType, missingMealTypeColumn, type MealType } from "./mealType";
import { carbTargetG, fatTargetG } from "./types";
import { COMING_SOON, missingV36 } from "./v36";
import { saveMeal } from "./actions";

/**
 * v2.13 nutrition writes. Like the workout actions, these hand back `{ ok: false, error }` instead
 * of throwing, so the message survives production (Next hides thrown Server Action errors). A
 * missing schema_v36 table / column comes back as "Coming with the next update".
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const fail = (error: { message?: string; code?: string } | null | undefined, fallback: string): { ok: false; error: string } => ({ ok: false, error: missingV36(error) ? COMING_SOON : error?.message || fallback });

// ---------------------------------------------------------------- diet modes

export type DietSnapshot = { mode: DietMode; targets: Targets };

/**
 * Switch the diet mode: macros are recalculated for the current calories (which never change).
 * Returns what was there before, so the screen can offer Undo.
 */
export async function setDietMode(mode: DietMode): Promise<Result<{ previous: DietSnapshot; next: DietSnapshot }>> {
  if (!isDietMode(mode)) return { ok: false, error: "Pick a diet from the list" };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const [profile, settings] = await Promise.all([getProfile(), getNutritionSettings()]);
  if (!settings.available) return { ok: false, error: COMING_SOON };
  if (!modeAllowed(mode, ageYears(profile.dob))) return { ok: false, error: NOT_FOR_TEENS };
  const previous: DietSnapshot = { mode: settings.diet_mode, targets: { calories: profile.calorie_target, protein: profile.protein_target_g, carbs: carbTargetG(profile), fat: fatTargetG(profile) } };
  const t = dietTargets(profile, profile.calorie_target, mode);
  const { error } = await supabase.from("profiles").update({ diet_mode: mode, protein_target_g: t.protein, carb_target_g: t.carbs, fat_target_g: t.fat }).eq("id", user.id);
  if (error) return fail(error, "Could not switch the diet");
  revalidatePath("/", "layout");
  return { ok: true, previous, next: { mode, targets: t } };
}

/** Undo a switch: the old mode and the old macro targets exactly as they were. */
export async function restoreDiet(snapshot: DietSnapshot): Promise<Result> {
  if (!isDietMode(snapshot.mode)) return { ok: false, error: "Nothing to undo" };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const t = snapshot.targets;
  const { error } = await supabase
    .from("profiles")
    .update({ diet_mode: snapshot.mode, protein_target_g: Math.round(t.protein), carb_target_g: Math.round(t.carbs), fat_target_g: Math.round(t.fat) })
    .eq("id", user.id);
  if (error) return fail(error, "Could not undo that");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- adaptive targets

export async function setAdaptiveTargets(on: boolean): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("profiles").update({ adaptive_targets: !!on }).eq("id", user.id);
  if (error) return fail(error, "Could not save that");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * "Apply" on a check-in: calorie_target = new_target (never under today's floor), macros
 * recomputed for the diet mode, and the check-in marked applied. Nothing else is ever automatic.
 */
export async function applyCheckin(id: string): Promise<Result<{ calories: number }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("weekly_checkins").select("id, new_target, applied").eq("id", id).maybeSingle();
  if (error) return fail(error, "Could not load the check-in");
  if (!data?.new_target) return { ok: false, error: "That check-in is gone" };
  const [profile, settings] = await Promise.all([getProfile(), getNutritionSettings()]);
  const cap = capToFloor(Number(data.new_target), floorFor(profile));
  const t = dietTargets(profile, cap.calories, settings.diet_mode);
  const up = await supabase.from("profiles").update({ calorie_target: t.calories, protein_target_g: t.protein, carb_target_g: t.carbs, fat_target_g: t.fat }).eq("id", user.id);
  if (up.error) return fail(up.error, "Could not update your target");
  const mark = await supabase.from("weekly_checkins").update({ applied: true }).eq("id", id);
  if (mark.error) return fail(mark.error, "Updated your target, but couldn't mark the check-in");
  revalidatePath("/", "layout");
  return { ok: true, calories: t.calories };
}

// ---------------------------------------------------------------- fasting

export async function setFastingHours(hours: number): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("profiles").update({ fasting_hours: clampHours(hours) }).eq("id", user.id);
  if (error) return fail(error, "Could not save that");
  return { ok: true };
}

async function fastingAllowed(): Promise<string | null> {
  const profile = await getProfile();
  const age = ageYears(profile.dob);
  return age != null && age < 18 ? "Not available under 18" : null;
}

export async function startFast(targetHours: number, startedAt?: string): Promise<Result<{ id: string; started_at: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const blocked = await fastingAllowed();
  if (blocked) return { ok: false, error: blocked };
  const open = await supabase.from("fasting_sessions").select("id").is("ended_at", null).limit(1);
  if (open.error) return fail(open.error, "Could not start the fast");
  if (open.data?.length) return { ok: false, error: "A fast is already running" };
  const start = startedAt && !Number.isNaN(Date.parse(startedAt)) && Date.parse(startedAt) <= Date.now() ? new Date(startedAt).toISOString() : new Date().toISOString();
  const { data, error } = await supabase.from("fasting_sessions").insert({ user_id: user.id, started_at: start, target_hours: clampHours(targetHours) }).select("id, started_at").single();
  if (error || !data) return fail(error, "Could not start the fast");
  revalidatePath("/", "layout");
  return { ok: true, id: data.id as string, started_at: data.started_at as string };
}

export async function endFast(id: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("fasting_sessions").update({ ended_at: new Date().toISOString() }).eq("id", id).is("ended_at", null);
  if (error) return fail(error, "Could not end the fast");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteFast(id: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("fasting_sessions").delete().eq("id", id);
  if (error) return fail(error, "Could not delete that");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- recipes

export type RecipeInput = { id?: string | null; name: string; servings: number; cooked_weight_g: number | null; items: RecipeIngredient[]; note?: string | null };

export async function saveRecipe(input: RecipeInput): Promise<Result<{ id: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the recipe a name" };
  const items = (input.items ?? []).filter((i) => i && i.name && Number(i.grams) > 0).slice(0, 60);
  if (!items.length) return { ok: false, error: "Add at least one ingredient" };
  const servings = Math.min(100, Math.max(0.25, Math.round((Number(input.servings) || 1) * 4) / 4));
  const cooked = input.cooked_weight_g && Number(input.cooked_weight_g) > 0 ? Math.min(99999, Math.round(Number(input.cooked_weight_g) * 10) / 10) : null;
  const row = { user_id: user.id, name, servings, cooked_weight_g: cooked, items, per_serving: perServing(items, servings, cooked), note: input.note?.trim().slice(0, 300) || null, updated_at: new Date().toISOString() };
  const res = input.id ? await supabase.from("recipes").update(row).eq("id", input.id).select("id").single() : await supabase.from("recipes").insert(row).select("id").single();
  if (res.error || !res.data) return fail(res.error, "Could not save the recipe");
  revalidatePath("/recipes");
  return { ok: true, id: res.data.id as string };
}

export async function deleteRecipe(id: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) return fail(error, "Could not delete the recipe");
  revalidatePath("/recipes");
  return { ok: true };
}

/** Recipes for the Log screen's "Recipes" chip (loaded on demand). */
export async function listRecipes(): Promise<Result<{ recipes: ReturnType<typeof recipeFromRow>[] }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("recipes").select("id, name, servings, cooked_weight_g, items, per_serving, note, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (error) return fail(error, "Could not load your recipes");
  return { ok: true, recipes: (data ?? []).map((r) => recipeFromRow(r as Record<string, unknown>)) };
}

/** "Log a serving": the recipe as one meal item, source "Your recipe". */
export async function logRecipe(input: { id: string; servings: number; mealType?: MealType | null; date?: string }): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("recipes").select("id, name, servings, cooked_weight_g, items, per_serving, note, updated_at").eq("id", input.id).maybeSingle();
  if (error) return fail(error, "Could not load the recipe");
  if (!data) return { ok: false, error: "That recipe is gone" };
  const r = recipeFromRow(data as Record<string, unknown>);
  const n = Math.min(20, Math.max(0.25, Number(input.servings) || 1));
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && input.date <= todayIso() ? input.date : todayIso();
  try {
    await saveMeal({ date, raw_text: `${r.name} (your recipe)`, items: [recipeMealItem(r, n)], meal_type: isMealType(input.mealType) ? input.mealType : defaultMealType() });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not log that" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- move a meal between meal times

export async function moveMeal(id: string, type: MealType): Promise<Result> {
  if (!isMealType(type)) return { ok: false, error: "Pick a meal" };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("meals").update({ meal_type: type }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: missingMealTypeColumn(error) ? COMING_SOON : error.message || "Could not move that meal" };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- what should I eat?

export type WhatToEat = { remaining: Remaining; mode: DietMode; mealType: MealType; suggestions: Suggestion[]; usual: Suggestion[]; hideNumbers: boolean };

/** Today's remaining macros, the diet mode and the ranked picks, in one call (Home and the Log screen). */
export async function loadWhatToEat(date?: string): Promise<Result<WhatToEat>> {
  const { user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const t = todayIso();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= t ? date : t;
  const [profile, settings, meals, exercises, presets, usage] = await Promise.all([getProfile(), getNutritionSettings(), getMeals(addDays(day, -1), day), getExercises(day, day), getPresets(), getFoodUsage()]);
  const budget = calorieBudget(profile, meals, exercises, day);
  const remaining = remainingFrom({ kcal: budget.budget, protein: profile.protein_target_g, carbs: carbTargetG(profile), fat: fatTargetG(profile) }, totalsFor(meals, day));
  const mode = settings.diet_mode;
  const mealType = defaultMealType();
  const suggestions = suggestFoods({ remaining, mode, mealType, presets });
  const usual = usualPicks({ remaining, mode, mealType, presets, usage, exclude: suggestions.map((s) => s.id) });
  return { ok: true, remaining, mode, mealType, suggestions, usual, hideNumbers: profile.hide_numbers === true };
}
