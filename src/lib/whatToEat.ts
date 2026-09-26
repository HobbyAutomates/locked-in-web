import type { MealType } from "./mealType";
import type { FoodPreset, ItemMicros, MealItem, PresetCategory } from "./types";
import { countLabel, unitFor } from "./quantity";
import { foodAllowed, type DietMode } from "./dietModes";

/**
 * v2.13 "What should I eat?" (spec §6). Pure: ranks the Indian presets for what's left today.
 *
 *   score = 0.5 × protein density + 0.3 × fits the kcal left + 0.2 × suits this meal time
 *
 *   protein density  protein g per 100 kcal of the portion, divided by 12 and capped at 1
 *                    (12 g / 100 kcal is lean-meat territory, so the best foods all score 1).
 *   fits             1 when the portion's kcal is inside what's left; otherwise it falls off
 *                    linearly and reaches 0 when the portion is twice what's left (or nothing is left).
 *   meal time        the preset category's affinity for the meal type (MEAL_FIT below).
 *
 * The portion is what one tap adds everywhere else in the app (the preset's count unit at its
 * default count, else 100 g). Fats (ghee, oil) are never suggested; the diet mode's food filter
 * applies. Ties break on the label, so the order is stable. Android: util/WhatToEat.kt.
 */

export type Remaining = { kcal: number; protein: number; carbs: number; fat: number };

export type Suggestion = {
  id: string;
  label: string;
  label_hi: string | null;
  category: PresetCategory;
  image_url: string | null;
  portion: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  score: number;
  /** Ready to save: priced like a one-tap preset add. */
  item: MealItem;
  usual?: boolean;
};

export const WEIGHTS = { protein: 0.5, fit: 0.3, meal: 0.2 } as const;
export const PROTEIN_DENSITY_TOP = 12;

/** How well a preset category suits each meal time (0–1). */
export const MEAL_FIT: Record<PresetCategory, Record<MealType, number>> = {
  breakfast: { breakfast: 1, lunch: 0.3, dinner: 0.3, snack: 0.6 },
  staple: { breakfast: 0.4, lunch: 1, dinner: 1, snack: 0.2 },
  dal: { breakfast: 0.2, lunch: 1, dinner: 1, snack: 0.2 },
  sabzi: { breakfast: 0.3, lunch: 1, dinner: 1, snack: 0.2 },
  protein: { breakfast: 0.8, lunch: 1, dinner: 1, snack: 0.7 },
  snack: { breakfast: 0.5, lunch: 0.3, dinner: 0.2, snack: 1 },
  drink: { breakfast: 0.8, lunch: 0.3, dinner: 0.2, snack: 0.9 },
  sweet: { breakfast: 0.1, lunch: 0.3, dinner: 0.3, snack: 0.5 },
  fruit: { breakfast: 0.9, lunch: 0.3, dinner: 0.2, snack: 1 },
  fat: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
  restaurant: { breakfast: 0.2, lunch: 0.8, dinner: 0.8, snack: 0.3 },
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The portion one tap adds, priced from the preset's per-100 g numbers. */
export function portionOf(p: FoodPreset): { grams: number; label: string; count: number | null; unitLabel: string | null } {
  const cu = unitFor(p.servings, p.default_serving);
  if (!cu) return { grams: 100, label: "100 g", count: null, unitLabel: null };
  return { grams: Math.round(cu.grams * cu.defaultCount * 10) / 10, label: countLabel(cu, cu.defaultCount), count: cu.defaultCount, unitLabel: cu.label ?? `1 ${cu.noun}` };
}

export function presetItem(p: FoodPreset): MealItem {
  const por = portionOf(p);
  const k = por.grams / 100;
  const micros: ItemMicros = {};
  for (const [key, v] of Object.entries(p.micros ?? {})) if (v != null && Number.isFinite(Number(v))) micros[key as keyof ItemMicros] = r1(Number(v) * k);
  return {
    food_id: p.food_id,
    name: p.label,
    grams: por.grams,
    calories: Math.round(p.calories * k),
    protein_g: r1(p.protein_g * k),
    carbs_g: r1(p.carbs_g * k),
    fat_g: r1(p.fat_g * k),
    source: "table",
    confidence: 1,
    micros,
    unit: por.count != null ? "serving" : "g",
    servings: por.count,
    cooked_in: null,
    image_url: p.image_url ?? null,
  };
}

export function proteinScore(protein: number, kcal: number): number {
  if (!(kcal > 0)) return 0;
  return Math.min(1, ((protein / kcal) * 100) / PROTEIN_DENSITY_TOP);
}

export function fitScore(kcal: number, remainingKcal: number): number {
  if (remainingKcal <= 0) return 0;
  if (kcal <= remainingKcal) return 1;
  return Math.max(0, 1 - (kcal - remainingKcal) / remainingKcal);
}

export function scorePreset(p: FoodPreset, remaining: Remaining, mealType: MealType): number {
  const item = presetItem(p);
  const s = WEIGHTS.protein * proteinScore(item.protein_g, item.calories) + WEIGHTS.fit * fitScore(item.calories, remaining.kcal) + WEIGHTS.meal * (MEAL_FIT[p.category]?.[mealType] ?? 0.3);
  return Math.round(s * 1000) / 1000;
}

function toSuggestion(p: FoodPreset, score: number, usual = false): Suggestion {
  const item = presetItem(p);
  return {
    id: p.id,
    label: p.label,
    label_hi: p.label_hi,
    category: p.category,
    image_url: p.image_url ?? null,
    portion: portionOf(p).label,
    grams: item.grams,
    kcal: item.calories,
    protein: item.protein_g,
    carbs: item.carbs_g,
    fat: item.fat_g,
    score,
    item,
    ...(usual ? { usual: true } : {}),
  };
}

/** Presets that can be suggested at all: no fats, zero-calorie rows or foods the mode leaves out. */
function eligible(presets: FoodPreset[], mode: DietMode): FoodPreset[] {
  const seen = new Set<string>();
  return presets.filter((p) => {
    if (p.category === "fat" || !(p.calories > 0)) return false;
    if (!foodAllowed(mode, `${p.label} ${p.food_name}`)) return false;
    if (seen.has(p.food_id)) return false;
    seen.add(p.food_id);
    return true;
  });
}

/** The top `limit` presets for what's left today, best first. */
export function suggestFoods(input: { remaining: Remaining; mode: DietMode; mealType: MealType; presets: FoodPreset[]; limit?: number }): Suggestion[] {
  const scored = eligible(input.presets, input.mode).map((p) => ({ p, s: scorePreset(p, input.remaining, input.mealType) }));
  scored.sort((a, b) => b.s - a.s || a.p.label.localeCompare(b.p.label));
  return scored.slice(0, input.limit ?? 5).map(({ p, s }) => toSuggestion(p, s));
}

/**
 * "Your usual": the foods this person eats most (usage = food_id → times in the last 60 days) that
 * fit the mode and what's left, most eaten first. Up to `limit`, and never ones already suggested.
 */
export function usualPicks(input: { remaining: Remaining; mode: DietMode; mealType: MealType; presets: FoodPreset[]; usage: Record<string, number>; exclude?: string[]; limit?: number }): Suggestion[] {
  const skip = new Set(input.exclude ?? []);
  return eligible(input.presets, input.mode)
    .filter((p) => (input.usage[p.food_id] ?? 0) > 0 && !skip.has(p.id))
    .filter((p) => fitScore(presetItem(p).calories, input.remaining.kcal) > 0)
    .sort((a, b) => (input.usage[b.food_id] ?? 0) - (input.usage[a.food_id] ?? 0) || a.label.localeCompare(b.label))
    .slice(0, input.limit ?? 3)
    .map((p) => toSuggestion(p, scorePreset(p, input.remaining, input.mealType), true));
}

/** What's left today (never negative). */
export function remainingFrom(targets: { kcal: number; protein: number; carbs: number; fat: number }, eaten: { calories: number; protein: number; carbs: number; fat: number }): Remaining {
  return {
    kcal: Math.max(0, Math.round(targets.kcal - eaten.calories)),
    protein: Math.max(0, Math.round(targets.protein - eaten.protein)),
    carbs: Math.max(0, Math.round(targets.carbs - eaten.carbs)),
    fat: Math.max(0, Math.round(targets.fat - eaten.fat)),
  };
}
