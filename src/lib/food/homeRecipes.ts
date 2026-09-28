import type { MealItem } from "@/lib/types";
import type { PerServing, RecipeIngredient } from "@/lib/recipes";
import LIBRARY from "./home_recipes.json";

/**
 * v2.18 A2 "Ghar ka khana": a built-in library of common Indian home recipes (83, see
 * home_recipes.json — Android ships the same file as assets/home_recipes.json). Each entry is ONE
 * serving in its household unit (1 katori = 150 g of dal, 1 roti = 40 g, 1 glass = 250 ml…) with
 * home-style oil / ghee already in the numbers. Logging is one tap by servings; "Make it mine"
 * copies an entry into the person's own recipes (bandlog.recipes) to tweak.
 *
 * Also the voice recipe parser: "Mom's dal: 1 katori toor dal, 1 spoon ghee, serves 4" → a name,
 * the ingredient text (priced by /api/parse-meal like any typed meal) and the servings.
 */

export type HomeUnit = "katori" | "roti" | "piece" | "plate" | "glass" | "cup" | "bowl";
export type HomeRecipe = {
  id: string;
  name: string;
  local: string;
  category: "dal" | "sabzi" | "nonveg" | "sides" | "rice" | "bread" | "breakfast" | "snack" | "drink" | "sweet";
  unit: HomeUnit;
  unit_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  ingredients: string[];
  aliases: string[];
};

export const HOME_RECIPES = LIBRARY as HomeRecipe[];

export const HOME_CATEGORIES: { key: HomeRecipe["category"]; label: string }[] = [
  { key: "dal", label: "Dal & curry" },
  { key: "sabzi", label: "Sabzi" },
  { key: "nonveg", label: "Non-veg" },
  { key: "rice", label: "Rice" },
  { key: "bread", label: "Roti & paratha" },
  { key: "breakfast", label: "Breakfast" },
  { key: "sides", label: "Curd & sides" },
  { key: "snack", label: "Snacks" },
  { key: "drink", label: "Drinks" },
  { key: "sweet", label: "Sweets" },
];

/** Home recipes an item on this unit is counted in halves ("½ katori"); pieces in whole numbers. */
export function servingStep(r: Pick<HomeRecipe, "unit">): 0.5 | 1 {
  return r.unit === "katori" || r.unit === "bowl" || r.unit === "plate" || r.unit === "glass" || r.unit === "cup" ? 0.5 : 1;
}

export function unitLabel(r: Pick<HomeRecipe, "unit" | "unit_grams">, n = 1): string {
  const noun = r.unit === "piece" ? "piece" : r.unit;
  const many = n === 1 || n === 0.5 ? noun : noun === "glass" ? "glasses" : `${noun}s`;
  const count = n === 0.5 ? "½" : Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  return `${count} ${many}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Search by name, local name or alias (every query word must appear). Empty query = everything. */
export function searchHomeRecipes(q: string, list: HomeRecipe[] = HOME_RECIPES): HomeRecipe[] {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return list;
  const scored = list
    .map((r) => {
      const hay = norm([r.name, r.local, ...r.aliases].join(" "));
      if (!words.every((w) => hay.includes(w))) return null;
      const exact = norm(r.name) === words.join(" ") || r.aliases.some((a) => norm(a) === words.join(" "));
      return { r, s: (exact ? 10 : 0) + (norm(r.name).startsWith(words[0]) ? 2 : 0) };
    })
    .filter((x): x is { r: HomeRecipe; s: number } => !!x);
  return scored.sort((a, b) => b.s - a.s).map((x) => x.r);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** `servings` of a home recipe as one meal item (numbers from the library, counted in its unit). */
export function homeRecipeItem(r: HomeRecipe, servings = 1): MealItem {
  const n = servings > 0 ? servings : 1;
  return {
    food_id: null,
    name: r.name,
    grams: Math.round(r.unit_grams * n),
    calories: Math.round(r.kcal * n),
    protein_g: r1(r.protein_g * n),
    carbs_g: r1(r.carbs_g * n),
    fat_g: r1(r.fat_g * n),
    source: "table",
    confidence: 0.8,
    micros: r.fiber_g ? { fiber_g: r1(r.fiber_g * n) } : {},
    unit: "serving",
    servings: n,
    serving_unit: { label: `1 ${r.unit}`, grams: r.unit_grams },
    cooked_in: null,
  };
}

/** A library entry as the person's own recipe (one serving = one unit), ready for bandlog.recipes. */
export function homeRecipeAsOwn(r: HomeRecipe): { name: string; servings: number; cooked_weight_g: number; items: RecipeIngredient[]; per_serving: PerServing; note: string } {
  const item: RecipeIngredient = {
    name: `${r.name} (1 ${r.unit})`,
    grams: r.unit_grams,
    kcal: r.kcal,
    protein_g: r.protein_g,
    carbs_g: r.carbs_g,
    fat_g: r.fat_g,
    fiber_g: r.fiber_g,
    food_id: null,
    micros: r.fiber_g ? { fiber_g: r.fiber_g } : {},
    per100: { kcal: (r.kcal * 100) / r.unit_grams, protein_g: (r.protein_g * 100) / r.unit_grams, carbs_g: (r.carbs_g * 100) / r.unit_grams, fat_g: (r.fat_g * 100) / r.unit_grams },
  };
  return {
    name: r.name,
    servings: 1,
    cooked_weight_g: r.unit_grams,
    items: [item],
    per_serving: { kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, fiber_g: r.fiber_g, grams: r.unit_grams, micros: r.fiber_g ? { fiber_g: r.fiber_g } : {} },
    note: `From the Ghar ka khana library: ${r.ingredients.join(", ")}.`,
  };
}

// ---- voice recipes ----

const SERVE_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, chhe: 6 };

export type VoiceRecipe = { name: string; ingredients: string; servings: number | null };

/**
 * "Mom's dal: 1 katori toor dal, 1 spoon ghee, serves 4" → { name: "Mom's dal", ingredients:
 * "1 katori toor dal, 1 spoon ghee", servings: 4 }. The name is what comes before a colon or a dash;
 * without one, the words before the first amount ("Mom's dal 1 katori toor dal…"). "Serves 4",
 * "for 4 people", "4 servings", "makes 6" set the servings.
 */
export function parseVoiceRecipe(text: string): VoiceRecipe {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  let servings: number | null = null;
  const serve = t.match(/[,.]?\s*\b(?:serves|for|makes|feeds)\s+(\d+|[a-z]+)(?:\s+(?:people|persons|log|servings?|portions?|plates?))?\b[.,]?/i) ?? t.match(/[,.]?\s*\b(\d+|[a-z]+)\s+(?:servings?|portions?|people)\b[.,]?/i);
  if (serve) {
    const w = serve[1].toLowerCase();
    const n = /^\d+$/.test(w) ? Number(w) : SERVE_WORDS[w];
    if (n && n > 0 && n <= 50) {
      servings = n;
      t = (t.slice(0, serve.index) + t.slice((serve.index ?? 0) + serve[0].length)).replace(/\s+/g, " ").trim();
    }
  }
  let name = "";
  let rest = t;
  const colon = t.match(/^(.{2,60}?)\s*(?::|—|–| - )\s*(.+)$/);
  if (colon) {
    name = colon[1];
    rest = colon[2];
  } else {
    const firstAmount = t.search(/\b(\d|ek|do|teen|char|aadha|half|one|two|three|a\s+(?:katori|spoon|cup|bowl|glass))\b/i);
    if (firstAmount > 2) {
      name = t.slice(0, firstAmount);
      rest = t.slice(firstAmount);
    }
  }
  name = name.replace(/^(recipe|save|new recipe|my recipe)\s*(for|:)?\s*/i, "").replace(/[,.:\s]+$/, "").trim();
  rest = rest.replace(/^[,.:\s]+|[,.\s]+$/g, "").trim();
  return { name: name ? name.charAt(0).toUpperCase() + name.slice(1) : "", ingredients: rest, servings };
}

/** A priced meal item (from /api/parse-meal) as a recipe ingredient, with per-100 g so grams edits re-price it. */
export function ingredientFromItem(it: MealItem): RecipeIngredient {
  const g = Number(it.grams) || 0;
  const per = (v: number) => (g > 0 ? Math.round(((v * 100) / g) * 10) / 10 : 0);
  const micros: Record<string, number> = {};
  for (const [k, v] of Object.entries(it.micros ?? {})) if (v != null && Number.isFinite(Number(v))) micros[k] = per(Number(v));
  return {
    name: it.name,
    grams: g,
    kcal: Math.round(Number(it.calories) || 0),
    protein_g: r1(Number(it.protein_g) || 0),
    carbs_g: r1(Number(it.carbs_g) || 0),
    fat_g: r1(Number(it.fat_g) || 0),
    fiber_g: r1(Number(it.micros?.fiber_g ?? 0) || 0),
    food_id: it.food_id ?? null,
    micros: it.micros ?? {},
    per100: g > 0 ? { kcal: per(Number(it.calories) || 0), protein_g: per(Number(it.protein_g) || 0), carbs_g: per(Number(it.carbs_g) || 0), fat_g: per(Number(it.fat_g) || 0), micros } : undefined,
  };
}
