"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveMeal } from "@/lib/actions";
import { addDays, today as todayIso } from "@/lib/dates";
import { getMeals, getMySquads, getSquadMembers } from "@/lib/data";
import { defaultMealType, isMealType, type MealType } from "@/lib/mealType";
import { perServing, recipeFromRow } from "@/lib/recipes";
import type { MealItem } from "@/lib/types";
import { HOME_RECIPES, homeRecipeAsOwn, homeRecipeItem } from "./homeRecipes";
import { leftoverActive, splitShares, type LeftoverRow } from "./foodBits";
import { groceryList, pantryCategory, type DietKind, type GroceryItem, type PantryRow } from "./grocery";

/**
 * v2.18 Area A writes and reads (schema_v42). Like nutrition-actions, every call hands back
 * `{ ok: false, error }` instead of throwing, and a missing v42 table / column comes back as
 * `unavailable: true` so the feature hides instead of breaking.
 */

export type FoodResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; unavailable?: boolean };

export const FOOD_SOON = "Coming with the next update";

function missing(error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204", "42883", "PGRST202"].includes(error.code ?? "")) return true;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /could not find the (table|column|function)|does not exist|schema cache/i.test(text);
}

function fail(error: { code?: string; message?: string } | null | undefined, fallback: string): { ok: false; error: string; unavailable?: boolean } {
  return missing(error) ? { ok: false, error: FOOD_SOON, unavailable: true } : { ok: false, error: error?.message || fallback };
}

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const cleanItems = (items: MealItem[]) =>
  (items ?? [])
    .filter((i) => i && i.name && Number(i.grams) > 0)
    .slice(0, 30)
    .map((i) => {
      const { id: _id, image_url: _img, variants: _v, source_info: _s, ...rest } = i;
      void _id;
      void _img;
      void _v;
      void _s;
      return rest;
    });
const kcalOf = (items: MealItem[]) => Math.round(items.reduce((a, i) => a + (Number(i.calories) || 0), 0));
const safeDate = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayIso() ? d : todayIso());

// ---------------------------------------------------------------- Home extras

export type PendingSplit = { id: string; from_name: string | null; dish: string; items: MealItem[]; kcal: number; share: number; date: string; meal_type: MealType | null; created_at: string };
export type FoodHome = { leftovers: LeftoverRow[] | null; splits: PendingSplit[] | null; waterFromFood: boolean | null };

/** Leftovers still worth suggesting, splits waiting for me, and the water-from-food switch (each null = not applied). */
export async function loadFoodHome(): Promise<FoodHome> {
  const { supabase, user } = await me();
  if (!user) return { leftovers: null, splits: null, waterFromFood: null };
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString();
  const [lo, sp, pr] = await Promise.all([
    supabase.from("leftovers").select("id, name, items, kcal, fraction_left, created_at, used_at, dismissed_at").eq("user_id", user.id).is("used_at", null).is("dismissed_at", null).gte("created_at", since).order("created_at", { ascending: false }).limit(5),
    supabase.from("meal_splits").select("id, from_name, dish, items, kcal, share, date, meal_type, created_at").eq("to_user", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("water_from_food").eq("id", user.id).maybeSingle(),
  ]);
  return {
    leftovers: lo.error ? null : ((lo.data ?? []) as LeftoverRow[]).filter((r) => leftoverActive(r)),
    splits: sp.error ? null : ((sp.data ?? []) as PendingSplit[]).map((r) => ({ ...r, share: Number(r.share), meal_type: isMealType(r.meal_type) ? r.meal_type : null })),
    waterFromFood: pr.error ? null : (pr.data as { water_from_food?: boolean } | null)?.water_from_food === true,
  };
}

// ---------------------------------------------------------------- A6 leftovers

export async function saveLeftover(input: { name: string; items: MealItem[]; fraction_left: number; meal_id?: string | null }): Promise<FoodResult<{ id: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const items = cleanItems(input.items);
  const f = Number(input.fraction_left);
  if (!items.length || !(f > 0 && f < 1)) return { ok: false, error: "Nothing left over" };
  const row = { user_id: user.id, name: input.name.trim().slice(0, 120) || items[0].name, items, kcal: kcalOf(items), fraction_left: Math.round(f * 1000) / 1000, meal_id: input.meal_id ?? null };
  const { data, error } = await supabase.from("leftovers").insert(row).select("id").single();
  if (error || !data) return fail(error, "Could not save the leftovers");
  revalidatePath("/", "layout");
  return { ok: true, id: data.id as string };
}

/** "Log leftovers": the rest as a meal (into the meal slot the hour rule picks), then it's used. */
export async function logLeftover(id: string, mealType?: MealType | null): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("leftovers").select("id, name, items, used_at").eq("id", id).maybeSingle();
  if (error) return fail(error, "Could not load the leftovers");
  if (!data || data.used_at) return { ok: false, error: "Already logged" };
  try {
    await saveMeal({ date: todayIso(), raw_text: `${data.name} (leftovers)`, items: data.items as MealItem[], meal_type: isMealType(mealType) ? mealType : defaultMealType() });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not log that" };
  }
  await supabase.from("leftovers").update({ used_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function dismissLeftover(id: string): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("leftovers").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error, "Could not hide that");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- A7 meal split

export type SplitPerson = { id: string; name: string; squad: string };

/** Everyone I share a squad with (deduped), for the split sheet. */
export async function listSplitPeople(): Promise<FoodResult<{ people: SplitPerson[] }>> {
  const { user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const squads = await getMySquads();
  const seen = new Map<string, SplitPerson>();
  const lists = await Promise.all(squads.slice(0, 8).map(async (s) => ({ s, members: await getSquadMembers(s.id) })));
  for (const { s, members } of lists) for (const m of members) if (m.id !== user.id && !seen.has(m.id)) seen.set(m.id, { id: m.id, name: m.name || m.username || "Squadmate", squad: s.name });
  return { ok: true, people: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * Log my share of a dish and send each squadmate theirs as a pending entry. `shares[0]` is mine;
 * `people[i]` gets `shares[i + 1]`; `others` (family not on the app) only take a share away from me.
 */
export async function logSplit(input: { dish: string; items: MealItem[]; shares: number[]; people: string[]; date?: string; meal_type?: MealType | null; photo_path?: string | null }): Promise<FoodResult<{ sent: number; mealId: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const items = cleanItems(input.items);
  if (!items.length) return { ok: false, error: "Nothing to split" };
  const parts = splitShares(items, input.shares);
  const date = safeDate(input.date);
  const meal_type = isMealType(input.meal_type) ? input.meal_type : defaultMealType();
  let mealId = "";
  try {
    const saved = await saveMeal({ date, raw_text: `${input.dish} (my share)`, items: parts[0], meal_type, photo_path: input.photo_path ?? null });
    mealId = saved.id;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not log your share" };
  }
  const people = (input.people ?? []).slice(0, 12);
  if (!people.length) return { ok: true, sent: 0, mealId };
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const fromName = String((prof as { name?: string } | null)?.name ?? "").trim() || null;
  const shares = parts.slice(1);
  const total = input.shares.reduce((a, s) => a + (s > 0 ? s : 0), 0) || 1;
  const rows = people
    .map((to, i) => ({ to, it: shares[i], share: (input.shares[i + 1] ?? 0) / total }))
    .filter((r) => r.it && r.share > 0)
    .map((r) => ({ from_user: user.id, to_user: r.to, from_name: fromName, dish: input.dish.trim().slice(0, 120) || "A shared dish", items: r.it, kcal: kcalOf(r.it), share: Math.round(r.share * 10000) / 10000, date, meal_type }));
  if (!rows.length) return { ok: true, sent: 0, mealId };
  const { error } = await supabase.from("meal_splits").insert(rows);
  if (error) {
    const f = fail(error, "Your share is logged, but the split couldn't be sent");
    return { ...f, error: f.unavailable ? "Your share is logged. Splitting with squadmates is coming with the next update." : f.error };
  }
  revalidatePath("/", "layout");
  return { ok: true, sent: rows.length, mealId };
}

/** Accept (log it into my day) or decline a split someone sent me. */
export async function decideSplit(id: string, accept: boolean, mealType?: MealType | null): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("meal_splits").select("id, dish, items, date, meal_type, status, from_name").eq("id", id).eq("to_user", user.id).maybeSingle();
  if (error) return fail(error, "Could not load that");
  if (!data || data.status !== "pending") return { ok: false, error: "Already done" };
  if (accept) {
    try {
      const slot = isMealType(mealType) ? mealType : isMealType(data.meal_type) ? data.meal_type : defaultMealType();
      await saveMeal({ date: safeDate(data.date as string), raw_text: `${data.dish} (shared${data.from_name ? ` by ${data.from_name}` : ""})`, items: data.items as MealItem[], meal_type: slot });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not log that" };
    }
  }
  const { error: e2 } = await supabase.from("meal_splits").update({ status: accept ? "accepted" : "declined", decided_at: new Date().toISOString() }).eq("id", id);
  if (e2) return fail(e2, "Could not update that");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- A2 recipes: library, share, copy

/** "Log" a library recipe by servings (one tap). */
export async function logHomeRecipe(input: { id: string; servings: number; mealType?: MealType | null }): Promise<FoodResult> {
  const r = HOME_RECIPES.find((x) => x.id === input.id);
  if (!r) return { ok: false, error: "That recipe isn't in the library" };
  const n = Math.min(10, Math.max(0.5, Math.round((Number(input.servings) || 1) * 2) / 2));
  try {
    await saveMeal({ date: todayIso(), raw_text: `${r.name} (ghar ka khana)`, items: [homeRecipeItem(r, n)], meal_type: isMealType(input.mealType) ? input.mealType : defaultMealType() });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not log that" };
  }
  return { ok: true };
}

/** "Make it mine": a library entry copied into the person's own recipes. */
export async function copyHomeRecipe(id: string): Promise<FoodResult<{ id: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const r = HOME_RECIPES.find((x) => x.id === id);
  if (!r) return { ok: false, error: "That recipe isn't in the library" };
  const own = homeRecipeAsOwn(r);
  const { data, error } = await supabase.from("recipes").insert({ user_id: user.id, ...own, updated_at: new Date().toISOString() }).select("id").single();
  if (error || !data) return fail(error, "Could not save the recipe");
  revalidatePath("/recipes");
  return { ok: true, id: data.id as string };
}

export type SharedRecipe = { id: string; group_id: string; squad: string; author_name: string | null; name: string; servings: number; per_serving: { kcal: number; protein_g: number }; created_at: string; mine: boolean };

/** Share one of my recipes into a squad (a snapshot), plus a chat line, best effort. */
export async function shareRecipe(recipeId: string, groupId: string): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("recipes").select("id, name, servings, cooked_weight_g, items, per_serving, note, updated_at").eq("id", recipeId).maybeSingle();
  if (error || !data) return fail(error, "That recipe is gone");
  const r = recipeFromRow(data as Record<string, unknown>);
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const author = String((prof as { name?: string } | null)?.name ?? "").trim() || null;
  const { error: e2 } = await supabase.from("shared_recipes").insert({ group_id: groupId, user_id: user.id, author_name: author, name: r.name, servings: r.servings, cooked_weight_g: r.cooked_weight_g, items: r.items, per_serving: r.per_serving, note: r.note });
  if (e2) return fail(e2, "Could not share it");
  // The squad chat hears about it (a plain message post; no new post kinds).
  await supabase.from("group_posts").insert({ group_id: groupId, user_id: user.id, kind: "message", body: `Shared a recipe: ${r.name} (${r.per_serving.kcal} kcal, ${r.per_serving.protein_g} g protein a serving). Find it in Recipes.` });
  revalidatePath("/recipes");
  return { ok: true };
}

export async function listSharedRecipes(): Promise<FoodResult<{ recipes: SharedRecipe[]; squads: { id: string; name: string }[] }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const squads = await getMySquads();
  if (!squads.length) return { ok: true, recipes: [], squads: [] };
  const names = new Map(squads.map((s) => [s.id, s.name]));
  const { data, error } = await supabase.from("shared_recipes").select("id, group_id, user_id, author_name, name, servings, per_serving, created_at").in("group_id", squads.map((s) => s.id)).order("created_at", { ascending: false }).limit(40);
  if (error) return fail(error, "Could not load squad recipes");
  const recipes = (data ?? []).map((r) => {
    const ps = (r.per_serving ?? {}) as { kcal?: number; protein_g?: number };
    return { id: r.id as string, group_id: r.group_id as string, squad: names.get(r.group_id as string) ?? "Squad", author_name: (r.author_name as string | null) ?? null, name: r.name as string, servings: Number(r.servings) || 1, per_serving: { kcal: Math.round(Number(ps.kcal) || 0), protein_g: Math.round((Number(ps.protein_g) || 0) * 10) / 10 }, created_at: r.created_at as string, mine: r.user_id === user.id };
  });
  return { ok: true, recipes, squads: squads.map((s) => ({ id: s.id, name: s.name })) };
}

/** Save a squadmate's shared recipe into my own recipes. */
export async function copySharedRecipe(id: string): Promise<FoodResult<{ id: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("shared_recipes").select("name, servings, cooked_weight_g, items, per_serving, note, author_name").eq("id", id).maybeSingle();
  if (error || !data) return fail(error, "That recipe is gone");
  const items = Array.isArray(data.items) ? data.items : [];
  const servings = Number(data.servings) || 1;
  const cooked = data.cooked_weight_g == null ? null : Number(data.cooked_weight_g) || null;
  const row = { user_id: user.id, name: String(data.name).slice(0, 60), servings, cooked_weight_g: cooked, items, per_serving: perServing(items, servings, cooked), note: [data.note, data.author_name ? `Shared by ${data.author_name}.` : null].filter(Boolean).join(" ") || null, updated_at: new Date().toISOString() };
  const res = await supabase.from("recipes").insert(row).select("id").single();
  if (res.error || !res.data) return fail(res.error, "Could not save it");
  revalidatePath("/recipes");
  return { ok: true, id: res.data.id as string };
}

// ---------------------------------------------------------------- A10 water from food

export async function setWaterFromFood(on: boolean): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("profiles").update({ water_from_food: on }).eq("id", user.id);
  if (error) return fail(error, "Could not change that");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- A11 pantry + grocery

export type PantryItem = PantryRow & { id: string; qty: string | null; category: string | null };

export async function listPantry(): Promise<FoodResult<{ items: PantryItem[] }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.from("pantry_items").select("id, name, qty, category, in_stock").order("name");
  if (error) return fail(error, "Could not load the pantry");
  return { ok: true, items: (data ?? []) as PantryItem[] };
}

export async function upsertPantry(input: { name: string; qty?: string | null; in_stock?: boolean }): Promise<FoodResult<{ item: PantryItem }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name it first" };
  const { data: existing, error: e0 } = await supabase.from("pantry_items").select("id").ilike("name", name.replace(/[%_]/g, "")).maybeSingle();
  if (e0 && missing(e0)) return fail(e0, "");
  const row = { user_id: user.id, name, qty: input.qty?.trim().slice(0, 30) || null, category: pantryCategory(name), in_stock: input.in_stock !== false, updated_at: new Date().toISOString() };
  const res = existing ? await supabase.from("pantry_items").update(row).eq("id", existing.id).select("id, name, qty, category, in_stock").single() : await supabase.from("pantry_items").insert(row).select("id, name, qty, category, in_stock").single();
  if (res.error || !res.data) return fail(res.error, "Could not save that");
  return { ok: true, item: res.data as PantryItem };
}

export async function setPantryStock(id: string, inStock: boolean): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("pantry_items").update({ in_stock: inStock, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error, "Could not change that");
  return { ok: true };
}

export async function deletePantry(id: string): Promise<FoodResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("pantry_items").delete().eq("id", id);
  if (error) return fail(error, "Could not remove that");
  return { ok: true };
}

/** The weekly list from the last 14 days of logs, the protein target and the pantry (pantry optional). */
export async function loadGrocery(): Promise<FoodResult<{ list: GroceryItem[]; days: number; avgProtein: number; proteinTarget: number; pantryAvailable: boolean }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const to = todayIso();
  const from = addDays(to, -13);
  const [meals, prof, pantry, mode] = await Promise.all([
    getMeals(from, to),
    supabase.from("profiles").select("protein_target_g").eq("id", user.id).maybeSingle(),
    supabase.from("pantry_items").select("name, in_stock"),
    supabase.from("profiles").select("diet_mode").eq("id", user.id).maybeSingle(),
  ]);
  const days = Math.max(1, new Set(meals.map((m) => m.date)).size);
  const eaten = meals.flatMap((m) => m.items.map((i) => ({ name: i.name, grams: Number(i.grams) || 0 })));
  const protein = meals.reduce((a, m) => a + m.items.reduce((b, i) => b + (Number(i.protein_g) || 0), 0), 0);
  const avgProtein = Math.round(protein / days);
  const proteinTarget = Number((prof.data as { protein_target_g?: number } | null)?.protein_target_g) || 0;
  const dm = String((mode.data as { diet_mode?: string } | null)?.diet_mode ?? "");
  const hasMeat = meals.some((m) => m.items.some((i) => /chicken|mutton|fish|keema|prawn|murgh/i.test(i.name)));
  const hasEgg = meals.some((m) => m.items.some((i) => /\begg|anda|omelette/i.test(i.name)));
  const diet: DietKind = dm === "vegan" ? "vegan" : dm === "jain" ? "jain" : dm === "vegetarian" ? "veg" : dm === "eggetarian" ? "egg" : hasMeat ? "nonveg" : hasEgg ? "egg" : "veg";
  const list = groceryList({ eaten, days, proteinTarget, avgProtein, pantry: pantry.error ? [] : ((pantry.data ?? []) as PantryRow[]), diet });
  return { ok: true, list, days, avgProtein, proteinTarget, pantryAvailable: !pantry.error };
}
