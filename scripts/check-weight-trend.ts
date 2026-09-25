/**
 * `npx tsx scripts/check-weight-trend.ts` — offline check of src/lib/weightTrend.ts's
 * movingAverage, the 7-entry line shown on the Progress screen's weight trend card. No DB access.
 */
import { movingAverage } from "../src/lib/weightTrend";

type Case = { why: string; values: number[]; window?: number; expect: number[] };

const round = (v: number) => Math.round(v * 1000) / 1000;

const cases: Case[] = [
  { why: "fewer entries than the window: each point is the average of everything so far", values: [80, 79, 81], window: 7, expect: [80, 79.5, 80] },
  { why: "exactly the window: last point is the plain average of all of them", values: [10, 20, 30, 40, 50, 60, 70], window: 7, expect: [10, 15, 20, 25, 30, 35, 40] },
  { why: "more entries than the window: only the trailing 7 count once the window fills", values: [70, 70, 70, 70, 70, 70, 70, 0], window: 7, expect: [70, 70, 70, 70, 70, 70, 70, 60] },
  { why: "flat series: the average tracks the constant value exactly", values: [65, 65, 65, 65], window: 7, expect: [65, 65, 65, 65] },
  { why: "single entry: the average is just that entry", values: [72.4], window: 7, expect: [72.4] },
  { why: "empty series: no output, no crash", values: [], window: 7, expect: [] },
  { why: "window of 1 is a no-op passthrough", values: [1, 2, 3], window: 1, expect: [1, 2, 3] },
];

let failures = 0;
for (const c of cases) {
  const out = movingAverage(c.values, c.window).map(round);
  const expect = c.expect.map(round);
  const ok = out.length === expect.length && out.every((v, i) => Math.abs(v - expect[i]) < 1e-9);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  movingAverage(${JSON.stringify(c.values)}, ${c.window}) -> ${JSON.stringify(out)} (expected ${JSON.stringify(expect)})  — ${c.why}`);
}

console.log(`\n${cases.length - failures}/${cases.length} passed.`);
if (failures) process.exit(1);
