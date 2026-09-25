/**
 * `npx tsx scripts/check-label-parse.ts` — offline check of src/lib/labelParse.ts against the
 * real-world label transcripts that motivated it (v2.7): the "Omega Loaded Mix Seeds" front-only
 * scan that still produced a full nutrition table, a kJ-only label, and a per-serving-only label.
 */
import { extractBarcode, parseNutritionLabel, reportNutritionTrusted, sanityCheckPer100 } from "../src/lib/labelParse";
import { applyParsedNutrition } from "../src/lib/scanFlows";

const FRONT_OF_PACK_ONLY = `Omega loaded NIX SEEDS Roasted & Salted 21g Non GMO Protein
Healthy Snack with loaded Nutrient
8 i9 0 6120531115`;

const SEEDS_BACK_LABEL = `Nutritional Information per 100 g (approx)
Energy 586.76 Kcal
Total Fat 43.4 g
Trans Fat 0.0 g
Cholesterol 0.0 mg
Sodium 126.42 mg
Total Carbohydrates 28.06 g
Total Sugar 0 g
Added Sugar 0 g
Protein 20.98 g`;

const KJ_LABEL = `Nutrition Information per 100g
Energy 1780kJ (425kcal)
Protein 8.2g
Carbohydrate 60g
of which sugars 20g
Fat 12g
of which saturates 5g
Fibre 3g
Sodium 350mg`;

const KJ_ONLY_LABEL = `Nutrition Information Per 100 g
Energy
2450 kJ
Protein
7.0 g
Carbohydrate
70.0 g
Fat
9.0 g
Sodium
400 mg`;

const PER_SERVING_ONLY_LABEL = `Serving Size: 30 g
Servings Per Container: about 10
Nutrition Facts (per serving)
Energy 130 kcal
Protein 3 g
Total Carbohydrate 22 g
Sugars 8 g
Fat 3.5 g
Saturated Fat 1 g
Sodium 95 mg`;

// The True Elements Muesli barcode bug: OFF's own per-100g fields were mis-scaled per-serving
// values. This exercises the sanity gate directly (the OFF-specific fetch path is in labelAnalysis.ts).
const IMPOSSIBLE_MUESLI = { calories: 1037.25, protein_g: 32.75, carbs_g: 177.75, fat_g: 8, sugar_g: 20 };

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Front-of-pack only (no table) must not produce numbers");
{
  const p = parseNutritionLabel(FRONT_OF_PACK_ONLY);
  check("hasTable is false", p.hasTable === false, JSON.stringify(p.per_100g));
  check("coreComplete is false", p.coreComplete === false);
}

console.log("\nSeeds back label (per 100g, the real numbers)");
{
  const p = parseNutritionLabel(SEEDS_BACK_LABEL);
  check("coreComplete", p.coreComplete === true, JSON.stringify(p.per_100g));
  check("calories ~587", Math.abs((p.per_100g.calories ?? 0) - 586.76) < 0.5, String(p.per_100g.calories));
  check("fat ~43.4", Math.abs((p.per_100g.fat_g ?? 0) - 43.4) < 0.5, String(p.per_100g.fat_g));
  check("trans fat 0", p.per_100g.trans_fat_g === 0, String(p.per_100g.trans_fat_g));
  check("carbs ~28.06", Math.abs((p.per_100g.carbs_g ?? 0) - 28.06) < 0.5, String(p.per_100g.carbs_g));
  check("sugar 0, added sugar 0", p.per_100g.sugar_g === 0 && p.per_100g.added_sugar_g === 0);
  check("protein ~20.98", Math.abs((p.per_100g.protein_g ?? 0) - 20.98) < 0.5, String(p.per_100g.protein_g));
  check("sodium ~126.42 mg", Math.abs((p.per_100g.sodium_mg ?? 0) - 126.42) < 0.5, String(p.per_100g.sodium_mg));
  const gate = sanityCheckPer100(p.per_100g);
  check("passes the sanity gate", gate.ok, gate.reasons.join("; "));
}

console.log("\nkJ label with kcal already in parens (prefers the printed kcal)");
{
  const p = parseNutritionLabel(KJ_LABEL);
  check("coreComplete", p.coreComplete === true, JSON.stringify(p.per_100g));
  check("calories 425 (from the parenthesised kcal)", p.per_100g.calories === 425, String(p.per_100g.calories));
  check("protein 8.2", p.per_100g.protein_g === 8.2);
  check("carbs 60, sugar 20", p.per_100g.carbs_g === 60 && p.per_100g.sugar_g === 20);
  check("fat 12, saturated 5", p.per_100g.fat_g === 12 && p.per_100g.saturated_fat_g === 5);
  check("fibre 3, sodium 350", p.per_100g.fiber_g === 3 && p.per_100g.sodium_mg === 350);
}

console.log("\nkJ-only label, value on the line after the label, converted to kcal");
{
  const p = parseNutritionLabel(KJ_ONLY_LABEL);
  check("coreComplete", p.coreComplete === true, JSON.stringify(p.per_100g));
  const expectedKcal = Math.round((2450 / 4.184) * 100) / 100;
  check(`calories converted from kJ (~${expectedKcal})`, Math.abs((p.per_100g.calories ?? 0) - expectedKcal) < 0.5, String(p.per_100g.calories));
  check("protein 7.0 (value on next line)", p.per_100g.protein_g === 7);
  check("carbs 70.0 (value on next line)", p.per_100g.carbs_g === 70);
}

console.log("\nPer-serving-only label: derives per-100g from the serving size");
{
  const p = parseNutritionLabel(PER_SERVING_ONLY_LABEL);
  check("serving_g parsed as 30", p.serving_g === 30, String(p.serving_g));
  check("per_serving has the printed numbers", p.per_serving.calories === 130 && p.per_serving.protein_g === 3);
  check("coreComplete (derived per_100g)", p.coreComplete === true, JSON.stringify(p.per_100g));
  const k = 100 / 30;
  check("calories scaled to 100g", Math.abs((p.per_100g.calories ?? 0) - 130 * k) < 0.1, String(p.per_100g.calories));
  check("protein scaled to 100g", Math.abs((p.per_100g.protein_g ?? 0) - 3 * k) < 0.1, String(p.per_100g.protein_g));
  const gate = sanityCheckPer100(p.per_100g);
  check("derived numbers pass the sanity gate", gate.ok, gate.reasons.join("; "));
}

console.log("\nSanity gate rejects the impossible (True Elements Muesli barcode bug)");
{
  const gate = sanityCheckPer100(IMPOSSIBLE_MUESLI);
  check("gate fails", gate.ok === false);
  check("flags calories over 900", gate.reasons.some((r) => r.includes("calories")), gate.reasons.join("; "));
  check("flags macro sum over 100g", gate.reasons.some((r) => r.includes("protein+carbs+fat")), gate.reasons.join("; "));
}

console.log("\nSanity gate accepts a normal muesli");
{
  const gate = sanityCheckPer100({ calories: 380, protein_g: 10, carbs_g: 65, fat_g: 8, sugar_g: 15, saturated_fat_g: 2 });
  check("gate passes", gate.ok === true, gate.reasons.join("; "));
}

console.log("\nBarcode recovery from noisy label OCR text");
{
  // A clean, valid EAN-13 with spaces the way a phone might read them off a label.
  const clean = extractBarcode("8 901 058 851 298");
  check("recovers a clean spaced EAN-13", clean === "8901058851298", String(clean));
  // Garbled digits (the "8 i9 0 6120531115" fragment from the seeds label) should never crash and
  // should either recover a checksum-valid code or give up — never return garbage.
  const garbled = extractBarcode("8 i9 0 6120531115");
  check("garbled text never crashes", garbled === null || /^\d{8}$|^\d{12,13}$/.test(garbled), String(garbled));
  check("no digits -> null", extractBarcode("Omega loaded NIX SEEDS") === null);
}

console.log("\nBarcode __reports cache only takes gate-passing or needs_back_of_pack reports");
{
  check("gate-passing per_100g is cacheable", reportNutritionTrusted({ per_100g: { calories: 380, protein_g: 10, carbs_g: 65, fat_g: 8 } }) === true);
  check("the impossible muesli per_100g is NOT cacheable", reportNutritionTrusted({ per_100g: IMPOSSIBLE_MUESLI }) === false);
  check("needs_back_of_pack with no numbers is cacheable", reportNutritionTrusted({ needs_back_of_pack: true }) === true);
  check("needs_back_of_pack but still carrying numbers is NOT cacheable", reportNutritionTrusted({ needs_back_of_pack: true, per_100g: IMPOSSIBLE_MUESLI }) === false);
  check("no per_100g and no flag is NOT cacheable", reportNutritionTrusted({ verdict: "ok" }) === false);
}

console.log("\nv2.8: applyParsedNutrition — the deterministic parser always wins over whatever the model wrote");
{
  // The model's structured call hallucinated numbers that don't match the label at all (this is
  // exactly what the v2.8 one-call label_report collapse must not let through unchecked): the
  // parser re-reads the SAME transcript and its numbers overwrite the model's per_100g outright.
  const modelReport: Record<string, unknown> = {
    product: "Seeds",
    per_100g: { calories: 999, protein_g: 1, carbs_g: 1, fat_g: 1, sugar_g: 1, sodium_mg: 1 },
    nutrition_source: "label",
    needs_back_of_pack: false,
  };
  const parsed = parseNutritionLabel(SEEDS_BACK_LABEL);
  applyParsedNutrition(modelReport, parsed);
  const per100 = modelReport.per_100g as Record<string, number>;
  check("parsed calories (~587) replace the model's fabricated 999", Math.abs(per100.calories - 586.76) < 0.5, String(per100.calories));
  check("parsed fat (~43.4) replace the model's fabricated 1", Math.abs(per100.fat_g - 43.4) < 0.5, String(per100.fat_g));
  check("nutrition_source is 'label', not whatever the model said", modelReport.nutrition_source === "label");

  // And the reverse: when the transcript has no real table, the model's numbers are CLEARED, not kept.
  const modelReportNoTable: Record<string, unknown> = { product: "Seeds", per_100g: { calories: 250, protein_g: 5, carbs_g: 20, fat_g: 8 }, verdict_reason: "" };
  applyParsedNutrition(modelReportNoTable, parseNutritionLabel(FRONT_OF_PACK_ONLY));
  check("no table -> per_100g is deleted even though the model supplied numbers", !("per_100g" in modelReportNoTable));
  check("no table -> needs_back_of_pack is set", modelReportNoTable.needs_back_of_pack === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
