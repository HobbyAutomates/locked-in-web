import type { ItemMicros, MealItem, PresetServing } from "./types";

/**
 * The shared quantity model behind the Quantity sheet (web) and its Android twin: a food known
 * per 100 g, an optional serving size, and a chosen quantity in g / ml / kg / servings.
 */

export type QuantityUnit = "g" | "ml" | "kg" | "serving";
export const UNITS: QuantityUnit[] = ["g", "ml", "kg", "serving"];

/** Everything the sheet needs to price a quantity. `per100` is per 100 g. */
export type QuantityFood = {
  name: string;
  name_hi?: string | null;
  food_id: string | null;
  per100: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  /** Per 100 g micros (scaled by the sheet). */
  micros?: Record<string, number>;
  /** Household servings — from a preset, the food's `units`, or a scan's serving_g. */
  servings: PresetServing[];
  /** The serving the stepper counts in (defaults to the first of `servings`). */
  defaultServing?: string | null;
  /** g per ml, when the food's units carry one (defaults to 1.0). */
  density?: number | null;
  /** Whole-pack weight, when known (barcode / label scans). */
  packGrams?: number | null;
  source: MealItem["source"];
  /** v2.0: the preset category (dal / sabzi / protein / restaurant …) — decides the restaurant oil. */
  category?: string | null;
};

export type Quantity = { unit: QuantityUnit; value: number };

/** The serving size the stepper uses, in grams, or null when the food has none. */
export function servingGrams(f: QuantityFood): number | null {
  const s = f.servings.find((x) => x.label === f.defaultServing) ?? f.servings[0];
  return s && s.grams > 0 ? s.grams : null;
}

/** Grams for a quantity of this food. ml → g at the food's density (1.0 when unknown); kg × 1000. */
export function toGrams(f: QuantityFood, q: Quantity): number {
  const v = Math.max(0, Number(q.value) || 0);
  switch (q.unit) {
    case "kg":
      return v * 1000;
    case "ml":
      return v * (f.density && f.density > 0 ? f.density : 1);
    case "serving":
      return v * (servingGrams(f) ?? 100);
    default:
      return v;
  }
}

/** How many of the default serving `grams` is (for the saved `servings` column); null without a serving size. */
export function servingsFor(f: QuantityFood, grams: number): number | null {
  const s = servingGrams(f);
  return s ? Math.round((grams / s) * 100) / 100 : null;
}

/** A priced MealItem for `grams` of this food (macros linear, micros included). */
export function priceItem(f: QuantityFood, q: Quantity): MealItem {
  const grams = Math.round(toGrams(f, q) * 10) / 10;
  const k = grams / 100;
  const micros: ItemMicros = {};
  for (const [key, v] of Object.entries(f.micros ?? {})) if (v != null && Number.isFinite(v)) micros[key as keyof ItemMicros] = Math.round(v * k * 10) / 10;
  return {
    food_id: f.food_id,
    name: f.name,
    grams,
    calories: Math.round(f.per100.calories * k),
    protein_g: Math.round(f.per100.protein_g * k * 10) / 10,
    carbs_g: Math.round(f.per100.carbs_g * k * 10) / 10,
    fat_g: Math.round(f.per100.fat_g * k * 10) / 10,
    source: f.source,
    confidence: f.source === "table" ? 1 : f.source === "scan" ? 0.9 : null,
    micros,
    unit: q.unit,
    servings: q.unit === "serving" ? q.value : servingsFor(f, grams),
    cooked_in: null,
  };
}

/** The quick chips: ½ · 1 · 2 servings, 50 g, 100 g, ½ pack, 1 pack. */
export function quickChips(f: QuantityFood): { label: string; q: Quantity }[] {
  const out: { label: string; q: Quantity }[] = [];
  const sg = servingGrams(f);
  const sl = (f.servings.find((x) => x.label === f.defaultServing) ?? f.servings[0])?.label ?? "serving";
  if (sg) {
    out.push({ label: `½ ${sl}`, q: { unit: "serving", value: 0.5 } });
    out.push({ label: `1 ${sl}`, q: { unit: "serving", value: 1 } });
    out.push({ label: `2 ${sl}`, q: { unit: "serving", value: 2 } });
  }
  out.push({ label: "50 g", q: { unit: "g", value: 50 } });
  out.push({ label: "100 g", q: { unit: "g", value: 100 } });
  if (f.packGrams && f.packGrams > 0) {
    out.push({ label: "½ pack", q: { unit: "g", value: Math.round(f.packGrams / 2) } });
    out.push({ label: "1 pack", q: { unit: "g", value: Math.round(f.packGrams) } });
  }
  return out;
}

/** Wrap an existing review row so its grams can be re-entered through the sheet. */
export function foodFromItem(it: MealItem, servings: PresetServing[] = []): QuantityFood {
  const k = it.grams > 0 ? 100 / it.grams : 0;
  const micros: Record<string, number> = {};
  for (const [key, v] of Object.entries(it.micros ?? {})) if (v != null) micros[key] = v * k;
  return {
    name: it.name,
    food_id: it.food_id,
    per100: { calories: it.calories * k, protein_g: it.protein_g * k, carbs_g: it.carbs_g * k, fat_g: it.fat_g * k },
    micros,
    servings,
    source: it.source,
  };
}

/** Preset ids whose dish usually carries cooking fat (the "Cooked in…" row shows after these). */
export const COOKED_IN_CATEGORIES = new Set(["dal", "sabzi", "breakfast", "protein"]);
export function wantsCookedIn(name: string, category?: string | null): boolean {
  if (category && (category === "dal" || category === "sabzi")) return true;
  return /\b(dal|daal|dhal|sambar|rajma|chole|chana|sabzi|sabji|bhindi|gobi|paneer|bharta|paratha|omelette|omelet|egg|anda|bhurji|curry|matar|aloo|palak|khichdi|poha|upma|pulao|biryani)\b/i.test(name);
}

// ---- v2.0: restaurant portions ----

/** Outside kitchens serve bigger portions than a home katori: the "Restaurant portion" toggle scales by this. */
export const RESTAURANT_MULTIPLIER = 1.4;
/** The hidden oil a restaurant curry carries on top of the home recipe: 1 tsp (5 g) of oil. */
export const RESTAURANT_OIL_G = 5;
const OIL_KCAL_PER_G = 8.84;
const FAST_FOOD = /\b(pizza|burger|fries|momo|momos|sandwich)\b/i;

/** Whether the restaurant toggle also adds the hidden teaspoon of oil (dal / sabzi / protein dishes and curries). */
export function restaurantOil(name: string, category?: string | null): boolean {
  if (category === "dal" || category === "sabzi" || category === "protein") return true;
  if (category === "restaurant") return !FAST_FOOD.test(name);
  if (category) return false;
  return wantsCookedIn(name);
}

/** Packaged scans have a printed serving; everything else can be a restaurant portion. */
export function canBeRestaurant(f: QuantityFood): boolean {
  return f.source !== "scan";
}

/** A restaurant portion of a priced item: ×1.4 the amount, +1 tsp oil for oily dishes, "(restaurant)" on the name. */
export function applyRestaurant(item: MealItem, oily: boolean): MealItem {
  const k = RESTAURANT_MULTIPLIER;
  const micros: ItemMicros = {};
  for (const [key, v] of Object.entries(item.micros ?? {})) if (v != null) micros[key as keyof ItemMicros] = Math.round(v * k * 10) / 10;
  const fatAdd = oily ? RESTAURANT_OIL_G : 0;
  return {
    ...item,
    name: /\(restaurant\)$/i.test(item.name) ? item.name : `${item.name} (restaurant)`,
    grams: Math.round(item.grams * k * 10) / 10,
    calories: Math.round(item.calories * k + fatAdd * OIL_KCAL_PER_G),
    protein_g: Math.round(item.protein_g * k * 10) / 10,
    carbs_g: Math.round(item.carbs_g * k * 10) / 10,
    fat_g: Math.round((item.fat_g * k + fatAdd) * 10) / 10,
    micros,
    servings: item.servings != null ? Math.round(item.servings * k * 100) / 100 : item.servings,
    cooked_in: "restaurant",
  };
}

/** Restaurant words in a note or the model's plate description. */
export function mentionsRestaurant(text: string): boolean {
  return /\b(restaurant|restaurants|dhaba|hotel|mess|canteen|cafe|café|takeaway|take-away|zomato|swiggy|eating out|ate out)\b/i.test(text);
}
