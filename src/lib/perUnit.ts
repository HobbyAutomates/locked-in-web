/**
 * v2.15 "Calories per roti" and "My calories" maths. Pure (no DB, no React) — shared by the web
 * item editor (QuantitySheet), the correction / override API routes and scripts/check-match.ts.
 * Android mirrors it in util/PerUnit.kt.
 *
 *   per unit:  total = count × per-unit kcal. Protein / carbs / fat scale by the same kcal ratio,
 *              unless the person typed per-unit macros too (then count × those).
 *   per 100 g: total = grams / 100 × per-100 g kcal, macros the same way.
 *   correct:   the person's own totals replace ours; macros they left blank scale with the kcal.
 */
import { foodKey } from "./foodKey";

export type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type MacroEdits = { protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null };

const r1 = (v: number) => Math.round(v * 10) / 10;
const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Scale macros so calories become `kcal`; per-macro `edits` (already totals) win over the scaling. */
export function scaleToKcal<T extends Macros>(item: T, kcal: number, edits: MacroEdits = {}): T {
  const target = Math.max(0, Math.round(kcal));
  const f = item.calories > 0 ? target / item.calories : 0;
  return {
    ...item,
    calories: target,
    protein_g: ok(edits.protein_g) ? r1(edits.protein_g) : r1(item.protein_g * f),
    carbs_g: ok(edits.carbs_g) ? r1(edits.carbs_g) : r1(item.carbs_g * f),
    fat_g: ok(edits.fat_g) ? r1(edits.fat_g) : r1(item.fat_g * f),
  };
}

/** kcal of ONE unit, from the item's total and its count (null when there's no count). */
export function perUnitKcal(item: Macros, count: number | null | undefined): number | null {
  return count && count > 0 ? Math.round(item.calories / count) : null;
}

/** kcal per 100 g, from the item's total and its grams (null when there are no grams). */
export function per100Kcal(item: Macros & { grams: number }): number | null {
  return item.grams > 0 ? Math.round((item.calories / item.grams) * 100) : null;
}

/**
 * Rescale an item to `count` units at `unitKcal` each. `unitMacros` are per ONE unit (from the
 * person's saved override) and replace the proportional scaling when given.
 */
export function rescalePerUnit<T extends Macros>(item: T, count: number, unitKcal: number, unitMacros: MacroEdits = {}): T & { per_unit_kcal: number } {
  const n = Math.max(0, count);
  const times = (v: number | null | undefined) => (ok(v) ? v * n : undefined);
  const out = scaleToKcal(item, unitKcal * n, { protein_g: times(unitMacros.protein_g), carbs_g: times(unitMacros.carbs_g), fat_g: times(unitMacros.fat_g) });
  return { ...out, per_unit_kcal: Math.round(unitKcal) };
}

/** Rescale a loose (gram-weighed) item to `per100` kcal per 100 g, macros proportionally. */
export function rescalePer100<T extends Macros & { grams: number }>(item: T, per100: number, macros100: MacroEdits = {}): T {
  const k = item.grams / 100;
  const times = (v: number | null | undefined) => (ok(v) ? v * k : undefined);
  return scaleToKcal(item, per100 * k, { protein_g: times(macros100.protein_g), carbs_g: times(macros100.carbs_g), fat_g: times(macros100.fat_g) });
}

/** "Correct the numbers": the person's totals win, blank macros follow the kcal. Marks it user_verified. */
export function applyCorrection<T extends Macros>(item: T, user: { calories: number } & MacroEdits): T & { user_verified: true } {
  return { ...scaleToKcal(item, user.calories, user), user_verified: true };
}

/** % error of the app's kcal against the person's (signed: + means we over-estimated). */
export function pctError(appKcal: number, userKcal: number): number | null {
  if (!(userKcal > 0) || !Number.isFinite(appKcal)) return null;
  return Math.round(((appKcal - userKcal) / userKcal) * 1000) / 10;
}

/** Median of a list (null when empty). */
export function median(xs: number[]): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10;
}

/**
 * The key a per-user override is stored under: the food's normalised name (foodKey: lowercase,
 * quantities stripped — "2 Roti" → "roti"), so a roti logged by text, photo or search shares one
 * override; the food id only when the name normalises to nothing. Android sends the display name
 * and lets the server normalise (GET/PUT /api/food-overrides).
 */
export function overrideKey(item: { food_id?: string | null; name: string }): string {
  return foodKey(item.name) || (item.food_id ? `id:${item.food_id}` : "");
}
