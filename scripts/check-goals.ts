/**
 * `npx tsx scripts/check-goals.ts` — offline checks for the v2.10 science pass:
 *   - src/lib/bmi.ts: adult BMI + Indian / WHO categories, healthy range, WHO 2007 BMI-for-age
 *     (LMS z-scores against the bundled table), waist-to-height.
 *   - src/lib/goals.ts: PAL bands, Mifflin-St Jeor, teen EER, safe pace caps, calorie floor,
 *     protein, AMDR notes, the generator, the under-18 rules and migration, and the ED flags.
 * Test vectors come from LockedIn-backups/science-spec.md; the BMI-for-age fixtures are the SD
 * columns WHO publishes next to the LMS values (bmi-*-z-who-2007-exp.xlsx), so the bundled JSON is
 * checked against WHO's own numbers, not hand maths. No DB.
 */
import { ageMonths, bmi, bmiAtZ, percentileFromZ, teenHealthyRange, bmiCategoryIndia, bmiCategoryWHO, bmiForAgeCategory, bmiForAgeZ, healthyRange, lmsRow, teenBmiWords, waistToHeight, whtrWords, zFromLms } from "../src/lib/bmi";
import {
  adultPal,
  ageYears,
  amdrNotes,
  applyTo,
  calorieFloor,
  capToFloor,
  downwardEdits,
  edFlags,
  effectiveGoal,
  floorFor,
  generate,
  goalOptions,
  maxSafeWeeklyGainKg,
  maxSafeWeeklyLossKg,
  mifflinBmr,
  migrateTeenGoal,
  plan,
  proteinTargetG,
  recentWeeklyLoss,
  roundSpeed,
  safeDeficitKcalPerDay,
  screenInput,
  sexFloor,
  speedLabel,
  speedMax,
  teenEer,
  teenGainSurplus,
  teenProteinG,
  type ScreenInput,
} from "../src/lib/goals";
import { DEFAULT_PROFILE, type Profile } from "../src/lib/types";

let failures = 0;
let total = 0;
function check(ok: boolean, what: string, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${!ok && detail ? `\n        got: ${detail}` : ""}`);
}
const near = (a: number | null, b: number, tol: number) => a != null && Math.abs(a - b) <= tol;
const r2 = (v: number) => Math.round(v * 100) / 100;

const TODAY = "2026-09-25";

// ---------------------------------------------------------------- §1a adult BMI
console.log("\n§1a adult BMI (spec table)");
for (const [cm, kg, want, india, who] of [
  [170, 53.5, 18.51, "Normal", "Normal"],
  [170, 66.0, 22.84, "Normal", "Normal"],
  [170, 67.5, 23.36, "Overweight", "Normal"],
  // The spec's table says "Normal" by WHO here, but 25.09 is ≥ 25, which its own decision rule
  // (and WHO) call Overweight — the rule wins; the table row is a typo.
  [170, 72.5, 25.09, "Obese", "Overweight"],
  [170, 86.0, 29.76, "Obese", "Overweight"],
  [160, 40.0, 15.63, "Underweight", "Underweight"],
] as const) {
  const b = bmi(kg, cm) as number;
  // 40 / 1.6² = 15.625 exactly; the spec rounds half-up to 15.63, floating point lands on 15.62.
  check(near(b, want, 0.006) && bmiCategoryIndia(b) === india && bmiCategoryWHO(b) === who, `${cm} cm ${kg} kg → ${want} · ${india} (India) · ${who} (WHO)`, `${r2(b)} ${bmiCategoryIndia(b)} ${bmiCategoryWHO(b)}`);
}
check(bmi(null, 170) === null && bmi(70, 0) === null, "bmi() is null without both numbers");

// ---------------------------------------------------------------- §2a healthy range
console.log("\n§2a healthy range 18.5–22.9 × h²");
for (const [cm, lo, hi] of [
  [150, 41.6, 51.5],
  [160, 47.4, 58.6],
  [170, 53.5, 66.2],
  [180, 59.9, 74.2],
] as const) {
  const r = healthyRange(cm);
  check(r.min === lo && r.max === hi, `${cm} cm → ${lo}–${hi} kg`, `${r.min}–${r.max}`);
}

// ---------------------------------------------------------------- §1b WHO 2007 BMI-for-age
console.log("\n§1b WHO 2007 BMI-for-age: bundled LMS vs WHO's published SD columns");
// [month, SD3neg, SD2neg, SD0, SD1, SD2, SD3] copied from bmi-{boys,girls}-z-who-2007-exp.xlsx.
const WHO_SD: Record<"male" | "female", number[][]> = {
  male: [
    [61, 12.118, 13.031, 15.264, 16.645, 18.259, 20.166],
    [156, 13.802, 14.935, 18.233, 20.829, 24.757, 31.686],
    [190, 15.047, 16.427, 20.38, 23.391, 27.734, 34.66],
    [215, 15.674, 17.258, 21.664, 24.861, 29.197, 35.417],
    [216, 15.692, 17.284, 21.708, 24.911, 29.243, 35.432],
  ],
  female: [
    [61, 11.77, 12.748, 15.244, 16.87, 18.858, 21.34],
    [156, 13.606, 14.936, 18.801, 21.8, 26.207, 33.439],
    [190, 14.557, 16.13, 20.631, 24.017, 28.782, 36],
    [215, 14.734, 16.443, 21.244, 24.75, 29.505, 36.284],
    [216, 14.734, 16.448, 21.26, 24.769, 29.52, 36.279],
  ],
};
for (const sex of ["male", "female"] as const) {
  for (const [month, ...sds] of WHO_SD[sex]) {
    const row = lmsRow(sex, month);
    if (!row) {
      check(false, `${sex} ${month} mo is bundled`);
      continue;
    }
    const zs = [-3, -2, 0, 1, 2, 3];
    const fwd = zs.every((z, i) => near(bmiAtZ(row, z), sds[i], 0.0015));
    const back = zs.every((z, i) => near(zFromLms(sds[i], row), z, 0.01));
    check(fwd && back, `${sex === "male" ? "boys" : "girls"} ${month} mo: BMI at z −3/−2/0/+1/+2/+3 matches WHO's SD columns, and back`, zs.map((z) => bmiAtZ(row, z).toFixed(3)).join(" "));
  }
}
check(lmsRow("male", 60) === null && lmsRow("male", 217) === null && lmsRow("female", 228) === null, "outside the bundled 61–216 months → null (months 217+ are adults here)");
// Spec step 2: invert at z = −2, 0, +1, +2 and check the category rule at each threshold.
{
  const row = lmsRow("male", 180)!;
  const at = (z: number) => bmiForAgeZ(bmiAtZ(row, z), "male", 180)!;
  check(bmiForAgeCategory(at(-2.01)) === "Thinness" && bmiForAgeCategory(at(-3.2)) === "Severe thinness" && bmiForAgeCategory(at(0)) === "Normal" && bmiForAgeCategory(at(0.99)) === "Normal" && bmiForAgeCategory(at(1.5)) === "Overweight" && bmiForAgeCategory(at(2.2)) === "Obese", "boys 180 mo: categories at inverted thresholds (−3.2, −2.01, 0, +0.99, +1.5, +2.2)");
}
{
  const row = lmsRow("female", 156)!;
  const sd2 = bmiAtZ(row, 2);
  const sd3 = bmiAtZ(row, 3);
  const z = zFromLms(sd3 + (sd3 - sd2), row);
  check(near(z, 4, 1e-9), "above +3 SD uses WHO's restricted tail (one 2→3 SD gap past SD3 → z = 4)", String(z));
}
{
  const zb = bmiForAgeZ(20, "male", 180)!;
  const zg = bmiForAgeZ(20, "female", 180)!;
  check(near(bmiForAgeZ(20, "other", 180), (zb + zg) / 2, 1e-12), "\"other\" averages the boys' and girls' z");
}
{
  // Boys 156 mo: SD2neg 14.935, SD1 20.829 (WHO) × 1.6² = 38.2–53.3 kg.
  const r = teenHealthyRange(160, "male", 156);
  check(r != null && r.min === 38.2 && r.max === 53.3 && teenHealthyRange(160, "male", 230) === null, "teen usual range at 160 cm, boys 156 mo = z −2…+1 × h² = 38.2–53.3 kg", JSON.stringify(r));
}
check(percentileFromZ(0) === 50 && percentileFromZ(1) === 84 && percentileFromZ(-2) === 2, "percentile from z: 0 → 50, +1 → 84, −2 → 2");
check(ageMonths("2011-03-10", "2026-09-25") === 186 && ageMonths("2011-09-26", "2026-09-25") === 179 && ageMonths("2027-01-01", "2026-09-25") === null, "age in completed months (186, the day before a birthday 179, future → null)");
check(teenBmiWords(0).title.includes("usual range") && !/obese|thin/i.test(teenBmiWords(2.5).title + teenBmiWords(-2.5).title), "teen words stay plain, no \"obese\" / \"thin\" labels");
check(r2(waistToHeight(80, 170)!) === 0.47 && whtrWords(0.47).ok && !whtrWords(0.5).ok && waistToHeight(null, 170) === null, "waist-to-height 80/170 = 0.47 fine, 0.5 = check-in");

// ---------------------------------------------------------------- §3 energy
console.log("\n§3 energy");
check(adultPal(0).factor === 1.2 && adultPal(2).factor === 1.375 && adultPal(4).factor === 1.55 && adultPal(6).factor === 1.725, "PAL bands: 0 → 1.2, 2 → 1.375, 4 → 1.55, 6 → 1.725");
check(mifflinBmr(70, 175, 25, "male") === 1673.75 && mifflinBmr(60, 165, 25, "female") === 1345.25, "Mifflin-St Jeor: man 70/175/25 = 1673.75, woman 60/165/25 = 1345.25");
check(near(teenEer(60, 170, 15, "male", 4), 3137.746, 1e-6), "teen EER boy 15 y 60 kg 170 cm active = 88.5 − 61.9·15 + 1.26·(26.7·60 + 903·1.7) + 25 = 3137.7", String(teenEer(60, 170, 15, "male", 4)));
check(near(teenEer(50, 160, 16, "female", 0), 135.3 - 30.8 * 16 + 1.0 * (500 + 934 * 1.6) + 25, 1e-9), "teen EER girl 16 y 50 kg 160 cm sedentary (PA 1.00)");
check(teenGainSurplus(2500) === 250 && teenGainSurplus(3500) === 300, "teen gain surplus: 10% of EER, max 300 kcal");

// ---------------------------------------------------------------- §4 pace caps and floors
console.log("\n§4 safe pace and floors (spec tables)");
for (const [kg, req, capped, deficit] of [
  [50, 1.5, 0.5, 550],
  [90, 1.5, 0.9, 990],
  [130, 1.5, 1.0, 1100],
  [45, 0.3, 0.3, 330],
] as const) {
  const c = Math.min(req, maxSafeWeeklyLossKg(kg));
  const d = Math.round(safeDeficitKcalPerDay(kg, req));
  check(near(c, capped, 1e-9) && d === deficit, `${kg} kg asks ${req} kg/wk → ${capped} kg/wk, ${deficit} kcal/day`, `${c} ${d}`);
}
check(maxSafeWeeklyLossKg(20) === 0.25, "loss cap never under 0.25 kg/wk");
check(maxSafeWeeklyGainKg(60) === 0.3 && maxSafeWeeklyGainKg(150) === 0.5 && maxSafeWeeklyGainKg(10) === 0.1, "gain cap 0.5% of weight, 0.1–0.5 kg/wk");
for (const [sex, bmr, applied] of [
  ["female", 1300, 1200],
  ["female", 1500, 1275],
  ["male", 1500, 1500],
  ["male", 2000, 1700],
] as const) {
  check(calorieFloor(bmr, sex) === applied, `floor ${sex} BMR ${bmr} → ${applied}`, String(calorieFloor(bmr, sex)));
}
check(sexFloor("other") === 1350 && sexFloor(null) === 1350, "other / unset backstop is the 1350 midpoint");
check(speedMax("lose", 45) === 0.4 && speedMax("lose", 72) === 0.7 && speedMax("lose", 130) === 1.0 && speedMax("gain", 72) === 0.3 && speedMax("gain", null) === 0.5, "slider max on the 0.1 grid: lose 45 → 0.4, 72 → 0.7, 130 → 1.0; gain 72 → 0.3");
check(roundSpeed(1.5, 0.7) === 0.7 && roundSpeed(0.04, 0.7) === 0.1 && roundSpeed(0.46) === 0.5, "roundSpeed clamps into 0.1…max");
check(speedLabel(0.2, 0.7) === "Slow and steady" && speedLabel(0.5, 0.7) === "Recommended" && speedLabel(0.7, 0.7) === "Max safe pace", "speed chip is relative to the person's max");

// ---------------------------------------------------------------- §5 protein and AMDR
console.log("\n§5 protein (spec table) and AMDR notes");
check(proteinTargetG(25, 70, "male", 5) === 112, "25 y 70 kg 5 workouts → 112 g (1.6 × 70)");
check(proteinTargetG(25, 70, "male", 1) === 70, "25 y 70 kg 1 workout → 70 g (max(58.1, 70))");
check(proteinTargetG(16, 60, "male", 6) === 55, "16 y boy → 55 g (ICMR-NIN)");
check(proteinTargetG(16, 50, "female", 0) === 46, "16 y girl → 46 g (ICMR-NIN)");
check(teenProteinG(13, "male") === 44 && teenProteinG(14, "female") === 43 && teenProteinG(11, "female") === 32 && teenProteinG(14, "other") === 44, "ICMR-NIN bands 13–15 and 10–12; other = rounded average");
check(amdrNotes({ calories: 2000, protein: 112, carbs: 264, fat: 56 }).length === 0, "a default-shaped split (22 / 53 / 25 %) has no notes");
{
  const notes = amdrNotes({ calories: 2000, protein: 40, carbs: 100, fat: 160 });
  check(notes.some((n) => n.macro === "protein" && n.level === "warn") && notes.some((n) => n.macro === "carbs" && n.level === "warn") && notes.some((n) => n.macro === "fat" && n.level === "info"), "8 % protein, 100 g carbs, 72 % fat → protein + carbs warn, fat info");
}
check(amdrNotes({ calories: 2500, protein: 190, carbs: 250, fat: 83 }).every((n) => n.level === "info"), "a high-protein lifter split only gets gentle info notes");

// ---------------------------------------------------------------- the generator
console.log("\ngenerate()");
const person = (o: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, ...o });
const dobFor = (years: number) => `${2026 - years}-01-15`;
{
  const woman = person({ gender: "female", dob: dobFor(22), height_cm: 160, weight_kg: 68, weekly_workout_target: 2, goal_type: "lose", goal_speed_kg_wk: 1.5 });
  const p = plan(woman, TODAY)!;
  // BMR 10·68 + 6.25·160 − 5·22 − 161 = 1409; TDEE × 1.375 = 1937.4; cap 0.68 kg/wk → 748 kcal; 1189.4 < floor 1200.
  check(p.bmr === 1409 && p.speedCapped && near(p.speed, 0.68, 1e-9) && p.floorApplied && p.targets.calories === 1200, "22 y woman lose 1.5 kg/wk → pace capped to 0.68, lifted to the 1200 floor", JSON.stringify(p.targets));
  check(p.targets.protein === 68 && p.targets.fat === 33, "…protein 1.0 g/kg (2 workouts) = 68 g, fat 25 % = 33 g");
}
{
  const lifter = person({ gender: "male", dob: dobFor(28), height_cm: 178, weight_kg: 72, weekly_workout_target: 6, goal_type: "gain", goal_speed_kg_wk: 1.0 });
  const p = plan(lifter, TODAY)!;
  // BMR 720 + 1112.5 − 140 + 5 = 1697.5; × 1.725 = 2928.2; gain cap 0.36 → +396 = 3324.2.
  check(p.targets.calories === 3324 && p.speedCapped && near(p.speed, 0.36, 1e-9) && p.targets.protein === 115, "28 y lifter gain 1.0 kg/wk → capped 0.36 kg/wk, 3324 kcal, 115 g protein", JSON.stringify(p.targets));
}
{
  const boy = person({ gender: "male", dob: dobFor(15), height_cm: 170, weight_kg: 60, weekly_workout_target: 4, goal_type: "lose", goal_speed_kg_wk: 0.5 });
  const p = plan(boy, TODAY)!;
  check(p.teen && p.goal === "maintain" && p.targets.calories === 3138 && p.targets.protein === 44, "15 y boy with a saved \"lose\" → treated as maintain: EER 3138 kcal, 44 g protein", JSON.stringify(p.targets));
  const gain = plan({ ...boy, goal_type: "gain" }, TODAY)!;
  check(gain.targets.calories === 3438, "15 y boy gain → EER + 300 (10 % capped at 300) = 3438", String(gain.targets.calories));
  const migrated = migrateTeenGoal(boy, TODAY);
  check(migrated != null && migrated.goal_type === "maintain" && migrated.calorie_target === 3138 && migrated.goal_weight_kg === boy.goal_weight_kg && migrated.goal_speed_kg_wk === 0.5, "migrateTeenGoal: lose → maintain, fresh targets, nothing else touched");
  check(migrateTeenGoal({ ...boy, goal_type: "gain" }, TODAY) === null && migrateTeenGoal(person({ ...boy, dob: dobFor(19) }), TODAY) === null, "no migration for a teen gaining or an adult losing");
}
check(goalOptions(15).every((o) => o.key !== "lose") && goalOptions(15).length === 2 && goalOptions(18).some((o) => o.key === "lose"), "under 18: no \"lose\" option; 18+: all three");
check(effectiveGoal("lose", 17) === "maintain" && effectiveGoal("lose", 18) === "lose" && effectiveGoal("lose", null) === "lose", "effectiveGoal only rewrites under-18 lose");
check(ageYears(dobFor(18), TODAY) === 18 && ageYears("2008-09-26", TODAY) === 17, "ageYears: 18th birthday passed / one day short");
check(generate(person({ gender: "male" }), TODAY) === null, "missing details → null");
check(applyTo(person({ gender: "male" }), TODAY).calorie_target === DEFAULT_PROFILE.calorie_target, "applyTo leaves targets alone when details are missing");
check(floorFor(person({ gender: "female", dob: dobFor(22), height_cm: 160, weight_kg: 68 }), TODAY) === 1200 && floorFor(person({ gender: "male" }), TODAY) === 1500, "floorFor: full profile and details-missing backstop");
check(capToFloor(900, 1275).calories === 1275 && capToFloor(900, 1275).capped && !capToFloor(1800, 1275).capped, "capToFloor lifts, never blocks");

// ---------------------------------------------------------------- §6 ED flags
console.log("\n§6 eating-disorder safety flags");
const base: ScreenInput = { age: 24, heightCm: 165, weightKg: 58, bmiZ: null, weights: [], requestedCalories: null, floor: 1200, goalType: "maintain", goalWeightKg: null, edits: [], today: TODAY };
check(edFlags(base).length === 0, "an ordinary adult → no flags");
check(edFlags({ ...base, weightKg: 47 }).includes("very_low_bmi"), "adult BMI 17.3 → very_low_bmi");
check(edFlags({ ...base, age: 15, weightKg: 40, bmiZ: -2.3 }).join() === "very_low_bmi_for_age", "teen z −2.3 → very_low_bmi_for_age only (adult BMI rule skipped)");
{
  const weights = [
    { date: "2026-09-24", kg: 55.4 },
    { date: "2026-09-17", kg: 56.6 },
    { date: "2026-09-10", kg: 57.8 },
  ];
  check(near(recentWeeklyLoss(weights, TODAY), 1.2, 1e-9) && edFlags({ ...base, weightKg: 55.4, weights }).includes("rapid_loss"), "1.2 kg/wk over 14 days at 55 kg (cap 0.55) → rapid_loss");
  check(recentWeeklyLoss(weights.slice(0, 2), TODAY) === null, "under 14 days of weigh-ins → no rate (one noisy reading can't trip it)");
  check(!edFlags({ ...base, weights: [{ date: "2026-09-24", kg: 57.6 }, { date: "2026-09-10", kg: 58.4 }] }).includes("rapid_loss"), "0.4 kg/wk → no flag");
}
check(edFlags({ ...base, requestedCalories: 900 }).includes("extreme_target") && !edFlags({ ...base, requestedCalories: 1200 }).includes("extreme_target"), "asking under the floor → extreme_target; at the floor → none");
check(edFlags({ ...base, goalType: "lose", goalWeightKg: 48 }).includes("goal_below_range") && !edFlags({ ...base, goalType: "lose", goalWeightKg: 52 }).includes("goal_below_range"), "goal under 18.5 × h² (50.4 kg at 165 cm) → goal_below_range");
{
  const edits = [
    { date: "2026-09-24", field: "calories" as const, from: 1600, to: 1500 },
    { date: "2026-09-20", field: "calories" as const, from: 1700, to: 1600 },
    { date: "2026-09-15", field: "goal_weight" as const, from: 55, to: 52 },
    { date: "2026-09-01", field: "calories" as const, from: 1900, to: 1700 },
    { date: "2026-09-22", field: "calories" as const, from: 1500, to: 1650 },
  ];
  check(downwardEdits(edits, TODAY) === 3 && edFlags({ ...base, edits }).includes("repeated_lowering"), "3 downward edits in 14 days → repeated_lowering (older and upward edits ignored)");
  check(!edFlags({ ...base, edits: edits.slice(1) }).includes("repeated_lowering"), "2 in the window → none");
}
{
  const teen = person({ gender: "female", dob: dobFor(15), height_cm: 160, weight_kg: 38 });
  const s = screenInput(teen, { today: TODAY });
  check(s.bmiZ != null && s.bmiZ < -2 && edFlags(s).includes("very_low_bmi_for_age"), "screenInput fills the teen z from the profile (15 y girl 38 kg / 160 cm)", String(s.bmiZ));
}

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
