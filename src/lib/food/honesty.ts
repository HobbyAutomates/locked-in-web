import type { MealItem } from "@/lib/types";

/**
 * v2.18 A3 honest confidence, pure. Every logged item gets a ± kcal range and every day an accuracy
 * score (0–100) with the vaguest entries to fix first. Android: util/FoodHonesty.kt (same numbers).
 *
 * The range is the stored kcal_low / kcal_high (schema_v42: photo gram ranges, menu and order ranges)
 * when there is one; otherwise it is derived from where the numbers came from:
 *
 *   your own numbers (user_verified)              ±5 %
 *   a scanned label / barcode (source "scan")     ±8 %
 *   your recipe (unit "recipe")                   ±10 %
 *   the food table (source "table")               ±12 %
 *   web-checked (source_urls), by confidence      ±12 % (≥ 0.85) · ±20 % (≥ 0.55) · ±30 %
 *   an AI estimate with no source                 ±20 % (≥ 0.85) · ±30 % (≥ 0.55) · ±40 %
 *
 * A meal's ± adds the items' half-widths in quadrature (independent errors), never plain sums.
 * Accuracy score = 100 × (1 − kcal-weighted relative half-width ÷ 0.4), clamped to 0–100: a day of
 * label scans and your own numbers is ~85–95, a day of unsourced guesses is ~0–10.
 */

export type Range = { low: number; high: number; plusMinus: number; rel: number };
export type RangeItem = Pick<MealItem, "calories" | "source" | "confidence"> & Partial<Pick<MealItem, "user_verified" | "unit" | "source_urls" | "kcal_low" | "kcal_high" | "name">>;

export const WORST_REL = 0.4;

/** Relative half-width (0.05 = ±5 %) of an item's calories. */
export function relUncertainty(it: RangeItem): number {
  if (it.user_verified) return 0.05;
  if (it.source === "scan") return 0.08;
  if (it.unit === "recipe") return 0.1;
  if (it.source === "table") return 0.12;
  const c = typeof it.confidence === "number" && Number.isFinite(it.confidence) ? it.confidence : 0.5;
  const web = !!it.source_urls?.length;
  if (c >= 0.85) return web ? 0.12 : 0.2;
  if (c >= 0.55) return web ? 0.2 : 0.3;
  return web ? 0.3 : WORST_REL;
}

export function kcalRange(it: RangeItem): Range {
  const kcal = Math.max(0, Number(it.calories) || 0);
  const lo = it.kcal_low != null ? Number(it.kcal_low) : NaN;
  const hi = it.kcal_high != null ? Number(it.kcal_high) : NaN;
  if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo && lo >= 0 && hi > 0) {
    const pm = Math.round((hi - lo) / 2);
    return { low: Math.round(lo), high: Math.round(hi), plusMinus: pm, rel: kcal > 0 ? pm / kcal : 0 };
  }
  const rel = relUncertainty(it);
  const pm = Math.round(kcal * rel);
  return { low: Math.max(0, Math.round(kcal - pm)), high: Math.round(kcal + pm), plusMinus: pm, rel };
}

/** "±40" for display (a range under 5 kcal isn't worth showing). */
export function plusMinusLabel(it: RangeItem): string {
  const r = kcalRange(it);
  return r.plusMinus >= 5 ? `±${r.plusMinus}` : "";
}

/** Several items' total ± (quadrature). */
export function totalPlusMinus(items: RangeItem[]): number {
  return Math.round(Math.sqrt(items.reduce((a, it) => a + kcalRange(it).plusMinus ** 2, 0)));
}

export type VagueItem = { mealId: string; index: number; name: string; kcal: number; plusMinus: number };
export type DayAccuracy = { score: number | null; items: number; vague: VagueItem[]; label: string };

/** The day's accuracy score and the entries worth fixing (biggest ± first, max 3). null score = nothing logged. */
export function dayAccuracy(meals: { id: string; items: RangeItem[] }[]): DayAccuracy {
  let kcal = 0;
  let weighted = 0;
  let n = 0;
  const vague: VagueItem[] = [];
  for (const m of meals) {
    m.items.forEach((it, index) => {
      const c = Math.max(0, Number(it.calories) || 0);
      const r = kcalRange(it);
      n++;
      kcal += c;
      weighted += c * Math.min(WORST_REL, r.rel);
      // "Vague": at least ±25 % AND at least ±40 kcal (a ±30 % apple isn't worth a nudge).
      if (r.rel >= 0.25 && r.plusMinus >= 40) vague.push({ mealId: m.id, index, name: String(it.name ?? "Item"), kcal: Math.round(c), plusMinus: r.plusMinus });
    });
  }
  if (!n || kcal <= 0) return { score: null, items: n, vague: [], label: "" };
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - weighted / kcal / WORST_REL))));
  vague.sort((a, b) => b.plusMinus - a.plusMinus);
  return { score, items: n, vague: vague.slice(0, 3), label: accuracyWord(score) };
}

export function accuracyWord(score: number): string {
  if (score >= 80) return "Sharp";
  if (score >= 60) return "Good";
  if (score >= 40) return "Rough";
  return "Guessy";
}

/** kcal_low / kcal_high to store for a photo item from its gram range (null when there is none). */
export function rangeFromGrams(it: { calories: number; grams: number; grams_low?: number | null; grams_high?: number | null }): { kcal_low: number; kcal_high: number } | null {
  if (!(it.grams > 0) || it.grams_low == null || it.grams_high == null || !(it.grams_high > it.grams_low)) return null;
  // A range that no longer brackets the amount (the grams were edited) says nothing about it.
  if (it.grams < it.grams_low || it.grams > it.grams_high) return null;
  const rate = it.calories / it.grams;
  return { kcal_low: Math.round(rate * it.grams_low), kcal_high: Math.round(rate * it.grams_high) };
}
