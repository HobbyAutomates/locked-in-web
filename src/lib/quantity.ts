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

// ---- v2.5: count foods get one stepper, loose foods get grams + ≤ 3 chips ----

/** Serving nouns counted in whole numbers: 1, 2, 3 roti — never "2.5 eggs". */
const WHOLE_NOUNS = new Set([
  "roti", "chapati", "phulka", "paratha", "naan", "thepla", "idli", "dosa", "uttapam", "pesarattu", "vada", "chilla", "egg", "eggs", "white", "whites",
  "slice", "slices", "piece", "pieces", "pcs", "scoop", "scoops", "banana", "bananas", "apple", "apples", "orange", "oranges", "mosambi", "guava", "guavas", "kiwi", "kiwis",
  "mango", "chikoo", "date", "dates", "biscuit", "biscuits", "samosa", "pav", "momo", "momos", "ladoo", "sandwich", "sandwiches", "burger", "bar", "almond", "almonds", "tablet", "capsule",
]);
/** Serving nouns that take ½ steps: ½ katori, 1½ glass. */
const HALF_NOUNS = new Set(["katori", "bowl", "bowls", "glass", "cup", "cups", "tumbler", "plate", "ladle", "tbsp", "tsp", "handful", "pack", "packs", "serving", "can", "bottle", "regular", "large", "tub"]);

/** "1 roti" → "roti", "1 katori (2 pcs)" → "katori (2 pcs)", "roti" → "roti". */
export function servingNoun(label: string | null | undefined): string {
  return (label ?? "serving").replace(/^(1|one|½)\s+/i, "").replace(/^1-/, "").trim() || "serving";
}

/** The chosen serving of a food (its default, else the first). */
export function defaultServingOf(f: QuantityFood): PresetServing | null {
  const s = f.servings.find((x) => x.label === f.defaultServing) ?? f.servings[0];
  return s && s.grams > 0 ? s : null;
}

/**
 * How the stepper counts this food: 1 (whole numbers: roti, egg, idli, scoop, piece, slice),
 * 0.5 (katori, bowl, glass, cup) or null for loose foods (paneer by grams, "100 g" servings).
 */
export function countStep(f: QuantityFood): 1 | 0.5 | null {
  const s = defaultServingOf(f);
  if (!s) return null;
  // A serving that already says "2 x" / "5-6 pieces" / "100 g" is not a unit to count in.
  if (/^\d+(\.\d+)?\s*(g|gm|ml|kg)\b/i.test(s.label)) return null;
  const words = servingNoun(s.label).toLowerCase().replace(/[()]/g, " ").split(/[\s-]+/).filter(Boolean);
  if (words.some((w) => WHOLE_NOUNS.has(w))) return 1;
  if (words.some((w) => HALF_NOUNS.has(w))) return 0.5;
  return null;
}

/** Whey and friends: a scoop stepper and nothing else. */
export function isSupplement(f: QuantityFood): boolean {
  const s = defaultServingOf(f);
  return /\b(whey|protein powder|mass gainer|creatine|casein|isolate)\b/i.test(f.name) || (!!s && /\bscoops?\b/i.test(s.label) && !/ice cream/i.test(f.name));
}

/** Drinks are typed in ml. */
export function isLiquid(f: QuantityFood): boolean {
  return f.category === "drink" || /\b(milk|doodh|juice|lassi|chaas|buttermilk|shake|coffee|chai|tea|water|soda|cola|coke|smoothie)\b/i.test(f.name);
}

const PLURAL: Record<string, string> = { egg: "eggs", slice: "slices", piece: "pieces", scoop: "scoops", biscuit: "biscuits", banana: "bananas", apple: "apples", orange: "oranges", date: "dates", glass: "glasses", cup: "cups", bowl: "bowls", white: "whites", sandwich: "sandwiches", burger: "burgers", guava: "guavas", kiwi: "kiwis", momo: "momos", bar: "bars", almond: "almonds", plate: "plates", pack: "packs", serving: "servings", tablet: "tablets", capsule: "capsules" };
/** "egg" × 2 → "eggs"; Hindi nouns stay as they are ("2 roti", "2 katori"). */
export function nounFor(noun: string, n: number): string {
  if (n <= 1) return noun;
  return noun.replace(/^(\S+)(.*)$/, (_m, first: string, rest: string) => {
    // "egg white" pluralises its last word, everything else its first.
    if (/^egg white$/i.test(noun)) return "egg whites";
    return (PLURAL[first.toLowerCase()] ?? first) + rest;
  });
}

/** "1½", "2", "½" — how a count reads next to its noun. */
export function countText(n: number): string {
  const whole = Math.floor(n);
  const half = Math.abs(n - whole - 0.5) < 1e-6;
  if (half) return whole ? `${whole}½` : "½";
  return fmtNum(n);
}
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Loose foods: at most three chips — 50 · 100 · 200 g (ml for drinks), or ½ / 1 pack for scans. */
export function looseChips(f: QuantityFood): { label: string; q: Quantity }[] {
  const u: QuantityUnit = isLiquid(f) ? "ml" : "g";
  if (f.packGrams && f.packGrams > 0) {
    return [
      { label: `100 ${u}`, q: { unit: u, value: 100 } },
      { label: "½ pack", q: { unit: "g", value: Math.round(f.packGrams / 2) } },
      { label: "1 pack", q: { unit: "g", value: Math.round(f.packGrams) } },
    ];
  }
  return [50, 100, 200].map((v) => ({ label: `${v} ${u}`, q: { unit: u, value: v } }));
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

/** A plate-photo item as a meal item (the confidence word becomes a number, like the Android app). */
export function mealItemFromPlate(i: { food_id: string | null; name: string; grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; source: "table" | "estimated"; confidence: "high" | "medium" | "low"; micros: ItemMicros; cooked_in?: string | null }): MealItem {
  return {
    food_id: i.food_id,
    name: i.name,
    grams: i.grams,
    calories: i.calories,
    protein_g: i.protein_g,
    carbs_g: i.carbs_g,
    fat_g: i.fat_g,
    source: i.source,
    confidence: i.confidence === "high" ? 0.9 : i.confidence === "medium" ? 0.6 : 0.3,
    micros: i.micros,
    unit: "g",
    servings: null,
    cooked_in: i.cooked_in ?? null,
  };
}
