import { DISH_WORDS, isAcceptableMatch, microsFor, significantWords, type FoodHit } from "./foodSearch";
import { RESTAURANT_OIL_G, restaurantOil } from "./quantity";

/**
 * v2.9 "Which one?" — the variant picker. When an item's name is ambiguous ("roti" could be atta,
 * maida, missi, tandoori or ghee roti; "milk" full cream / toned / …) the parse and plate-scan
 * responses carry `variants` for it and the plate shows them as chips; choosing one swaps the row to
 * that food and re-prices it at the same grams.
 *
 * Detection is data-driven: the candidates are foods rows that are a close name match (the same
 * search_foods RPC + isAcceptableMatch the parser and plateMatch already trust — no new search) and
 * whose kcal per 100 g differ from the chosen row by more than 12 %. VARIANT_GROUPS is a small
 * curated map for the Indian staples that only decides WHICH rows lead and in what order — every
 * option is still a real row found by the search. No variants → the item is not ambiguous.
 *
 * Pure except `findVariants`, whose search is injected so scripts/check-variants.ts runs offline.
 */

export type FoodVariant = {
  food_id: string;
  name: string;
  kcal_per_100g: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
  micros_per_100g?: Record<string, number>;
  /** The foods row's dataset (ifct | usda | dish | custom | off | ai). */
  source?: string;
  /** The curated chip label ("Maida roti") when a VARIANT_GROUPS entry picked it. */
  label?: string;
};

type VariantSpec = {
  label: string;
  /** Any of these words (or phrases) in the row's name selects it. Ignored for the `plain` spec. */
  words: string[];
  /** …unless one of these is there too ("toned" but not "double toned"). */
  not?: string[];
  /** Searched on its own when the group search didn't bring a row for this spec. */
  q: string;
  /** The default kind: a row naming the staple with none of the other specs' words. */
  plain?: boolean;
};

export type VariantGroup = {
  key: string;
  /** Words that, on their own, name the ambiguous staple ("roti", "chapati", "phulka"). */
  triggers: string[];
  /** Extra words still generic enough to ask ("full" in "Milk (full cream)", the default "milk"). */
  generic?: string[];
  /** The group-wide search. */
  search: string;
  /** Row names must mention a trigger word (off for sabzi: "Bhindi masala" is a sabzi). */
  requireTrigger?: boolean;
  /** Dish words that are fine inside this group (sabzi rows are "masala", "fry", "bhaji"…). */
  allow?: string[];
  /** Rows mentioning these are a different food ("Milk shake", "Paneer (from milk)"). */
  avoid?: string[];
  variants: VariantSpec[];
};

/** The curated order for the Indian staples in the v2.9 spec. */
export const VARIANT_GROUPS: VariantGroup[] = [
  {
    key: "roti",
    triggers: ["roti", "rotis", "chapati", "chapatis", "chapathi", "phulka", "phulkas", "fulka", "rotli"],
    generic: ["plain", "wheat", "atta", "home", "homemade"],
    search: "roti",
    requireTrigger: true,
    avoid: ["makki", "bajra", "jowar", "ragi", "rumali", "canai", "pizza", "noodles", "flour"],
    variants: [
      { label: "Wheat (atta) roti", words: [], q: "roti", plain: true },
      { label: "Maida roti", words: ["maida", "refined"], q: "maida roti" },
      { label: "Missi roti", words: ["missi"], q: "missi roti" },
      { label: "Tandoori roti", words: ["tandoori"], q: "tandoori roti" },
      { label: "Ghee roti", words: ["ghee", "butter"], q: "ghee roti" },
    ],
  },
  {
    key: "rice",
    triggers: ["rice", "chawal", "chaawal", "bhat", "bhaat", "chaval"],
    generic: ["white", "plain", "steamed", "cooked", "boiled", "basmati", "sona", "masoori"],
    search: "rice",
    requireTrigger: true,
    avoid: ["flour", "flakes", "puffed", "bran", "noodles", "cake", "pudding", "kheer", "wine", "milk", "paper", "vinegar", "cracker", "crackers", "cereal"],
    variants: [
      { label: "White rice", words: [], q: "rice cooked", plain: true },
      { label: "Brown rice", words: ["brown"], q: "brown rice" },
      { label: "Jeera rice", words: ["jeera", "cumin"], q: "jeera rice" },
      { label: "Fried rice", words: ["fried rice"], q: "fried rice" },
      { label: "Curd rice", words: ["curd", "dahi"], q: "curd rice" },
    ],
  },
  {
    key: "milk",
    triggers: ["milk", "doodh", "dudh", "dood"],
    generic: ["full", "cow", "normal", "regular", "plain", "whole"],
    search: "milk",
    requireTrigger: true,
    avoid: ["shake", "powder", "condensed", "chocolate", "coconut", "soy", "soya", "almond", "oat", "paneer", "curd", "tea", "coffee", "kheer", "cake", "bread", "evaporated", "sweets", "khoa", "chhena", "cheese", "yogurt", "breast", "human"],
    variants: [
      { label: "Full cream", words: ["full cream", "full fat", "whole"], q: "full cream milk" },
      { label: "Toned", words: ["toned"], not: ["double"], q: "toned milk" },
      { label: "Double toned", words: ["double toned"], q: "double toned milk" },
      { label: "Skimmed", words: ["skim", "skimmed", "fat free", "nonfat"], q: "skimmed milk" },
      { label: "Buffalo", words: ["buffalo", "bhains"], q: "buffalo milk" },
    ],
  },
  {
    key: "dal",
    triggers: ["dal", "daal", "dhal", "dhall", "daal"],
    generic: ["plain", "yellow", "homemade", "home"],
    search: "dal",
    requireTrigger: true,
    avoid: ["flour", "besan", "halwa", "vada", "pakora", "paratha", "puri", "kachori", "khichdi", "dhokla", "chilla", "biryani", "rice", "soup", "namkeen", "moth"],
    variants: [
      { label: "Toor / arhar dal", words: ["toor", "arhar", "tur", "tuvar", "red gram"], q: "toor dal" },
      { label: "Moong dal", words: ["moong", "mung", "green gram"], q: "moong dal" },
      { label: "Masoor dal", words: ["masoor", "lentil"], q: "masoor dal" },
      { label: "Chana dal", words: ["chana", "bengal gram"], q: "chana dal" },
      { label: "Dal tadka", words: ["tadka", "tarka", "fry"], q: "dal tadka" },
      { label: "Dal makhani", words: ["makhani"], q: "dal makhani" },
    ],
  },
  {
    key: "sabzi",
    triggers: ["sabzi", "sabji", "subzi", "subji", "sabjee", "shaak", "bhaji", "veg", "vegetable", "vegetables", "sabziyan"],
    generic: ["mixed", "mix", "sukhi", "dry", "homemade", "home"],
    search: "sabzi",
    requireTrigger: false,
    allow: ["sabzi", "masala", "curry", "bhaji", "fry", "poriyal", "thoran", "bharta"],
    avoid: ["pakora", "paratha", "sandwich", "soup", "pulao", "biryani", "raita", "roll", "cutlet", "cutlets", "kofta", "salad", "juice", "raw"],
    variants: [
      { label: "Aloo sabzi", words: ["aloo", "potato"], not: ["gobi", "matar", "palak", "baingan"], q: "aloo sabzi" },
      { label: "Mixed veg", words: ["mixed veg", "mix veg", "mixed vegetable", "mixed vegetables"], q: "mixed veg sabzi" },
      { label: "Bhindi", words: ["bhindi", "okra", "ladies finger", "lady finger"], q: "bhindi sabzi" },
      { label: "Gobi", words: ["gobi", "cauliflower"], q: "gobi sabzi" },
      { label: "Lauki", words: ["lauki", "bottle gourd", "doodhi"], q: "lauki sabzi" },
      { label: "Palak", words: ["palak", "spinach"], not: ["paneer"], q: "palak sabzi" },
    ],
  },
  {
    key: "paratha",
    triggers: ["paratha", "parathas", "parantha", "paranthas", "parotha", "prantha", "parotta"],
    generic: ["plain", "simple", "tawa", "homemade"],
    search: "paratha",
    requireTrigger: true,
    avoid: ["flour", "atta", "frozen"],
    variants: [
      { label: "Plain paratha", words: [], q: "plain paratha", plain: true },
      { label: "Aloo paratha", words: ["aloo", "potato"], q: "aloo paratha" },
      { label: "Gobi paratha", words: ["gobi", "cauliflower"], q: "gobi paratha" },
      { label: "Paneer paratha", words: ["paneer"], q: "paneer paratha" },
      { label: "Methi paratha", words: ["methi", "fenugreek"], q: "methi paratha" },
      { label: "Laccha paratha", words: ["laccha", "lachha", "lachcha"], q: "laccha paratha" },
    ],
  },
];

/** Kcal per 100 g differ by more than this share of the chosen row's → a real choice. */
export const VARIANT_KCAL_SPREAD = 0.12;
const MAX_VARIANTS = 6;

/** Lowercase letter words of a name ("Roti / chapati" → ["roti", "chapati"]). */
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}
/** " roti chapati " — for whole-word / whole-phrase tests. */
function padded(s: string): string {
  return ` ${words(s).join(" ")} `;
}
function hasPhrase(name: string, phrase: string): boolean {
  return padded(name).includes(` ${phrase} `);
}
const singular = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

/** Raw ingredients / flours never stand in for a cooked portion ("Toor dal (raw)" is 340 kcal, not 120). */
export function isRawRow(name: string): boolean {
  return /\braw\b|\buncooked\b|\bflour\b|\bpowder\b|\bdry\b|\bdried\b/i.test(name);
}

/** The curated group a name belongs to when it names only the staple ("roti", "do roti", "Roti / chapati", "doodh"). */
export function groupFor(text: string | null | undefined): VariantGroup | null {
  const w = words(text ?? "").filter((x) => !FILLER.has(x));
  if (!w.length) return null;
  for (const g of VARIANT_GROUPS) {
    const ok = new Set([...g.triggers, ...(g.generic ?? [])]);
    if (w.some((x) => g.triggers.includes(x)) && w.every((x) => ok.has(x) || ok.has(singular(x)))) return g;
  }
  return null;
}
/** Counting / linking words that don't make a name more specific. */
const FILLER = new Set(["ek", "do", "teen", "one", "two", "three", "a", "an", "of", "the", "ka", "ki", "ke", "wala", "wali", "and", "cream", "cooked", "boiled", "steamed", "hot", "fresh", "small", "medium", "large", "bowl", "katori", "glass", "cup", "piece", "pieces", "plate"]);

function specMatches(g: VariantGroup, spec: VariantSpec, name: string): boolean {
  if (spec.not?.some((n) => hasPhrase(name, n))) return false;
  if (spec.plain) {
    // The staple itself: names a trigger and no other spec's word ("Roti / chapati", "Rice, cooked").
    const others = g.variants.filter((v) => !v.plain).flatMap((v) => v.words);
    return !others.some((o) => hasPhrase(name, o)) && g.triggers.some((t) => hasPhrase(name, t));
  }
  return spec.words.some((w) => hasPhrase(name, w));
}

/** Whether a row can stand in for the group at all (right staple, not a different dish or a raw ingredient). */
function fitsGroup(g: VariantGroup, h: FoodHit): boolean {
  const n = h.name;
  if (isRawRow(n)) return false;
  if (g.avoid?.some((a) => hasPhrase(n, a))) return false;
  if (g.requireTrigger !== false && !g.triggers.some((t) => hasPhrase(n, t))) return false;
  const allowed = new Set([...g.triggers, ...(g.allow ?? []), ...g.variants.flatMap((v) => v.words.flatMap(words))]);
  return !words(n).some((w) => DISH_WORDS.has(w) && !allowed.has(w));
}

/** `hit` names the query and more ("roti" → "Maida roti"): every significant query word is in its name. */
function refines(query: string, h: FoodHit): boolean {
  const q = significantWords(query).map(singular);
  const n = new Set(significantWords(h.name).map(singular));
  return q.length > 0 && q.every((w) => n.has(w));
}

export function kcalDiffers(a: number, chosen: number): boolean {
  if (!(chosen > 0)) return a > 0;
  return Math.abs(a - chosen) / chosen > VARIANT_KCAL_SPREAD;
}

export function toVariant(h: FoodHit, label?: string): FoodVariant {
  const micros = microsFor(h, 100) as Record<string, number>;
  return {
    food_id: h.id,
    name: h.name,
    kcal_per_100g: Math.round(h.calories),
    protein_per_100g: h.protein_g,
    carbs_per_100g: h.carbs_g,
    fat_per_100g: h.fat_g,
    ...(Object.keys(micros).length ? { micros_per_100g: micros } : {}),
    source: h.source,
    ...(label ? { label } : {}),
  };
}

const byScore = (a: FoodHit, b: FoodHit) => b.score - a.score || a.name.length - b.name.length;

/**
 * The "Which one?" options for one item, from a pool of search hits. Empty when the item isn't
 * ambiguous: no option's kcal per 100 g differs from the chosen one's by more than 12 %.
 *
 *   query      the words the person used ("roti", "doodh") — or the item's name in the meal editor
 *   name       the chosen row's name (a second chance at the curated group: "Roti / chapati")
 *   chosenId   the chosen row (null for an AI estimate); it's kept in the list so a chip reads as picked
 *   chosenKcal kcal per 100 g of what's on the plate now
 */
export function pickVariants(input: { query: string; name?: string | null; chosenId: string | null; chosenKcal: number; pool: FoodHit[] }): FoodVariant[] {
  const { chosenId, chosenKcal } = input;
  const query = input.query.trim();
  const seen = new Set<string>();
  const uniquePool = input.pool.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
  const chosenRaw = uniquePool.find((h) => h.id === chosenId)?.name;
  const allowRaw = !!chosenRaw && isRawRow(chosenRaw);
  const out: { hit: FoodHit; label?: string }[] = [];
  const taken = new Set<string>();
  const takenNames = new Set<string>();
  const take = (hit: FoodHit, label?: string) => {
    const nk = hit.name.toLowerCase().trim();
    if (taken.has(hit.id) || takenNames.has(nk)) return;
    taken.add(hit.id);
    takenNames.add(nk);
    out.push({ hit, label });
  };

  // 1. The curated order for the staples: each spec takes its best-scoring matching row.
  const group = groupFor(query) ?? groupFor(input.name);
  if (group) {
    const fits = uniquePool.filter((h) => fitsGroup(group, h)).sort(byScore);
    for (const spec of group.variants) {
      const chosen = fits.find((h) => h.id === chosenId && specMatches(group, spec, h.name));
      const hit = chosen ?? fits.find((h) => !taken.has(h.id) && specMatches(group, spec, h.name));
      if (hit) take(hit, spec.label);
    }
  }

  // 2. Data-driven: close name matches (the parser's own isAcceptableMatch) that refine the words
  //    and are a genuinely different food by energy.
  if (query.length >= 2) {
    const extra = uniquePool
      .filter((h) => !taken.has(h.id) && h.id !== chosenId)
      .filter((h) => (allowRaw || !isRawRow(h.name)) && isAcceptableMatch(query, h) && refines(query, h))
      .filter((h) => (group ? fitsGroup(group, h) : true))
      .filter((h) => kcalDiffers(h.calories, chosenKcal))
      .sort(byScore);
    for (const h of extra) if (out.length < MAX_VARIANTS) take(h);
  }

  // The chosen row stays in the list (so its chip reads as picked) even when no spec named it.
  const chosenHit = chosenId ? uniquePool.find((h) => h.id === chosenId) : undefined;
  if (chosenHit && !taken.has(chosenHit.id)) out.unshift({ hit: chosenHit });

  const options = out.slice(0, MAX_VARIANTS + (chosenHit ? 1 : 0));
  const others = options.filter((o) => o.hit.id !== chosenId);
  if (!others.some((o) => kcalDiffers(o.hit.calories, chosenKcal))) return [];
  return options.map((o) => toVariant(o.hit, o.label));
}

/**
 * Search, then pickVariants. The group path runs one wide search plus one narrow search per curated
 * spec the wide one didn't cover (all cached 5 min in foodSearch.ts); anything else is one search.
 * Never throws — an empty list on any failure.
 */
export async function findVariants(input: {
  query: string;
  name?: string | null;
  chosenId: string | null;
  chosenKcal: number;
  search: (q: string, limit: number) => Promise<FoodHit[]>;
}): Promise<FoodVariant[]> {
  const query = input.query.trim().toLowerCase();
  const safe = (q: string, n: number) => input.search(q, n).catch(() => [] as FoodHit[]);
  try {
    const group = groupFor(query) ?? groupFor(input.name);
    let pool: FoodHit[];
    if (group) {
      const wide = await safe(group.search, 25);
      const fits = wide.filter((h) => fitsGroup(group, h));
      const missing = group.variants.filter((v) => !fits.some((h) => specMatches(group, v, h.name)));
      const narrow = await Promise.all(missing.map((v) => safe(v.q, 4)));
      pool = [...wide, ...narrow.flat()];
    } else {
      if (query.length < 2) return [];
      pool = await safe(query, 12);
    }
    return pickVariants({ query: group ? group.search : query, name: input.name, chosenId: input.chosenId, chosenKcal: input.chosenKcal, pool });
  } catch {
    return [];
  }
}

/** Kcal per 100 g of an item on the plate (0 when it has no grams). */
export function kcalPer100(item: { grams: number; calories: number }): number {
  return item.grams > 0 ? (item.calories * 100) / item.grams : 0;
}

const OIL_KCAL_PER_G = 8.84;

/**
 * The same row, swapped to `v` at the SAME grams: every number re-priced from the variant's per-100 g
 * (a restaurant portion keeps its hidden teaspoon of oil). Name / food_id / source follow the variant.
 */
export function swapToVariant<T extends { name: string; food_id: string | null; grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; source: string; micros?: Record<string, number | undefined>; cooked_in?: string | null }>(
  item: T,
  v: FoodVariant,
): T {
  const k = item.grams / 100;
  const oil = item.cooked_in === "restaurant" && restaurantOil(v.name) ? RESTAURANT_OIL_G : 0;
  const micros: Record<string, number> = {};
  for (const [key, val] of Object.entries(v.micros_per_100g ?? {})) if (Number.isFinite(val)) micros[key] = Math.round(val * k * 10) / 10;
  const restaurant = item.cooked_in === "restaurant" && /\(restaurant\)$/i.test(item.name);
  return {
    ...item,
    name: restaurant ? `${v.name} (restaurant)` : v.name,
    food_id: v.food_id,
    source: "table",
    calories: Math.round(v.kcal_per_100g * k + oil * OIL_KCAL_PER_G),
    protein_g: Math.round((v.protein_per_100g ?? 0) * k * 10) / 10,
    carbs_g: Math.round((v.carbs_per_100g ?? 0) * k * 10) / 10,
    fat_g: Math.round(((v.fat_per_100g ?? 0) * k + oil) * 10) / 10,
    micros,
  };
}
