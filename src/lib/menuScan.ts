import type { MealItem } from "./types";
import { dietConflicts, type DietMode } from "./dietModes";
import { fitScore, proteinScore, type Remaining } from "./whatToEat";

/**
 * v2.13 restaurant menu scan (spec §10), the pure half: cleaning the model's dishes, the diet-mode
 * check, the best-pick ranking and the meal item a tapped dish becomes. The route is
 * src/app/api/scan-menu/route.ts; Android renders the same JSON.
 *
 * Best pick = the highest score among dishes that fit the diet mode:
 *   0.5 × protein density (mid protein per 100 mid kcal, as in what-to-eat)
 *   + 0.3 × fits the kcal left today (mid kcal)
 *   + 0.2 × confidence (high 1, medium 0.6, low 0.3)
 */

export type Confidence = "low" | "medium" | "high";
export type ContainsTag = "meat" | "fish" | "egg" | "dairy" | "onion_garlic" | "root_veg" | "honey";

export type MenuDish = {
  name: string;
  description: string;
  section: string | null;
  /** "1 plate (about 350 g)". */
  portion: string;
  grams: number;
  kcal_low: number;
  kcal_high: number;
  protein_low: number;
  protein_high: number;
  carbs_g: number;
  fat_g: number;
  confidence: Confidence;
  /** One line on how sure the estimate is and why. */
  why: string;
  veg: boolean | null;
  contains: ContainsTag[];
  price: string | null;
  fits_diet: boolean;
  /** Why it doesn't fit the diet mode ("meat", "egg"…), empty when it fits. */
  diet_conflicts: string[];
  score: number;
  best_pick: boolean;
};

export type MenuScanResult = {
  id: string | null;
  kind: "menu";
  restaurant: string | null;
  dishes: MenuDish[];
  best_pick_index: number | null;
  remaining: Remaining;
  diet_mode: DietMode;
  note: string;
  thumb_path?: string | null;
};

const CONF_SCORE: Record<Confidence, number> = { high: 1, medium: 0.6, low: 0.3 };
const CONF_NUM: Record<Confidence, number> = { high: 0.85, medium: 0.6, low: 0.35 };
const TAGS: ContainsTag[] = ["meat", "fish", "egg", "dairy", "onion_garlic", "root_veg", "honey"];

const num = (v: unknown, lo: number, hi: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};
const str = (v: unknown, max = 160): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A model dish, cleaned: ranges ordered, clamped to sane values, unknown fields dropped. Null when unusable. */
export function sanitizeDish(raw: unknown): Omit<MenuDish, "fits_diet" | "diet_conflicts" | "score" | "best_pick"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 80);
  if (!name) return null;
  let kl = Math.round(num(r.kcal_low, 0, 4000));
  let kh = Math.round(num(r.kcal_high, 0, 4000));
  if (kl > kh) [kl, kh] = [kh, kl];
  if (kh <= 0) return null;
  if (kl <= 0) kl = Math.round(kh * 0.7);
  let pl = Math.round(num(r.protein_low, 0, 250) * 10) / 10;
  let ph = Math.round(num(r.protein_high, 0, 250) * 10) / 10;
  if (pl > ph) [pl, ph] = [ph, pl];
  // Protein can't carry more energy than the dish has.
  ph = Math.min(ph, Math.round((kh / 4) * 10) / 10);
  pl = Math.min(pl, ph);
  const conf = r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
  const contains = Array.isArray(r.contains) ? (r.contains.filter((t) => TAGS.includes(t as ContainsTag)) as ContainsTag[]) : [];
  return {
    name,
    description: str(r.description, 200),
    section: str(r.section, 40) || null,
    portion: str(r.portion, 60) || "1 serving",
    grams: Math.round(num(r.grams, 0, 2000)),
    kcal_low: kl,
    kcal_high: kh,
    protein_low: pl,
    protein_high: ph,
    carbs_g: Math.round(num(r.carbs_g, 0, 600)),
    fat_g: Math.round(num(r.fat_g, 0, 300)),
    confidence: conf,
    why: str(r.why, 160),
    veg: typeof r.veg === "boolean" ? r.veg : null,
    contains: [...new Set(contains)],
    price: str(r.price, 20) || null,
  };
}

export const midKcal = (d: Pick<MenuDish, "kcal_low" | "kcal_high">) => Math.round((d.kcal_low + d.kcal_high) / 2);
export const midProtein = (d: Pick<MenuDish, "protein_low" | "protein_high">) => Math.round(((d.protein_low + d.protein_high) / 2) * 10) / 10;

/** Which diet-mode exclusions a dish hits, from its name and the model's "contains" tags. */
export function menuConflicts(mode: DietMode, d: Pick<MenuDish, "name" | "description" | "contains" | "veg">): string[] {
  const out = new Set(dietConflicts(mode, `${d.name} ${d.description}`));
  const tag = (t: ContainsTag) => d.contains.includes(t);
  const noMeat = mode === "vegetarian" || mode === "eggetarian" || mode === "vegan" || mode === "jain";
  if (noMeat && (tag("meat") || d.veg === false) && !tag("egg")) out.add("meat");
  if (noMeat && tag("fish")) out.add("fish");
  if ((mode === "vegetarian" || mode === "vegan" || mode === "jain") && tag("egg")) out.add("egg");
  if (mode === "vegan" && tag("dairy")) out.add("dairy");
  if ((mode === "vegan" || mode === "jain") && tag("honey")) out.add("honey");
  if (mode === "jain" && (tag("onion_garlic") || tag("root_veg"))) out.add("roots");
  return [...out];
}

export function dishScore(d: Pick<MenuDish, "kcal_low" | "kcal_high" | "protein_low" | "protein_high" | "confidence">, remaining: Remaining): number {
  const s = 0.5 * proteinScore(midProtein(d), midKcal(d)) + 0.3 * fitScore(midKcal(d), remaining.kcal) + 0.2 * CONF_SCORE[d.confidence];
  return Math.round(s * 1000) / 1000;
}

/** Cleans, scores and flags the best pick. Order is the menu's own (the flag marks the pick). */
export function rankMenu(raw: unknown[], remaining: Remaining, mode: DietMode): { dishes: MenuDish[]; best: number | null } {
  const dishes: MenuDish[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const d = sanitizeDish(r);
    if (!d || seen.has(d.name.toLowerCase())) continue;
    seen.add(d.name.toLowerCase());
    const conflicts = menuConflicts(mode, d);
    dishes.push({ ...d, fits_diet: conflicts.length === 0, diet_conflicts: conflicts, score: dishScore(d, remaining), best_pick: false });
  }
  let best: number | null = null;
  dishes.forEach((d, i) => {
    if (!d.fits_diet) return;
    if (best === null || d.score > dishes[best].score) best = i;
  });
  if (best !== null) dishes[best].best_pick = true;
  return { dishes, best };
}

/** A tapped dish as a meal item: the middle of each range, an AI estimate (restaurant portion). */
export function dishMealItem(d: MenuDish): MealItem {
  const kcal = midKcal(d);
  const protein = midProtein(d);
  // Carbs and fat scaled so the macros agree with the mid calories when the model's pair is off.
  const macroKcal = protein * 4 + d.carbs_g * 4 + d.fat_g * 9;
  const k = macroKcal > 0 ? Math.max(0, kcal - protein * 4) / Math.max(1, d.carbs_g * 4 + d.fat_g * 9) : 0;
  return {
    food_id: null,
    name: d.name,
    grams: d.grams > 0 ? d.grams : Math.max(100, Math.round(kcal / 1.8)),
    calories: kcal,
    protein_g: protein,
    carbs_g: Math.round(d.carbs_g * k * 10) / 10,
    fat_g: Math.round(d.fat_g * k * 10) / 10,
    source: "estimated",
    confidence: CONF_NUM[d.confidence],
    micros: {},
    unit: "g",
    servings: null,
    cooked_in: "restaurant",
  };
}
