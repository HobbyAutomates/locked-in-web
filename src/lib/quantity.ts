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
    // v2.8 (B4): a restaurant portion is stored by grams ("180 g"), never as "1.4 servings".
    unit: "g",
    servings: null,
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

// ---- v2.8: single-piece counting (B2) — a port of Android's Counting.unitFor ----

/**
 * How the Quantity sheet counts a food: "1 roti = 40 g" in whole steps, "1 katori = 150 g" in ½
 * steps. `label` is set when the serving could not be split into single pieces ("5-6 pieces"), in
 * which case the stepper counts that serving as a whole. Mirrors Android's util/Quantity.kt CountUnit.
 */
export type CountUnit = { noun: string; grams: number; step: 1 | 0.5; defaultCount: number; label: string | null };

/** "2 roti", "1-egg omelette", "½ katori", "1 katori (2 pcs)" → count + noun. The noun must start with a letter ("5-6 pieces" doesn't parse). */
const LEAD = /^\s*(\d+(?:\.\d+)?|½|¼|¾)\s*-?\s*(\p{L}.*?)\s*$/u;
const WEIGHT_WORDS = new Set(["g", "gm", "gms", "gram", "grams", "kg", "ml", "l", "litre", "liter", "oz", "mg"]);
/** Household measures you'd eat half of — everything else (roti, egg, idli, scoop, piece, slice …) counts in whole numbers. */
const HALVES = new Set(["katori", "katoris", "bowl", "bowls", "glass", "glasses", "cup", "cups", "plate", "plates", "tumbler", "ladle", "handful", "handfuls", "tub", "tbsp", "tsp", "serving", "servings", "pack", "packs", "bar", "coconut"]);

function leadNum(s: string): number | null {
  if (s === "½") return 0.5;
  if (s === "¼") return 0.25;
  if (s === "¾") return 0.75;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "slices" → "slice", "egg whites" → "egg white", "sandwiches" → "sandwich". Only the last word. */
export function singularNoun(noun: string): string {
  const words = noun.split(" ");
  const w = words[words.length - 1];
  let out = w;
  if (w.length > 4 && (w.endsWith("ches") || w.endsWith("shes") || w.endsWith("sses"))) out = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("ies")) out = w.slice(0, -3) + "y";
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) out = w.slice(0, -1);
  words[words.length - 1] = out;
  return words.join(" ");
}

type ParsedServing = { count: number; noun: string; grams: number; label: string };

function parseServing(s: PresetServing): ParsedServing | null {
  const m = LEAD.exec(s.label);
  if (!m) return null;
  const n = leadNum(m[1]);
  if (n == null) return null;
  // "1 katori (2 pcs)" → "katori"; "1 pack (50 g)" → "pack".
  const noun = m[2].replace(/\s*\(.*?\)/g, "").trim().toLowerCase();
  if (!noun || n <= 0) return null;
  if (WEIGHT_WORDS.has(noun.split(" ")[0])) return null;
  return { count: n, noun: n > 1 ? singularNoun(noun) : noun, grams: s.grams, label: s.label };
}

const stepFor = (noun: string): 1 | 0.5 => (noun.split(" ").some((w) => HALVES.has(w)) ? 0.5 : 1);

/**
 * The count unit for a food's servings, or null for a loose food (no servings, or only gram weights
 * like "100 g" / "200 g pack"). Prefers a single piece of the default serving's noun ("1 roti" over
 * "2 roti"), then the default split per piece ("2 idli = 80 g" → 40 g), then any single piece. The
 * default count is 1 — the preset's "2 roti" never decides it — except for small things you count
 * in handfuls ("10 almonds", "6 momos").
 */
export function unitFor(servings: PresetServing[], defaultLabel?: string | null): CountUnit | null {
  const list = servings.filter((s) => s && s.label);
  if (!list.length) return null;
  const def = list.find((s) => s.label === defaultLabel) ?? list[0];
  const parsed = list.map(parseServing).filter((x): x is ParsedServing => x !== null);
  const pd = parseServing(def);
  const one = parsed.find((x) => x.count === 1 && (pd === null || x.noun === pd.noun));
  let base: CountUnit | null = null;
  if (one) base = { noun: one.noun, grams: one.grams, step: stepFor(one.noun), defaultCount: 1, label: null };
  else if (pd && pd.count >= 1) base = { noun: pd.noun, grams: pd.grams / pd.count, step: stepFor(pd.noun), defaultCount: 1, label: null };
  else {
    const any1 = parsed.find((x) => x.count === 1);
    if (any1) base = { noun: any1.noun, grams: any1.grams, step: stepFor(any1.noun), defaultCount: 1, label: null };
  }
  if (!base) {
    // Nothing splits into pieces: "5-6 pieces" counts as a whole serving, unless every label is a weight.
    if (!parsed.length && list.every((s) => WEIGHT_WORDS.has((s.label.trim().split(/\s+/)[1] ?? "").toLowerCase()))) return null;
    return { noun: def.label.toLowerCase(), grams: def.grams, step: 0.5, defaultCount: 1, label: def.label };
  }
  const dc = pd && pd.noun === base.noun && pd.count >= 5 ? pd.count : 1;
  return { ...base, grams: Math.round(base.grams * 10) / 10, defaultCount: dc };
}

export function unitForFood(f: QuantityFood): CountUnit | null {
  return unitFor(f.servings, f.defaultServing);
}

/** The one-piece serving a count unit prices through ("1 roti" = 40 g), so rows store unit=serving, servings=count. */
export function unitServing(cu: CountUnit): PresetServing {
  return { label: cu.label ?? `1 ${cu.noun}`, grams: cu.grams };
}

/** Rounds `n` to the unit's step, never below one step. */
export function snapCount(cu: CountUnit, n: number): number {
  return Math.max(cu.step, Math.round(n / cu.step) * cu.step);
}

/** "2 roti", "1½ katori", "1 × 5-6 pieces" — how a count reads with its unit. */
export function countLabel(cu: CountUnit, n: number): string {
  return cu.label ? `${countText(n)} × ${cu.label}` : `${countText(n)} ${nounFor(cu.noun, n)}`;
}

/** What one tap on a food adds: its count unit at the default count (Android's sheet opens there too), else 100 g. */
export function oneTap(f: QuantityFood): { food: QuantityFood; q: Quantity; label: string | null; unit: CountUnit | null } {
  const cu = unitForFood(f);
  if (!cu) return { food: f, q: { unit: "g", value: 100 }, label: null, unit: null };
  const s = unitServing(cu);
  return { food: { ...f, servings: [s], defaultServing: s.label }, q: { unit: "serving", value: cu.defaultCount }, label: s.label, unit: cu };
}

// ---- v2.8: the meal editor ----

/**
 * An item re-priced at `grams` from its own per-gram values (macros and micros linear). `servings`
 * scales with it when the row is counted; pass `servings` to set it exactly (the stepper's count).
 */
export function rescaleItem(item: MealItem, grams: number, servings?: number | null): MealItem {
  const g = Math.max(0, Math.round(grams * 10) / 10);
  if (!(item.grams > 0)) return { ...item, grams: g };
  const k = g / item.grams;
  const micros: ItemMicros = {};
  for (const [key, v] of Object.entries(item.micros ?? {})) if (v != null && Number.isFinite(v)) micros[key as keyof ItemMicros] = Math.round(v * k * 10) / 10;
  const counted = item.unit === "serving" && item.servings != null && item.servings > 0;
  return {
    ...item,
    grams: g,
    calories: Math.round(Number(item.calories) * k),
    protein_g: Math.round(Number(item.protein_g) * k * 10) / 10,
    carbs_g: Math.round(Number(item.carbs_g) * k * 10) / 10,
    fat_g: Math.round(Number(item.fat_g) * k * 10) / 10,
    micros,
    servings: servings !== undefined ? servings : counted ? Math.round(Number(item.servings) * k * 100) / 100 : (item.servings ?? null),
  };
}

/** Words a food's own name counts in ("Roti", "Boiled egg", "Idli") — how a saved row with no serving label still reads "2 roti". */
const NAME_NOUNS = new Set([...WHOLE_NOUNS, ...HALF_NOUNS]);

/**
 * The one-piece serving a saved row was counted in, when it was counted (unit = serving): its grams
 * per piece and the noun its name suggests ("Roti" → roti), else "serving".
 */
export function savedUnitOf(item: MealItem): PresetServing | null {
  const n = Number(item.servings);
  if (item.unit !== "serving" || !(n > 0) || !(item.grams > 0) || item.cooked_in === "restaurant") return null;
  const words = item.name.toLowerCase().replace(/\(.*?\)/g, " ").split(/[\s,]+/).filter(Boolean);
  const noun = [...words].reverse().find((w) => NAME_NOUNS.has(w));
  return { label: `1 ${noun ? singularNoun(noun) : "serving"}`, grams: Math.round((item.grams / n) * 10) / 10 };
}

/**
 * A logged row's amount as it reads: "2 roti", "1½ katori", "180 g". Restaurant portions and
 * anything not counted read in grams (B4: never "1.4 servings").
 */
export function itemQtyLabel(item: MealItem, servingLabel?: string | null): string {
  const grams = `${Math.round(Number(item.grams) || 0)} g`;
  const n = Number(item.servings);
  if (item.unit !== "serving" || !(n > 0) || item.cooked_in === "restaurant") return grams;
  const label = servingLabel ?? savedUnitOf(item)?.label ?? null;
  if (!label) return grams;
  const cu = unitFor([{ label, grams: item.grams / n }], label);
  if (!cu) return grams;
  // A count that isn't whole or half (older rows) reads in grams rather than "1.37 roti".
  const count = Math.round(n * 100) / 100;
  if (Math.abs(count * 2 - Math.round(count * 2)) > 0.02) return grams;
  return countLabel(cu, Math.round(count * 2) / 2);
}
