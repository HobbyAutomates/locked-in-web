/**
 * Pure per-100 g nutrition checks shared by the live lookup (liveFood.ts), the web lookup
 * (webFood.ts) and scripts/check-match.ts. No DB, no model.
 */

export type RawNutrition = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
};

/**
 * Sanity-check a per-100 g nutrition answer. Rejects it if calories are implausibly high, any macro
 * is negative, the macros sum past 100 g, or the stated calories don't roughly match the Atwater
 * calculation (4p + 4c + 9f), within ~25% + 15 kcal.
 */
export function sanityCheck(raw: RawNutrition | null | undefined): RawNutrition | null {
  if (!raw) return null;
  const calories = Number(raw.calories);
  const protein_g = Number(raw.protein_g);
  const carbs_g = Number(raw.carbs_g);
  const fat_g = Number(raw.fat_g);
  if (![calories, protein_g, carbs_g, fat_g].every(Number.isFinite)) return null;
  if (calories < 0 || calories > 905) return null; // pure fats are 884-902
  if (protein_g < 0 || carbs_g < 0 || fat_g < 0) return null;
  if (protein_g + carbs_g + fat_g > 100) return null;
  const atwater = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  if (Math.abs(atwater - calories) > calories * 0.25 + 15) return null;

  const num = (v: unknown) => (v == null ? null : Number(v));
  const fiber_g = num(raw.fiber_g);
  const sugar_g = num(raw.sugar_g);
  const sodium_mg = num(raw.sodium_mg);
  if (fiber_g != null && (!Number.isFinite(fiber_g) || fiber_g < 0 || fiber_g > 100)) return null;
  if (sugar_g != null && (!Number.isFinite(sugar_g) || sugar_g < 0 || sugar_g > carbs_g + 5)) return null;
  if (sodium_mg != null && (!Number.isFinite(sodium_mg) || sodium_mg < 0 || sodium_mg > 20000)) return null;

  return { calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg };
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "food"
  );
}
