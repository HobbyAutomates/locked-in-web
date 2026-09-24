/**
 * `npx tsx scripts/check-water-parse.ts` — offline check of src/lib/waterParse.ts against the
 * examples from the v2.7 water-logging spec, plus the false positives it must NOT touch.
 */
import { extractWater } from "../src/lib/waterParse";

type Case = {
  text: string;
  glassMl?: number;
  expect: { ml: number | null; glassesAtLeast?: number; remainder?: string };
};

const cases: Case[] = [
  { text: "I had 2 glasses of water", expect: { ml: 500, remainder: "I had" } },
  { text: "drank 1.5 litres of water", expect: { ml: 1500, remainder: "" } },
  { text: "500 ml paani", expect: { ml: 500, remainder: "" } },
  { text: "do glass paani piya", expect: { ml: 500, remainder: "" } },
  { text: "3 bottles of water", expect: { ml: 3000, remainder: "" } },
  { text: "2 roti, dal and a glass of water", expect: { ml: 250, remainder: "2 roti, dal and" } },
  { text: "पानी का एक गिलास", expect: { ml: 250, remainder: "" } },
  { text: "आधा गिलास पानी", expect: { ml: 125, remainder: "" } },
  { text: "aadha glass paani", expect: { ml: 125, remainder: "" } },
  { text: "dedh litre paani", expect: { ml: 1500, remainder: "" } },
  { text: "1-2 glasses of water", expect: { ml: 375, remainder: "" } },
  { text: "coconut water", expect: { ml: null, remainder: "coconut water" } },
  { text: "watermelon and 2 roti", expect: { ml: null, remainder: "watermelon and 2 roti" } },
  { text: "water chestnut curry", expect: { ml: null, remainder: "water chestnut curry" } },
  { text: "singhara ka atta halwa", expect: { ml: null, remainder: "singhara ka atta halwa" } },
  { text: "rose water lassi", expect: { ml: null, remainder: "rose water lassi" } },
  { text: "jal jeera", expect: { ml: null, remainder: "jal jeera" } },
  { text: "गुलाब जल की चटनी", expect: { ml: null, remainder: "गुलाब जल की चटनी" } },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const { water, remainder } = extractWater(c.text, c.glassMl ?? 250);
  const ok =
    (c.expect.ml === null ? water === null : water !== null && water.ml === c.expect.ml) &&
    (c.expect.remainder === undefined || remainder === c.expect.remainder);
  if (ok) {
    pass++;
    console.log(`PASS  ${JSON.stringify(c.text)} → ml=${water?.ml ?? null} glasses=${water?.glasses ?? "-"} remainder=${JSON.stringify(remainder)}`);
  } else {
    fail++;
    console.log(`FAIL  ${JSON.stringify(c.text)}`);
    console.log(`      got:      ml=${water?.ml ?? null} glasses=${water?.glasses ?? "-"} remainder=${JSON.stringify(remainder)}`);
    console.log(`      expected: ml=${c.expect.ml} remainder=${c.expect.remainder === undefined ? "(any)" : JSON.stringify(c.expect.remainder)}`);
  }
}

console.log(`\n${pass}/${cases.length} passed`);
if (fail) process.exit(1);
