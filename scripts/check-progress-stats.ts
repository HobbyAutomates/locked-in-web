/**
 * `npx tsx scripts/check-progress-stats.ts` — offline checks for the v2.12 Progress / Profile
 * numbers in src/lib/progressStats.ts and the chart path helper in src/lib/svgPath.ts.
 */
import assert from "node:assert/strict";
import { bestDayRun, clockText, energyDays, goalEta, goalFraction, macroAverages, mealTimes, proteinPicks, slopePerDay, weekFlames, weightTrend } from "../src/lib/progressStats";
import { smoothPath } from "../src/lib/svgPath";
import type { Meal, WeightEntry } from "../src/lib/types";

const T = "2026-09-26"; // a Saturday
const w = (date: string, kg: number): WeightEntry => ({ id: date, date, weight_kg: kg, note: "" });
const meal = (date: string, iso: string, kcal: number, protein = 0, type: Meal["meal_type"] = null): Meal => ({
  id: `${date}${iso}`,
  date,
  raw_text: "",
  created_at: iso,
  meal_type: type,
  items: [{ food_id: null, name: "x", grams: 100, calories: kcal, protein_g: protein, carbs_g: 0, fat_g: 0, source: "table", confidence: 1 }],
});

// weight trend: 7-day averages, baseline before the window, one point per date
const weights = [w("2026-09-26", 70), w("2026-09-24", 71), w("2026-09-20", 72), w("2026-09-10", 74)];
const pts = weightTrend(weights, T, 7);
assert.deepEqual(pts.map((p) => p.date), ["2026-09-10", "2026-09-20", "2026-09-24", "2026-09-26"]);
assert.equal(pts[3].avg, (70 + 71 + 72) / 3);
const slope = slopePerDay(pts)!;
assert.ok(slope < 0);
assert.equal(slopePerDay([]), null);

// goal ETA: follows the trend when heading the right way, else the chosen pace; reached / none
assert.equal(goalEta(70, 70.1, slope, 0.5, T).reached, true);
assert.equal(goalEta(70, null, slope, 0.5, T).date, null);
assert.equal(goalEta(70, 69, -0.1, 0.5, T).date, "2026-10-06");
assert.equal(goalEta(70, 69, 0.1, 0.7, T).date, "2026-10-06"); // wrong way → 0.1 kg/day pace
assert.equal(goalFraction(80, 75, 70), 0.5);
assert.equal(goalFraction(80, 85, 70), 0);

// streak: best never below current; flames Monday → Sunday
assert.equal(bestDayRun(3, ["2026-09-01", "2026-09-02"]), 3);
assert.equal(bestDayRun(1, ["2026-09-01", "2026-09-02", "2026-09-03"]), 3);
const flames = weekFlames(T, ["2026-09-21", "2026-09-23"]);
assert.deepEqual(flames.map((f) => f.state), ["done", "missed", "done", "missed", "missed", "open", "future"]);

// energy: ±5% on target
const e = energyDays([meal("2026-09-25", "2026-09-25T03:00:00Z", 2000), meal("2026-09-24", "2026-09-24T03:00:00Z", 2300), meal("2026-09-23", "2026-09-23T03:00:00Z", 1500)], "2026-09-23", "2026-09-26", 2000);
assert.deepEqual(e.map((d) => d.status), ["under", "over", "on", "none"]);

// macros: today left out of the average when other days exist
const m = macroAverages([meal("2026-09-25", "2026-09-25T03:00:00Z", 2000, 100), meal("2026-09-26", "2026-09-26T03:00:00Z", 300, 10)], "2026-09-20", T, T);
assert.equal(m.protein, 100);
assert.equal(m.days, 1);
assert.equal(proteinPicks(22).length, 3);
assert.ok(proteinPicks(22).every((p) => p.protein <= 22));

// meal times: median of the first meal of each type (IST), today apart, back-filled meals ignored
const mt = mealTimes(
  [
    meal("2026-09-24", "2026-09-24T02:30:00Z", 300, 0, "breakfast"), // 08:00 IST
    meal("2026-09-25", "2026-09-25T03:30:00Z", 300, 0, "breakfast"), // 09:00 IST
    meal("2026-09-25", "2026-09-25T04:00:00Z", 300, 0, "breakfast"), // later same day: ignored
    meal("2026-09-26", "2026-09-26T02:45:00Z", 300, 0, "breakfast"), // today 08:15
    meal("2026-09-22", "2026-09-25T10:00:00Z", 300, 0, "lunch"), // back-filled: ignored
  ],
  T,
  30,
);
const bf = mt.find((r) => r.type === "breakfast")!;
assert.equal(bf.usual, 8 * 60 + 30);
assert.equal(bf.today, 8 * 60 + 15);
assert.equal(mt.find((r) => r.type === "lunch")!.usual, null);
assert.deepEqual(clockText(8 * 60 + 5), { time: "8:05", ampm: "am" });
assert.deepEqual(clockText(0), { time: "12:00", ampm: "am" });
assert.deepEqual(clockText(13 * 60), { time: "1:00", ampm: "pm" });

// smooth path never leaves the neighbours' y-range
const d = smoothPath([
  [0, 10],
  [10, 0],
  [20, 10],
]);
const ys = [...d.matchAll(/[ C,]\s?[\d.]+,([\d.]+)/g)].map((x) => Number(x[1]));
assert.ok(ys.every((y) => y >= 0 && y <= 10), d);

console.log("progress stats: ok");
