/**
 * `npx tsx scripts/check-match.ts` — offline check of src/lib/foodSearch.ts's isAcceptableMatch
 * against the bug that started v2.7 (a peeled cucumber photo matched "Cold cucumber cream soup")
 * plus a few sanity cases it must keep working. No DB access — hits are hand-built fixtures with
 * the score search_foods would actually return for that name.
 */
import { isAcceptableMatch, sourceBonus, type FoodHit } from "../src/lib/foodSearch";
import { crossValidatePlateItem } from "../src/lib/plateMatch";
import { applyFollowUpEffect, gramsRangeLabel, totalKcalRange } from "../src/lib/scanFollowUp";
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
  { why: "cucumber vs the soup row: rejected, falls back to the live lookup (AI numbers stay labelled estimated)", item: plateItem("cucumber", 200), table: [soup], live: liveCucumber, expectSource: "estimated", expectFoodId: null, expectKcal: 30, expectLiveCalls: 1 },
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

// ---- v2.8: gram ranges + total kcal uncertainty band (src/lib/scanFollowUp.ts) ----

function rangeItem(name: string, grams: number, grams_low?: number, grams_high?: number, calories = grams * 2): PlateItem {
  return { name, grams, grams_low, grams_high, confidence: "medium", calories, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {}, source: "estimated", food_id: null };
}

console.log("\nGram range label");
{
  const withRange = gramsRangeLabel(rangeItem("roti", 150, 120, 190));
  const ok1 = withRange === "150 g (120–190)";
  if (!ok1) failures++;
  console.log(`${ok1 ? "PASS" : "FAIL"}  "150 g (120-190)" formatting -> "${withRange}"`);

  const noRange = gramsRangeLabel(rangeItem("dal", 150));
  const ok2 = noRange === "150 g";
  if (!ok2) failures++;
  console.log(`${ok2 ? "PASS" : "FAIL"}  no range -> "${noRange}" (want "150 g")`);
}

console.log("\nTotal kcal ± band, computed from each item's own gram range");
{
  // roti: 150 kcal at 150g nominal (1 kcal/g), range 120-190 -> 120-190 kcal.
  // rice: 300 kcal at 200g nominal (1.5 kcal/g), no range -> 300-300 kcal.
  const items = [rangeItem("roti", 150, 120, 190, 150), rangeItem("rice", 200, undefined, undefined, 300)];
  const t = totalKcalRange(items);
  const ok = t.center === 450 && t.low === 420 && t.high === 490 && t.plusMinus === 35;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  center ${t.center} low ${t.low} high ${t.high} ±${t.plusMinus} (want center 450, low 420, high 490, ±35)`);
}

// ---- v2.8: follow-up quick-reply effects (src/lib/scanFollowUp.ts) — deterministic, no model call ----

console.log("\nFollow-up effects");
{
  type FCase = { why: string; effect: string; items: PlateItem[]; question?: string; check: (out: PlateItem[]) => boolean };
  const curry = () => rangeItem("chicken curry", 200, undefined, undefined, 300);
  const dal = () => ({ ...rangeItem("dal tadka", 150, undefined, undefined, 150), fat_g: 5 });
  const salad = () => ({ ...rangeItem("cucumber salad", 100, undefined, undefined, 40), fat_g: 1 });

  const fcases: FCase[] = [
    {
      why: "restaurant: ×1.25 fat and kcal on curries/fried items, untouched on a salad",
      effect: "restaurant",
      items: [curry(), salad()],
      check: (out) => out[0].calories === 375 && out[1].calories === 40,
    },
    {
      why: "homemade: no change",
      effect: "homemade",
      items: [curry()],
      check: (out) => out[0].calories === 300,
    },
    {
      why: "add_ghee: +45 kcal and +5 g fat on the item the question names",
      effect: "add_ghee",
      items: [dal(), salad()],
      question: "Add ghee to the dal tadka?",
      check: (out) => out[0].calories === 195 && out[0].fat_g === 10 && out[1].calories === 40,
    },
    {
      why: "add_ghee with no item named in the question falls back to the biggest item",
      effect: "add_ghee",
      items: [salad(), dal()],
      check: (out) => out[1].calories === 195 && out[0].calories === 40,
    },
    {
      why: "no_oil: -35% fat on every item, with the removed fat's kcal taken off",
      effect: "no_oil",
      items: [dal()],
      check: (out) => out[0].fat_g === 3.3 && out[0].calories === 135,
    },
    {
      why: "smaller: x0.8 grams on all items",
      effect: "smaller",
      items: [rangeItem("rice", 200, 180, 220, 300)],
      check: (out) => out[0].grams === 160 && out[0].grams_low === 144 && out[0].grams_high === 176 && out[0].calories === 240,
    },
    {
      why: "bigger: x1.25 grams on all items",
      effect: "bigger",
      items: [rangeItem("rice", 200, 180, 220, 300)],
      check: (out) => out[0].grams === 250 && out[0].grams_low === 225 && out[0].grams_high === 275 && out[0].calories === 375,
    },
    {
      why: "an unknown effect is ignored — items come back unchanged",
      effect: "make_it_double",
      items: [curry()],
      check: (out) => out[0].calories === 300,
    },
  ];
  for (const c of fcases) {
    const out = applyFollowUpEffect(c.items, c.effect, c.question);
    const ok = c.check(out);
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.effect} — ${c.why}`);
  }
}

runPlateCases().then(() => {
  const total = cases.length + plateCases.length + 3 + 8; // + gram-range/kcal-band checks + follow-up effect cases
  console.log(`\n${total - failures}/${total} passed.`);
  if (failures) process.exit(1);
});
