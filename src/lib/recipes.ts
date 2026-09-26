import type { ItemMicros, MealItem } from "./types";

/**
 * v2.13 recipe builder (spec §8), pure: totals and per-serving numbers computed on the client and
 * stored in `recipes.per_serving`, and the meal item a logged serving becomes. Android: util/Recipes.kt.
 */

export type RecipeIngredient = {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  food_id?: string | null;
  /** Micros already scaled to `grams` (the same keys as meal items). */
  micros?: ItemMicros;
  /** Per-100 g numbers so a grams edit re-prices the row. */
  per100?: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; micros?: Record<string, number> };
};

export type PerServing = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /** One serving's weight: cooked weight ÷ servings when the cooked weight is known, else raw weight ÷ servings. */
  grams: number;
  micros: ItemMicros;
};

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  cooked_weight_g: number | null;
  items: RecipeIngredient[];
  per_serving: PerServing;
  note: string | null;
  updated_at: string;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** An ingredient re-priced at `grams` from its per-100 g numbers (unchanged when there are none). */
export function priceIngredient(it: RecipeIngredient, grams: number): RecipeIngredient {
  const g = Math.max(0, r1(grams));
  if (!it.per100) {
    if (!(it.grams > 0)) return { ...it, grams: g };
    const k = g / it.grams;
    const micros: ItemMicros = {};
    for (const [key, v] of Object.entries(it.micros ?? {})) if (v != null && Number.isFinite(v)) micros[key as keyof ItemMicros] = r1(v * k);
    return { ...it, grams: g, kcal: Math.round(it.kcal * k), protein_g: r1(it.protein_g * k), carbs_g: r1(it.carbs_g * k), fat_g: r1(it.fat_g * k), fiber_g: r1((it.fiber_g ?? 0) * k), micros };
  }
  const k = g / 100;
  const micros: ItemMicros = {};
  for (const [key, v] of Object.entries(it.per100.micros ?? {})) if (v != null && Number.isFinite(Number(v))) micros[key as keyof ItemMicros] = r1(Number(v) * k);
  return { ...it, grams: g, kcal: Math.round(it.per100.kcal * k), protein_g: r1(it.per100.protein_g * k), carbs_g: r1(it.per100.carbs_g * k), fat_g: r1(it.per100.fat_g * k), fiber_g: r1(micros.fiber_g ?? 0), micros };
}

export type Totals = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; grams: number; micros: ItemMicros };

export function recipeTotals(items: RecipeIngredient[]): Totals {
  const micros: ItemMicros = {};
  let kcal = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  let fib = 0;
  let g = 0;
  for (const it of items) {
    kcal += Number(it.kcal) || 0;
    p += Number(it.protein_g) || 0;
    c += Number(it.carbs_g) || 0;
    f += Number(it.fat_g) || 0;
    fib += Number(it.fiber_g ?? it.micros?.fiber_g ?? 0) || 0;
    g += Number(it.grams) || 0;
    for (const [key, v] of Object.entries(it.micros ?? {})) if (v != null && Number.isFinite(v)) micros[key as keyof ItemMicros] = (micros[key as keyof ItemMicros] ?? 0) + v;
  }
  for (const k of Object.keys(micros) as (keyof ItemMicros)[]) micros[k] = r1(micros[k] ?? 0);
  return { kcal: Math.round(kcal), protein_g: r1(p), carbs_g: r1(c), fat_g: r1(f), fiber_g: r1(fib), grams: r1(g), micros };
}

/** Per-serving numbers (servings > 0; a missing / zero cooked weight falls back to the raw weight). */
export function perServing(items: RecipeIngredient[], servings: number, cookedWeightG?: number | null): PerServing {
  const t = recipeTotals(items);
  const n = servings > 0 ? servings : 1;
  const weight = cookedWeightG && cookedWeightG > 0 ? cookedWeightG : t.grams;
  const micros: ItemMicros = {};
  for (const [k, v] of Object.entries(t.micros)) if (v != null) micros[k as keyof ItemMicros] = r1(v / n);
  return { kcal: Math.round(t.kcal / n), protein_g: r1(t.protein_g / n), carbs_g: r1(t.carbs_g / n), fat_g: r1(t.fat_g / n), fiber_g: r1(t.fiber_g / n), grams: r1(weight / n), micros };
}

/** Marks a meal item logged from a recipe (meal_items.unit), so the ⓘ sheet can say "Your recipe". */
export const RECIPE_UNIT = "recipe";

/** "Log a serving": `count` servings as one meal item named after the recipe. */
export function recipeMealItem(r: Pick<Recipe, "name" | "per_serving">, count = 1): MealItem {
  const n = count > 0 ? count : 1;
  const ps = r.per_serving;
  const micros: ItemMicros = {};
  for (const [k, v] of Object.entries(ps.micros ?? {})) if (v != null && Number.isFinite(v)) micros[k as keyof ItemMicros] = r1(v * n);
  if (ps.fiber_g && micros.fiber_g == null) micros.fiber_g = r1(ps.fiber_g * n);
  return {
    food_id: null,
    name: r.name,
    grams: r1((ps.grams || 0) * n),
    calories: Math.round(ps.kcal * n),
    protein_g: r1(ps.protein_g * n),
    carbs_g: r1(ps.carbs_g * n),
    fat_g: r1(ps.fat_g * n),
    source: "table",
    confidence: 1,
    micros,
    unit: RECIPE_UNIT,
    servings: n,
    cooked_in: null,
  };
}

export function isRecipeItem(it: { unit?: string | null }): boolean {
  return it.unit === RECIPE_UNIT;
}

/** Parse a stored recipes row defensively (jsonb columns come back as unknown). */
export function recipeFromRow(r: Record<string, unknown>): Recipe {
  const items = (Array.isArray(r.items) ? r.items : []) as RecipeIngredient[];
  const servings = Number(r.servings) > 0 ? Number(r.servings) : 1;
  const cooked = r.cooked_weight_g == null ? null : Number(r.cooked_weight_g) || null;
  const stored = (r.per_serving ?? {}) as Partial<PerServing>;
  const per_serving = typeof stored.kcal === "number" ? { ...perServing(items, servings, cooked), ...stored, micros: stored.micros ?? {} } : perServing(items, servings, cooked);
  return {
    id: String(r.id),
    name: String(r.name ?? "Recipe"),
    servings,
    cooked_weight_g: cooked,
    items,
    per_serving: per_serving as PerServing,
    note: typeof r.note === "string" ? r.note : null,
    updated_at: String(r.updated_at ?? ""),
  };
}
