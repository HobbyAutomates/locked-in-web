import { itemQtyLabel, priceItem, savedUnitOf, type QuantityFood } from "./quantity";
import type { MealItem, PresetServing } from "./types";

/**
 * v2.17 "Recent" (asked for by Ayan): the person's past logged foods and label / barcode scans, on
 * the Scan screen and on Add food. Deduped by food (food_id, else the lower-cased name), newest
 * first, up to 12. Each carries the item at its LAST-USED amount, so "+" re-adds it in one tap, and
 * a QuantityFood so it can be adjusted first. Built only from existing data (meal_items and
 * label_scans), no schema change. Pure; checked by scripts/check-v217.ts. Android: the same rules.
 */
export const RECENT_LIMIT = 12;

export type RecentKind = "food" | "label" | "barcode";

export type RecentFood = {
  key: string;
  name: string;
  /** The item at the last-used amount (for a scan never logged: 1 serving, else 100 g). */
  item: MealItem;
  /** "2 roti", "1 serving", "180 g". */
  qty: string;
  kcal: number;
  image: string | null;
  kind: RecentKind;
  /** When it was last logged / scanned (ISO). */
  at: string;
  /** For "adjust first": per-100 g values and the serving it was counted in. */
  food: QuantityFood;
  servingLabel: string | null;
};

/** A logged meal as the recents need it. */
export type RecentMeal = { created_at: string; items: MealItem[] };

/** A label / barcode scan with its per-100 g numbers (ScanHistoryItem + the report's nutrition). */
export type RecentScan = {
  id: string;
  kind: "label" | "barcode" | "photo" | "menu";
  product: string;
  created_at: string;
  image_url: string | null;
  per100?: { calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null } | null;
  serving_g?: number | null;
};

/** "Amul  Gold Milk " → "amul gold milk". */
export function recentKey(foodId: string | null | undefined, name: string): string {
  return foodId ? `f:${foodId}` : `n:${name.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

const perHundred = (it: MealItem) => {
  const k = it.grams > 0 ? 100 / it.grams : 0;
  return { calories: it.calories * k, protein_g: it.protein_g * k, carbs_g: it.carbs_g * k, fat_g: it.fat_g * k };
};

function fromItem(it: MealItem, at: string): RecentFood | null {
  const grams = Number(it.grams);
  if (!(grams > 0) || !it.name?.trim()) return null;
  const unit: PresetServing | null = savedUnitOf(it);
  const micros: Record<string, number> = {};
  for (const [k, v] of Object.entries(it.micros ?? {})) if (v != null && Number.isFinite(v)) micros[k] = (v * 100) / grams;
  const food: QuantityFood = {
    name: it.name,
    food_id: it.food_id,
    per100: perHundred(it),
    micros,
    servings: unit ? [unit] : [],
    defaultServing: unit?.label ?? null,
    source: it.source,
  };
  const item: MealItem = { ...it, id: undefined, grams, servings: it.servings == null ? null : Number(it.servings) };
  return {
    key: recentKey(it.food_id, it.name),
    name: it.name,
    item,
    qty: itemQtyLabel(item, unit?.label ?? null),
    kcal: Math.round(Number(it.calories) || 0),
    image: it.image_url ?? null,
    kind: it.source === "scan" ? "label" : "food",
    at,
    food,
    servingLabel: unit?.label ?? null,
  };
}

function fromScan(s: RecentScan): RecentFood | null {
  if (s.kind !== "label" && s.kind !== "barcode") return null;
  const p = s.per100;
  const name = s.product?.trim();
  if (!p || !name || p.calories == null || !Number.isFinite(Number(p.calories))) return null;
  const serving = s.serving_g && s.serving_g > 0 ? [{ label: "1 serving", grams: s.serving_g }] : [];
  const food: QuantityFood = {
    name,
    food_id: null,
    per100: { calories: Number(p.calories ?? 0), protein_g: Number(p.protein_g ?? 0), carbs_g: Number(p.carbs_g ?? 0), fat_g: Number(p.fat_g ?? 0) },
    servings: serving,
    defaultServing: serving[0]?.label ?? null,
    source: "scan",
  };
  const item = priceItem(food, serving.length ? { unit: "serving", value: 1 } : { unit: "g", value: 100 });
  return {
    key: recentKey(null, name),
    name,
    item: { ...item, image_url: s.image_url },
    qty: serving.length ? "1 serving" : "100 g",
    kcal: Math.round(item.calories),
    image: s.image_url,
    kind: s.kind,
    at: s.created_at,
    food,
    servingLabel: serving[0]?.label ?? null,
  };
}

const time = (iso: string) => {
  const t = Date.parse(iso.replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
};

/**
 * Past foods and scans, newest first, one entry per food, at most `limit`. When a product was both
 * scanned and logged, the entry uses the newest LOGGED amount (the last-used quantity) and sits at
 * the newer of the two times.
 */
export function recentFoods(meals: RecentMeal[], scans: RecentScan[] = [], limit = RECENT_LIMIT): RecentFood[] {
  const logged: RecentFood[] = [];
  for (const m of meals) for (const it of m.items ?? []) {
    const r = fromItem(it, m.created_at);
    if (r) logged.push(r);
  }
  const scanned = scans.map(fromScan).filter((r): r is RecentFood => r !== null);
  // Newest first; a tie (items of one meal) keeps the meal's own item order.
  const byTime = (list: RecentFood[]) => list.map((r, i) => ({ r, i })).sort((a, b) => time(b.r.at) - time(a.r.at) || a.i - b.i).map((x) => x.r);
  const newestLog = new Map<string, RecentFood>();
  for (const r of byTime(logged)) {
    const n = recentKey(null, r.name);
    if (!newestLog.has(n)) newestLog.set(n, r);
  }
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const r of byTime([...logged, ...scanned])) {
    const nameKey = recentKey(null, r.name);
    if (seen.has(r.key) || seen.has(nameKey)) continue;
    const log = r.kind === "label" || r.kind === "barcode" ? newestLog.get(nameKey) : undefined;
    const pick = log && log !== r ? { ...log, at: r.at, image: log.image ?? r.image, kind: r.kind } : r;
    seen.add(r.key);
    seen.add(pick.key);
    seen.add(nameKey);
    out.push(pick);
    if (out.length >= limit) break;
  }
  return out;
}
