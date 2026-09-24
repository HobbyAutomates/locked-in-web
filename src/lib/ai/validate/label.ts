/**
 * Deterministic sanity checks on a structured label report's numbers — pure functions, no model
 * call. Never blocks a scan: the flags are attached to the report as `validation` for the UI (or a
 * human) to look at twice. Wired into the label flow after `label_report` is structured.
 */

export type LabelFlag = { field: string; issue: string; suggestion: string };

export type LabelNumbers = {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  sugar_g?: number | null;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  salt_g?: number | null;
  serving_g?: number | null;
};

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const within = (a: number, b: number, pct: number) => b !== 0 && Math.abs(a - b) / Math.abs(b) <= pct;

export function validateLabel(n: LabelNumbers): LabelFlag[] {
  const flags: LabelFlag[] = [];
  const calories = num(n.calories);
  const protein = num(n.protein_g);
  const carbs = num(n.carbs_g);
  const fat = num(n.fat_g);
  const fiber = num(n.fiber_g);
  const sodium = num(n.sodium_mg);
  const salt = num(n.salt_g);
  const serving = num(n.serving_g);

  // Negative values or NaN anywhere.
  for (const [field, v] of Object.entries({ calories: n.calories, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g, sugar_g: n.sugar_g, fiber_g: n.fiber_g, sodium_mg: n.sodium_mg })) {
    if (v == null) continue;
    if (!Number.isFinite(Number(v))) flags.push({ field, issue: "Not a number", suggestion: "Re-read this field from the label." });
    else if (Number(v) < 0) flags.push({ field, issue: "Negative value", suggestion: "Re-read this field — nutrition values are never negative." });
  }

  const macroKcal = protein != null && carbs != null && fat != null ? protein * 4 + carbs * 4 + fat * 9 : null;

  // kJ read as kcal: the printed "calories" is close to kJ (≈4.184× what the macros imply as kcal).
  if (calories != null && macroKcal != null && macroKcal > 0) {
    if (within(calories, macroKcal * 4.184, 0.1) && !within(calories, macroKcal, 0.25)) {
      flags.push({ field: "calories", issue: `${calories} is close to ${Math.round(macroKcal * 4.184)} kJ, not ${Math.round(macroKcal)} kcal implied by the macros`, suggestion: "Check whether the label printed kJ and it was read as kcal." });
    }
    // Energy inconsistent with 4/4/9 macros by more than 25%, and it's not the kJ case above.
    else if (!within(calories, macroKcal, 0.25)) {
      flags.push({ field: "calories", issue: `${calories} kcal doesn't match ${Math.round(macroKcal)} kcal implied by ${protein}P/${carbs}C/${fat}F`, suggestion: "Re-check the energy and macro figures against the label." });
    }
  }

  // Per-serving values read as per-100 g: the "per 100 g" energy is suspiciously close to what
  // (macros × serving_g/100) would give per SERVING, i.e. the serving figure was copied into the
  // per-100 g field.
  if (calories != null && macroKcal != null && serving != null && serving > 0 && serving !== 100) {
    const perServingImplied = macroKcal * (serving / 100);
    if (within(calories, perServingImplied, 0.1) && !within(calories, macroKcal, 0.25)) {
      flags.push({ field: "per_100g", issue: `The "per 100 g" energy (${calories}) matches a per-${serving}g serving instead`, suggestion: "Check the label wasn't read per-serving into the per-100 g fields." });
    }
  }

  // Decimal slips: macro sum over 100 g per 100 g, or fat alone over 100 g.
  if (protein != null && carbs != null && fat != null) {
    const sum = protein + carbs + fat + (fiber ?? 0);
    if (sum > 100) flags.push({ field: "per_100g", issue: `Protein + carbs + fat${fiber != null ? " + fiber" : ""} = ${Math.round(sum * 10) / 10} g, over 100 g`, suggestion: "One of these likely has a decimal point in the wrong place." });
  }
  if (fat != null && fat > 100) flags.push({ field: "fat_g", issue: `${fat} g fat per 100 g exceeds 100 g`, suggestion: "Re-check the decimal point." });

  // Sodium mg vs salt g: salt ≈ sodium × 2.5 (sodium mg ≈ salt g × 400).
  if (sodium != null && salt != null && salt > 0) {
    const impliedSodium = salt * 400;
    if (!within(sodium, impliedSodium, 0.15)) {
      flags.push({ field: "sodium_mg", issue: `${sodium} mg sodium doesn't match ${salt} g salt (expected ≈${Math.round(impliedSodium)} mg)`, suggestion: "Re-check which of sodium / salt was printed on the label." });
    }
  }

  return flags;
}
