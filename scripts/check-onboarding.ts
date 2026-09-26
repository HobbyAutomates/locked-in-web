/**
 * `npx tsx scripts/check-onboarding.ts` — the v2.14 onboarding plan (src/lib/onboardingV2.ts):
 * goal mapping, the under-18 rules, the goal date and the seeded memories.
 */
import { answersToProfile, effectiveCoachStyle, firstLogNote, goalTypeOf, onboardingPlan, prettyDate, sanitizeAnswers, seedMemories } from "../src/lib/onboardingV2";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

const T = "2026-09-26";
const adult = { goal: "recomp", height_cm: 174, weight_kg: 71.8, dob: "2004-05-01", gender: "male", goal_weight_kg: 66, pace: "steady", training_days: 4, diet_mode: "high_protein", obstacles: ["exam_stress", "mess_food"], coach_style: "no_excuses" } as const;

check("recomp is a slow cut for adults", goalTypeOf("recomp", 22), "lose");
check("a teen's lose is maintain", goalTypeOf("lose", 16), "maintain");
check("habits is maintain", goalTypeOf("habits", 30), "maintain");
check("teen coach capped at balanced", effectiveCoachStyle("no_excuses", 16), "balanced");
check("adult keeps no excuses", effectiveCoachStyle("no_excuses", 22), "no_excuses");
check("junk style → balanced", effectiveCoachStyle("shouty", 22), "balanced");

const plan = onboardingPlan(sanitizeAnswers(adult), T)!;
check("adult plan has a date", typeof plan.goal_date, "string");
check("5.8 kg at 0.5/wk ≈ 12 weeks", plan.weeks, 12);
check("date is 12 weeks out", plan.goal_date, "2026-12-17");
check("high protein = 2 g/kg", plan.targets.protein, 144);
check("fibre in 25–40", plan.targets.fiber >= 25 && plan.targets.fiber <= 40, true);
check("3 reasons", plan.reasons.length, 3);
check("first reason is exam stress", plan.reasons[0].includes("exam-stress"), true);
check("no-excuses reason last", plan.reasons[2].includes("No-excuses"), true);
check("honest line for a cut", plan.honest.startsWith("First 2 weeks"), true);

const teen = onboardingPlan(sanitizeAnswers({ ...adult, dob: "2010-03-01" }), T)!;
check("teen: no loss date", teen.goal_date, null);
check("teen: goal is maintain", teen.goal_type, "maintain");
check("teen: coach reason is balanced", teen.reasons[2].includes("Balanced"), true);
check("teen keto falls back", onboardingPlan(sanitizeAnswers({ ...adult, dob: "2010-03-01", diet_mode: "keto" }), T)!.targets.carbs > 100, true);

check("missing body → null", onboardingPlan(sanitizeAnswers({ goal: "lose" }), T), null);
check("gain above weight has a date", onboardingPlan(sanitizeAnswers({ ...adult, goal: "gain", goal_weight_kg: 75 }), T)!.goal_date != null, true);
check("target on the wrong side → no date", onboardingPlan(sanitizeAnswers({ ...adult, goal_weight_kg: 80 }), T)!.goal_date, null);

check("sanitize drops junk", sanitizeAnswers({ heard_from: "tv", obstacles: ["exam_stress", "x"], training_days: 9, height_cm: "abc" }), {
  heard_from: null, goal: null, name: null, height_cm: null, weight_kg: null, dob: null, gender: null, goal_weight_kg: null, pace: null,
  training_days: null, sports: null, diet_mode: null, obstacles: ["exam_stress"], coach_style: null, first_challenge: null,
});
check("pace maps to kg/week", answersToProfile(sanitizeAnswers({ ...adult, pace: "aggressive" }), undefined, T).goal_speed_kg_wk, 0.75);
check("maintain clears goal weight", answersToProfile(sanitizeAnswers({ ...adult, goal: "habits" }), undefined, T).goal_weight_kg, null);

const mems = seedMemories(sanitizeAnswers(adult), plan).map((m) => `${m.kind}:${m.text}`);
check("memories include the goal + date", mems[0], "goal:Recomp · 66 kg by 17 December");
check("memories include exam stress as life", mems.includes("life:Exam stress"), true);
check("memories include mess food as food", mems.includes("food:Hostel or mess food"), true);
check("memories include style", mems.includes("style:No excuses"), true);
check("pretty date", prettyDate("2027-02-14"), "14 February");
check("first-log note, protein-rich", firstLogNote({ calories: 505, protein: 24 }, ["Dal", "Curd"]).startsWith("Good start"), true);

console.log(`\n${total - failures}/${total} passed`);
if (failures) process.exit(1);
