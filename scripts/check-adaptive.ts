/**
 * `npx tsx scripts/check-adaptive.ts` — offline checks for v2.13 adaptive weekly targets
 * (src/lib/adaptive.ts, spec §5). The three test vectors are the spec's own; Android's unit test
 * runs the same numbers against util/Adaptive.kt. No DB.
 */
import {
  ADAPTIVE_CEILING,
  adaptiveFloor,
  adaptiveTarget,
  checkinWeek,
  dailyWeights,
  ewma,
  goalRateFor,
  lsSlope,
  missingText,
  mondayOf,
  reasonText,
  shiftDay,
  trendSlopeKgPerDay,
  weeklyCheckin,
  type WeighIn,
} from "../src/lib/adaptive";
import { DEFAULT_PROFILE, type Profile } from "../src/lib/types";

let failed = 0;
let passed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
}
function near(name: string, got: number, want: number, tol = 1e-6) {
  if (Math.abs(got - want) <= tol) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}: got ${got}, want ${want} (±${tol})`);
  }
}

// ---- the spec's three test vectors (steps 5–7) ----
const halfKgWeek = -0.5 / 7;
{
  const r = adaptiveTarget({ avgKcal: 2200, slopeKgPerDay: halfKgWeek, goalRateKgPerWeek: -0.5, oldTarget: 2200, floor: 1500 });
  near("v1 TDEE 2750", r.tdee, 2750);
  near("v1 raw 2200", r.raw, 2200);
  eq("v1 new 2200", r.newTarget, 2200);
}
{
  const r = adaptiveTarget({ avgKcal: 2200, slopeKgPerDay: halfKgWeek, goalRateKgPerWeek: -0.75, oldTarget: 2200, floor: 1500 });
  near("v2 TDEE 2750", r.tdee, 2750);
  near("v2 raw 1925", r.raw, 1925);
  eq("v2 new clamped to 2050", r.newTarget, 2050);
}
{
  const r = adaptiveTarget({ avgKcal: 2000, slopeKgPerDay: 0, goalRateKgPerWeek: -0.5, oldTarget: 2000, floor: 1500 });
  near("v3 TDEE 2000", r.tdee, 2000);
  near("v3 raw 1450", r.raw, 1450);
  eq("v3 new clamped to 1850", r.newTarget, 1850);
}

// ---- safety floor / ceiling and rounding ----
eq("floor wins over the −150 step", adaptiveTarget({ avgKcal: 1300, slopeKgPerDay: 0, goalRateKgPerWeek: -0.5, oldTarget: 1600, floor: 1500 }).newTarget, 1500);
eq("ceiling caps", adaptiveTarget({ avgKcal: 6000, slopeKgPerDay: 0, goalRateKgPerWeek: 0, oldTarget: 4950, floor: 1500 }).newTarget, ADAPTIVE_CEILING);
eq("rounds to 10", adaptiveTarget({ avgKcal: 2104, slopeKgPerDay: 0, goalRateKgPerWeek: 0, oldTarget: 2100, floor: 1500 }).newTarget, 2100);
eq("rounds to 10 (up)", adaptiveTarget({ avgKcal: 2106, slopeKgPerDay: 0, goalRateKgPerWeek: 0, oldTarget: 2100, floor: 1500 }).newTarget, 2110);
eq("gain raises by at most 150", adaptiveTarget({ avgKcal: 2500, slopeKgPerDay: 0, goalRateKgPerWeek: 0.25, oldTarget: 2400, floor: 1500 }).newTarget, 2550);

// ---- steps 1–3 ----
eq("dailyWeights forward-fills, nothing before the first", dailyWeights([{ date: "2026-09-03", kg: 70 }, { date: "2026-09-05", kg: 71 }], "2026-09-06", 5), [null, 70, 70, 71, 71]);
eq("dailyWeights: same-day weigh-ins average", dailyWeights([{ date: "2026-09-06", kg: 70 }, { date: "2026-09-06", kg: 71 }], "2026-09-06", 1), [70.5]);
eq("dailyWeights ignores the future and the old", dailyWeights([{ date: "2026-08-01", kg: 60 }, { date: "2026-09-07", kg: 99 }], "2026-09-06", 2), [null, null]);
eq("ewma seeds with the first value", ewma([null, 70, 80]), [null, 70, 71]);
near("lsSlope of a line", lsSlope([1, 3, 5, 7]), 2);
near("lsSlope skips nulls", lsSlope([null, 1, 2, 3]), 1);
eq("lsSlope of one point is 0", lsSlope([null, 5]), 0);

// A weigh-in series whose EWMA trend is exactly a line falling 0.5 kg/week: with trend_t = T0 + b·t,
// the weights are w_0 = T0 and w_t = T0 + b·t + b(1 − α)/α.
const asOf = "2026-09-27"; // a Sunday
const b = halfKgWeek;
const series: WeighIn[] = Array.from({ length: 21 }, (_, i) => ({ date: shiftDay(asOf, i - 20), kg: i === 0 ? 80 : 80 + b * i + (b * 0.9) / 0.1 }));
near("exact linear trend: slope −0.5 kg/week", trendSlopeKgPerDay(series, asOf) * 7, -0.5, 1e-9);
const dayKcal: Record<string, number> = {};
for (let i = 0; i < 14; i++) dayKcal[shiftDay(asOf, -i)] = 2200;
{
  const r = weeklyCheckin({ asOf, weighIns: series, dayKcal }, { goalRateKgPerWeek: -0.5, oldTarget: 2200, floor: 1500 });
  eq("pipeline v1 ok", r.ok, true);
  if (r.ok) {
    eq("pipeline v1 TDEE", r.tdee, 2750);
    eq("pipeline v1 new", r.newTarget, 2200);
    eq("pipeline v1 trend", r.trendKgPerWeek, -0.5);
    eq("pipeline v1 avg kcal", r.avgKcal, 2200);
    eq("pipeline v1 reason", r.reason, "Your weight trend is −0.5 kg/week (goal −0.5) and you ate about 2,200 kcal a day, so your burn is about 2,750. Keeping your target at 2,200 kcal.");
  }
  const r2 = weeklyCheckin({ asOf, weighIns: series, dayKcal }, { goalRateKgPerWeek: -0.75, oldTarget: 2200, floor: 1500 });
  eq("pipeline v2 new", r2.ok ? r2.newTarget : null, 2050);
}
{
  // Flat weight, 2000 kcal: vector 3 end to end (a weigh-in every 3 days is enough).
  const flat: WeighIn[] = [0, 3, 6, 9, 12, 15, 18].map((i) => ({ date: shiftDay(asOf, -i), kg: 72 }));
  const kcal: Record<string, number> = {};
  for (let i = 0; i < 12; i++) kcal[shiftDay(asOf, -i)] = 2000;
  const r = weeklyCheckin({ asOf, weighIns: flat, dayKcal: kcal }, { goalRateKgPerWeek: -0.5, oldTarget: 2000, floor: 1500 });
  eq("pipeline v3", r.ok ? [r.tdee, r.raw, r.newTarget, r.avgWeightKg] : r, [2000, 1450, 1850, 72]);
  eq("pipeline v3 reason", r.ok ? r.reason : "", "Your weight trend is 0 kg/week (goal −0.5) and you ate about 2,000 kcal a day, so your burn is about 2,000. Lowering your target by 150 kcal.");
}

// ---- not enough data ----
{
  const few: WeighIn[] = [{ date: asOf, kg: 70 }, { date: shiftDay(asOf, -2), kg: 70 }];
  const kcal: Record<string, number> = {};
  for (let i = 0; i < 7; i++) kcal[shiftDay(asOf, -i)] = 2000;
  kcal[shiftDay(asOf, -20)] = 2000; // outside the 14 days: doesn't count
  const r = weeklyCheckin({ asOf, weighIns: few, dayKcal: kcal }, { goalRateKgPerWeek: 0, oldTarget: 2000, floor: 1500 });
  eq("not ready", r.ok, false);
  eq("not ready counts", [r.loggedDays, r.weighIns], [7, 2]);
  eq("missing text", r.ok ? "" : r.missing, "Log food on 3 more days and weigh in 2 more times in the last 2 weeks, and your next check-in can adjust your target.");
}
eq("missing text, one each", missingText(9, 3), "Log food on 1 more day and weigh in 1 more time in the last 2 weeks, and your next check-in can adjust your target.");
eq("missing text, nothing missing", missingText(10, 4), "");

// ---- the spec's example sentence ----
eq("reason text (spec example)", reasonText({ trendKgPerWeek: -0.3, goalRateKgPerWeek: -0.5, avgKcal: 2180, tdee: 2510, oldTarget: 2250, newTarget: 2140 }), "Your weight trend is −0.3 kg/week (goal −0.5) and you ate about 2,180 kcal a day, so your burn is about 2,510. Lowering your target by 110 kcal.");
eq("reason text raising", reasonText({ trendKgPerWeek: 0.2, goalRateKgPerWeek: 0, avgKcal: 2000, tdee: 1850, oldTarget: 1800, newTarget: 1850 }).endsWith("Raising your target by 50 kcal."), true);

// ---- the week ----
eq("mondayOf a Sunday", mondayOf("2026-09-27"), "2026-09-21");
eq("mondayOf a Monday", mondayOf("2026-09-28"), "2026-09-28");
eq("checkinWeek", checkinWeek("2026-09-30"), { weekStart: "2026-09-28", asOf: "2026-09-27" });

// ---- profile helpers ----
const adult: Profile = { ...DEFAULT_PROFILE, dob: "1998-01-01", gender: "male", height_cm: 175, weight_kg: 80, goal_type: "lose", goal_speed_kg_wk: 0.5, weekly_workout_target: 3 };
eq("goal rate: adult loss", goalRateFor(adult, "2026-09-26"), -0.5);
eq("goal rate: capped at 1 % of 50 kg", goalRateFor({ ...adult, weight_kg: 50, goal_speed_kg_wk: 1.0 }, "2026-09-26"), -0.5);
eq("goal rate: maintain", goalRateFor({ ...adult, goal_type: "maintain" }, "2026-09-26"), 0);
const teen: Profile = { ...adult, dob: "2010-06-01", weight_kg: 60, height_cm: 168 };
eq("goal rate: a teen's lose is maintain", goalRateFor(teen, "2026-09-26"), 0);
const teenFloor = adaptiveFloor(teen, "2026-09-26");
eq("teen floor is the EER, well over the adult backstop", teenFloor > 2000, true);
eq("adult floor is goals.floorFor", adaptiveFloor(adult, "2026-09-26"), 1500);

console.log(`check-adaptive: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
