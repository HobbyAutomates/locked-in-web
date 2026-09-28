import type { MealItem } from "@/lib/types";

/**
 * v2.18 Area A, the small pure rules in one place (Android: util/FoodBits.kt, same numbers):
 *
 *   A5 portion reference  what the photo was sized against ("Sized using: katori").
 *   A6 leftovers          "Ate part of it": the eaten fraction and the rest; the rest is suggested
 *                         for 3 days ("Leftovers: ½ of paneer biryani · 320 kcal").
 *   A7 meal split         one dish, shares across people (equal by default); each squadmate gets a
 *                         pending entry at their share.
 *   A8 label vs reality   a label / barcode whose numbers differ from the web by > 20 % (and by a
 *                         meaningful amount) gets a calm alert with the source.
 *   A9 swaps              one smart swap after logging, priced at the same grams.
 *   A10 water from food   dal, chaas, fruit… count toward water when the setting is on.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A meal item at `k` × its amount (grams, macros, micros, servings, stored range all scale). */
export function scaleMealItem(item: MealItem, k: number): MealItem {
  const f = Math.max(0, k);
  const micros: NonNullable<MealItem["micros"]> = {};
  for (const [key, v] of Object.entries(item.micros ?? {})) if (v != null && Number.isFinite(v)) micros[key as keyof typeof micros] = r1(Number(v) * f);
  return {
    ...item,
    id: undefined,
    grams: r1(Number(item.grams) * f),
    calories: Math.round(Number(item.calories) * f),
    protein_g: r1(Number(item.protein_g) * f),
    carbs_g: r1(Number(item.carbs_g) * f),
    fat_g: r1(Number(item.fat_g) * f),
    micros,
    servings: item.servings != null && Number(item.servings) > 0 ? Math.round(Number(item.servings) * f * 100) / 100 : (item.servings ?? null),
    ...(item.kcal_low != null ? { kcal_low: Math.round(Number(item.kcal_low) * f) } : {}),
    ...(item.kcal_high != null ? { kcal_high: Math.round(Number(item.kcal_high) * f) } : {}),
  };
}

// ---- A5 portion reference ----

export const SCALE_REFS = ["katori", "plate", "spoon", "hand", "roti", "glass", "cup", "bowl"] as const;
export type ScaleRef = (typeof SCALE_REFS)[number];

/** The model's scale reference, cleaned: one of SCALE_REFS or null ("none", unknown, empty). */
export function cleanScaleRef(v: unknown): ScaleRef | null {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s || s === "none") return null;
  if (/katori|steel bowl/.test(s)) return "katori";
  if (/spoon|chammach|tbsp|tsp/.test(s)) return "spoon";
  if (/hand|palm|fist|finger/.test(s)) return "hand";
  if (/plate|thali/.test(s)) return "plate";
  if (/roti|chapati/.test(s)) return "roti";
  if (/glass|tumbler/.test(s)) return "glass";
  if (/cup|mug/.test(s)) return "cup";
  if (/bowl/.test(s)) return "bowl";
  return null;
}

export function sizedUsingLabel(ref: string | null | undefined): string | null {
  const r = cleanScaleRef(ref);
  return r ? `Sized using: ${r}` : null;
}

// ---- A6 leftovers ----

export const LEFTOVER_FRACTIONS = [1, 0.75, 0.5, 0.25] as const;
export const LEFTOVER_DAYS = 3;

export function fractionLabel(f: number): string {
  if (f >= 0.999) return "All of it";
  if (Math.abs(f - 0.75) < 0.01) return "¾";
  if (Math.abs(f - 0.5) < 0.01) return "½";
  if (Math.abs(f - 0.25) < 0.01) return "¼";
  if (Math.abs(f - 1 / 3) < 0.01) return "⅓";
  if (Math.abs(f - 2 / 3) < 0.01) return "⅔";
  return `${Math.round(f * 100)}%`;
}

/** Ate `eaten` (0 < eaten ≤ 1) of these items: what to log now and what's left over. */
export function splitEaten(items: MealItem[], eaten: number): { eaten: MealItem[]; left: MealItem[]; leftKcal: number; leftFraction: number } {
  const e = Math.min(1, Math.max(0.05, eaten));
  const left = e >= 0.999 ? [] : items.map((it) => scaleMealItem(it, 1 - e));
  return { eaten: e >= 0.999 ? items : items.map((it) => scaleMealItem(it, e)), left, leftKcal: left.reduce((a, i) => a + i.calories, 0), leftFraction: Math.round((1 - e) * 1000) / 1000 };
}

export type LeftoverRow = { id: string; name: string; items: MealItem[]; kcal: number; fraction_left: number; created_at: string; used_at?: string | null; dismissed_at?: string | null };

/** Still worth suggesting: not used, not dismissed, under 3 days old. */
export function leftoverActive(r: Pick<LeftoverRow, "created_at" | "used_at" | "dismissed_at">, now = Date.now()): boolean {
  if (r.used_at || r.dismissed_at) return false;
  const t = Date.parse(r.created_at);
  return Number.isFinite(t) && now - t < LEFTOVER_DAYS * 86_400_000 && now >= t - 60_000;
}

export function leftoverLine(r: Pick<LeftoverRow, "name" | "kcal" | "fraction_left">): string {
  return `${fractionLabel(r.fraction_left)} of ${r.name} · ${Math.round(r.kcal)} kcal`;
}

// ---- A7 meal split ----

/** Shares → fractions summing to 1 (non-positive shares drop to 0; all zero → equal). */
export function normalizeShares(shares: number[]): number[] {
  const clean = shares.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
  const sum = clean.reduce((a, s) => a + s, 0);
  if (!(sum > 0)) return shares.map(() => (shares.length ? 1 / shares.length : 0));
  return clean.map((s) => s / sum);
}

/** Each person's items at their share (index 0 = the logger). */
export function splitShares(items: MealItem[], shares: number[]): MealItem[][] {
  return normalizeShares(shares).map((f) => items.map((it) => scaleMealItem(it, f)));
}

// ---- A8 label vs reality ----

export type Per100 = { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null };
export type RealityGap = { field: "calories" | "protein_g" | "carbs_g" | "fat_g"; label: number; web: number; pct: number };

const MIN_ABS: Record<RealityGap["field"], number> = { calories: 25, protein_g: 2, carbs_g: 4, fat_g: 2 };
export const REALITY_THRESHOLD = 0.2;

/** Fields where the label and the web differ by more than 20 % (relative to the web) and a real amount. */
export function labelRealityGaps(label: Per100, web: Per100): RealityGap[] {
  const out: RealityGap[] = [];
  for (const f of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
    if (label[f] == null || web[f] == null) continue; // missing or null: nothing to compare
    const a = Number(label[f]);
    const b = Number(web[f]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) continue;
    const base = Math.max(b, a, 1);
    const diff = Math.abs(a - b);
    const pct = b > 0 ? diff / b : a > 0 ? 1 : 0;
    if (pct > REALITY_THRESHOLD && diff >= MIN_ABS[f] && diff / base > 0.12) out.push({ field: f, label: r1(a), web: r1(b), pct: Math.round(pct * 100) });
  }
  return out;
}

const FIELD_WORD: Record<RealityGap["field"], [string, string]> = { calories: ["Calories", "kcal"], protein_g: ["Protein", "g"], carbs_g: ["Carbs", "g"], fat_g: ["Fat", "g"] };

export function realityLine(g: RealityGap): string {
  const [w, u] = FIELD_WORD[g.field];
  return `${w}: label says ${g.label} ${u} per 100 g, the web says ${g.web} ${u} (${g.pct}% apart)`;
}

// ---- A9 swaps ----

type Swap = { from: RegExp; not?: RegExp; to: string; fromPer100: number; toPer100: number; why: string };
/** kcal per 100 g, home / typical Indian values. The swap keeps the same grams. */
export const SWAPS: Swap[] = [
  { from: /\b(butter|garlic|plain)?\s*naan\b/i, to: "tandoori roti", fromPer100: 320, toPer100: 260, why: "whole wheat, no butter" },
  { from: /\bmaida\b|\brumali\b/i, to: "wheat roti", fromPer100: 330, toPer100: 264, why: "more fibre, fewer kcal" },
  { from: /\bpuri\b|\bpoori\b/i, to: "roti", fromPer100: 360, toPer100: 264, why: "not deep-fried" },
  { from: /\bbhatur/i, to: "tandoori roti", fromPer100: 360, toPer100: 260, why: "not deep-fried" },
  { from: /\bparat?ha\b/i, not: /stuffed|aloo|paneer|gobi|methi/i, to: "roti", fromPer100: 310, toPer100: 264, why: "no layers of ghee" },
  { from: /\bfried rice\b/i, to: "veg pulao", fromPer100: 175, toPer100: 147, why: "less oil" },
  { from: /\bjeera rice\b|\bghee rice\b/i, to: "plain rice", fromPer100: 153, toPer100: 130, why: "no tempering ghee" },
  { from: /\bbiryani\b/i, to: "pulao with raita", fromPer100: 190, toPer100: 150, why: "less ghee" },
  { from: /\bdal makhani\b/i, to: "dal tadka", fromPer100: 187, toPer100: 113, why: "no butter and cream" },
  { from: /\b(paneer butter masala|butter paneer|shahi paneer|paneer makhani)\b/i, to: "paneer tikka", fromPer100: 233, toPer100: 220, why: "no cream gravy" },
  { from: /\b(butter chicken|murgh makhani|chicken makhani)\b/i, to: "chicken tikka", fromPer100: 220, toPer100: 167, why: "same protein, no cream" },
  { from: /\bmutton\b/i, to: "chicken curry", fromPer100: 200, toPer100: 160, why: "leaner meat" },
  { from: /\bsamosa\b/i, to: "dhokla", fromPer100: 300, toPer100: 165, why: "steamed, not fried" },
  { from: /\b(pakora|pakoda|bhajji|bhajiya|bhaji)\b/i, not: /pav bhaji/i, to: "dhokla", fromPer100: 300, toPer100: 165, why: "steamed, not fried" },
  { from: /\bmasala dosa\b/i, to: "plain dosa with sambar", fromPer100: 200, toPer100: 150, why: "no potato masala" },
  { from: /\b(sweet )?lassi\b/i, not: /salt|namkeen/i, to: "chaas", fromPer100: 80, toPer100: 18, why: "no sugar" },
  { from: /\b(cola|coke|pepsi|soft drink|cold drink|sprite|thums up|fanta)\b/i, not: /diet|zero/i, to: "nimbu pani (no sugar)", fromPer100: 42, toPer100: 5, why: "no added sugar" },
  { from: /\b(chips|wafers|kurkure)\b/i, to: "roasted makhana", fromPer100: 540, toPer100: 350, why: "roasted, not fried" },
  { from: /\b(fries|french fries)\b/i, to: "roasted potato wedges", fromPer100: 312, toPer100: 150, why: "baked, not fried" },
  { from: /\bgulab jamun\b/i, to: "rasgulla", fromPer100: 380, toPer100: 186, why: "not fried in sugar syrup" },
  { from: /\bice cream\b/i, to: "curd with fruit", fromPer100: 207, toPer100: 90, why: "less sugar, more protein" },
  { from: /\b(white sauce|alfredo|creamy) pasta\b/i, to: "red sauce pasta", fromPer100: 190, toPer100: 150, why: "no cream" },
  { from: /\bchai\b|\bmasala tea\b/i, not: /no sugar|without sugar|sugar[- ]?free/i, to: "chai without sugar", fromPer100: 53, toPer100: 35, why: "no sugar" },
];

export type SwapHint = { itemName: string; to: string; delta: number; line: string; why: string };

/** The one swap with the biggest saving (≥ 25 kcal) on these items, or null. */
export function pickSwap(items: Pick<MealItem, "name" | "grams">[]): SwapHint | null {
  let best: SwapHint | null = null;
  for (const it of items) {
    const name = String(it.name ?? "");
    const grams = Number(it.grams) || 0;
    if (!(grams > 0)) continue;
    const s = SWAPS.find((x) => x.from.test(name) && !(x.not && x.not.test(name)) && !name.toLowerCase().includes(x.to.toLowerCase()));
    if (!s) continue;
    const delta = Math.round((grams * (s.toPer100 - s.fromPer100)) / 100);
    if (delta > -25) continue;
    if (!best || delta < best.delta) {
      const to = s.to.charAt(0).toUpperCase() + s.to.slice(1);
      best = { itemName: name, to, delta, why: s.why, line: `${to} instead of ${name.toLowerCase()}: −${Math.abs(delta)} kcal` };
    }
  }
  return best;
}

// ---- A10 water from food ----

const WATER: [RegExp, number][] = [
  [/coconut water|nariyal pani|tender coconut/i, 0.95],
  [/\bchaas\b|buttermilk|chhach|mattha|lassi/i, 0.9],
  [/\bsoup\b|\brasam\b/i, 0.92],
  [/\bmilk\b|\bdoodh\b/i, 0.88],
  [/\b(chai|tea|coffee|kaapi)\b/i, 0.9],
  [/juice|shake|smoothie|nimbu pani|lemonade|sharbat/i, 0.85],
  [/watermelon|tarbooz|cucumber|kheera|kakdi/i, 0.93],
  [/\b(orange|mosambi|papaya|pineapple|grapes|strawberr|melon|musk)/i, 0.87],
  [/\b(apple|pear|guava|pomegranate|anar|fruit)/i, 0.84],
  [/\bsalad\b/i, 0.9],
  [/\b(curd|dahi|yogurt|raita)\b/i, 0.85],
  [/\b(dal|daal|sambar|sambhar|kadhi)\b/i, 0.8],
];

/** ml of water in one item (0 for anything not on the list, or a dry product). */
export function waterMl(item: Pick<MealItem, "name" | "grams">): number {
  const name = String(item.name ?? "");
  if (/powder|dry|mix\b|premix|biscuit|chips/i.test(name)) return 0;
  const hit = WATER.find(([re]) => re.test(name));
  return hit ? Math.round((Number(item.grams) || 0) * hit[1]) : 0;
}

/** ml of water in a day's meals. */
export function waterFromMeals(meals: { items: Pick<MealItem, "name" | "grams">[] }[]): number {
  return meals.reduce((a, m) => a + m.items.reduce((b, it) => b + waterMl(it), 0), 0);
}
