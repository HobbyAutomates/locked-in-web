/**
 * `npx tsx scripts/check-match.ts` — offline check of src/lib/foodSearch.ts's isAcceptableMatch
 * against the bug that started v2.7 (a peeled cucumber photo matched "Cold cucumber cream soup")
 * plus a few sanity cases it must keep working. No DB access — hits are hand-built fixtures with
 * the score search_foods would actually return for that name.
 */
import { isAcceptableMatch, sourceBonus, type FoodHit } from "../src/lib/foodSearch";
import { crossValidatePlateItem } from "../src/lib/plateMatch";
import type { PlateItem } from "../src/lib/types";

function hit(name: string, source: FoodHit["source"], sim: number, exact = false): FoodHit {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    aliases: [],
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    micros: {},
    source,
    region: null,
    names_local: {},
    units: [],
    unit_name: null,
    unit_grams: null,
    score: exact ? 3 : sim + sourceBonus(source),
  };
}

type Case = { query: string; candidate: FoodHit; expect: boolean; why: string };

const cases: Case[] = [
  {
    query: "cucumber",
    candidate: hit("Cold cucumber cream soup", "dish", 0.55),
    expect: false,
    why: "the bug this v2.7 fixes: a bare ingredient must not take a composite dish's numbers",
  },
  {
    query: "peeled cucumber",
    candidate: hit("Cold cucumber cream soup", "dish", 0.55),
    expect: false,
    why: "a descriptor ('peeled') in front of the ingredient must not change the verdict",
  },
  {
    query: "cucumber",
    candidate: hit("Cucumber", "ifct", 0.9, true),
    expect: true,
    why: "an exact/alias hit on the plain ingredient itself is the fix we want to keep working",
  },
  {
    query: "cucumber raita",
    candidate: hit("Cucumber raita", "dish", 0.9, true),
    expect: true,
    why: "when the query itself names the dish, the dish's own row is correct",
  },
  {
    query: "roti",
    candidate: hit("Roti", "custom", 0.95, true),
    expect: true,
    why: "a plain staple should still resolve via its exact/alias row",
  },
  {
    query: "paneer tikka",
    candidate: hit("Paneer tikka", "dish", 0.9, true),
    expect: true,
    why: "a two-word dish query matching the same dish name is correct, not a false composite",
  },
  {
    query: "apple",
    candidate: hit("Apple", "ifct", 0.92, true),
    expect: true,
    why: "a common raw fruit with its own row must keep matching",
  },
  {
    query: "apple",
    candidate: hit("Apple pie", "dish", 0.6),
    expect: false,
    why: "a raw fruit query must not take a dessert's numbers just because the word overlaps",
  },
];

let failures = 0;
for (const c of cases) {
  const got = isAcceptableMatch(c.query, c.candidate);
  const ok = got === c.expect;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  "${c.query}" vs "${c.candidate.name}" (${c.candidate.source}) -> ${got} (want ${c.expect})  — ${c.why}`);
}

// ---- plateFromEstimate's per-item cross-validation (src/lib/plateMatch.ts): the same code both the
//      standalone plateFlow and the fused classifier plate (/api/scan's plate_estimate) run. ----

function plateItem(name: string, grams: number): PlateItem {
  return { name, grams, confidence: "medium", calories: 999, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {}, source: "estimated", food_id: null };
}
function withMacros(h: FoodHit, calories: number): FoodHit {
  return { ...h, calories, protein_g: 1, carbs_g: 3, fat_g: 0.1 };
}

type PlateCase = { why: string; item: PlateItem; table: FoodHit[]; live: FoodHit | null; expectSource: PlateItem["source"]; expectFoodId: string | null; expectKcal: number; expectLiveCalls: number };

const soup = withMacros(hit("Cold cucumber cream soup", "dish", 0.55), 80);
const liveCucumber = withMacros(hit("cucumber", "ai", 1, true), 15);
const plainCucumber = withMacros(hit("Cucumber", "ifct", 0.9, true), 16);

const plateCases: PlateCase[] = [
  { why: "cucumber vs the soup row: rejected, falls back to the live lookup", item: plateItem("cucumber", 200), table: [soup], live: liveCucumber, expectSource: "table", expectFoodId: liveCucumber.id, expectKcal: 30, expectLiveCalls: 1 },
  { why: "cucumber vs the soup row, live lookup down: the model's own estimate stands", item: plateItem("cucumber", 200), table: [soup], live: null, expectSource: "estimated", expectFoodId: null, expectKcal: 999, expectLiveCalls: 1 },
  { why: "an acceptable table row wins without calling the live lookup", item: plateItem("cucumber", 100), table: [plainCucumber], live: liveCucumber, expectSource: "table", expectFoodId: plainCucumber.id, expectKcal: 16, expectLiveCalls: 0 },
];

async function runPlateCases() {
  for (const c of plateCases) {
    let liveCalls = 0;
    const out = await crossValidatePlateItem(c.item, {
      search: async () => c.table,
      live: async () => {
        liveCalls++;
        return c.live;
      },
    });
    const ok = out.source === c.expectSource && out.food_id === c.expectFoodId && out.calories === c.expectKcal && liveCalls === c.expectLiveCalls;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  plate "${c.item.name}" -> ${out.source} ${out.food_id ?? "-"} ${out.calories} kcal (live calls ${liveCalls})  — ${c.why}`);
  }
}

runPlateCases().then(() => {
  const total = cases.length + plateCases.length;
  console.log(`\n${total - failures}/${total} passed.`);
  if (failures) process.exit(1);
});
