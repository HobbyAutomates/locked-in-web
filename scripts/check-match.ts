/**
 * `npx tsx scripts/check-match.ts` — offline check of src/lib/foodSearch.ts's isAcceptableMatch
 * against the bug that started v2.7 (a peeled cucumber photo matched "Cold cucumber cream soup")
 * plus a few sanity cases it must keep working. No DB access — hits are hand-built fixtures with
 * the score search_foods would actually return for that name.
 */
import { isAcceptableMatch, sourceBonus, type FoodHit } from "../src/lib/foodSearch";
import { crossValidatePlateItem, webCheckPlateItem, type WebHit } from "../src/lib/plateMatch";
import { applyCorrection, median, overrideKey, pctError, per100Kcal, perUnitKcal, rescalePer100, rescalePerUnit } from "../src/lib/perUnit";
import { webResultFrom } from "../src/lib/webFood";
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

function plateItem(name: string, grams: number, calories = Math.round(grams * 0.18)): PlateItem {
  return { name, grams, confidence: "medium", calories, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {}, source: "estimated", food_id: null };
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
  { why: "cucumber vs the soup row, live lookup down: the model's own estimate stands", item: plateItem("cucumber", 200), table: [soup], live: null, expectSource: "estimated", expectFoodId: null, expectKcal: 36, expectLiveCalls: 1 },
  { why: "an acceptable table row wins without calling the live lookup", item: plateItem("cucumber", 100), table: [plainCucumber], live: liveCucumber, expectSource: "table", expectFoodId: plainCucumber.id, expectKcal: 16, expectLiveCalls: 0 },
  // v2.15: the owner's muesli bowl (40 g muesli + 100 ml milk ≈ 190 kcal). The photo read was 180 g / 252 kcal;
  // the live lookup answered with dry muesli (380/100 g) and the scan said 684. The density guard keeps the photo read.
  { why: "soaked muesli with milk: a dry-muesli live lookup (380/100 g vs 140) is rejected, the photo read stands", item: plateItem("chocolate protein oats/muesli with milk", 180, 252), table: [], live: withMacros(hit("muesli", "ai", 1, true), 380), expectSource: "estimated", expectFoodId: null, expectKcal: 252, expectLiveCalls: 1 },
  { why: "a table row 3x denser than what the photo shows is rejected too; a sane live lookup then wins", item: plateItem("dal", 150, 150), table: [withMacros(hit("Dal", "ifct", 0.95, true), 330)], live: withMacros(hit("dal", "ai", 1, true), 110), expectSource: "estimated", expectFoodId: null, expectKcal: 165, expectLiveCalls: 1 },
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

// ---- v2.15: photos go to the web (plateMatch.webCheckPlateItem) — density guard on WEB results ----

let extra = 0;
function expect(label: string, ok: boolean, detail = "") {
  extra++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function webHit(calories: number, confidence: WebHit["confidence"] = "high"): WebHit {
  return { calories, protein_g: 5, carbs_g: 10, fat_g: 3, sources: [{ label: "IFCT", url: "https://www.ifct2017.com/" }], confidence, matched_name: "x", basis: "cooked" };
}

async function runWebCases() {
  console.log("\nPhoto web lookup (no DB) + density guard");
  const muesli = plateItem("chocolate protein oats/muesli with milk", 180, 252); // 140 kcal/100 g as seen
  {
    let calls = 0;
    const out = await webCheckPlateItem(muesli, { web: async () => (calls++, webHit(392)) });
    expect("dry-muesli web answer (392 vs 140/100 g, 2.8x) is rejected: photo numbers stay, low confidence", out.calories === 252 && out.confidence === "low" && out.source_info?.kind === "estimate" && calls === 1, `${out.calories} kcal, ${out.confidence}`);
  }
  {
    const out = await webCheckPlateItem(plateItem("roti", 80, 216), { web: async () => webHit(280) }); // 270 vs 280
    expect("roti web answer inside the band wins: 80 g × 280/100 g = 224 kcal, web source + links", out.calories === 224 && out.source_info?.kind === "web" && out.source_info.links.length === 1 && out.source_urls?.[0] === "https://www.ifct2017.com/" && out.food_id === null, `${out.calories} kcal`);
  }
  {
    const lo = await webCheckPlateItem(plateItem("dal", 100, 100), { web: async () => webHit(50) }); // exactly 0.5x
    const hi = await webCheckPlateItem(plateItem("dal", 100, 100), { web: async () => webHit(201) }); // just over 2x
    expect("band edges: 0.5x accepted, 2.01x rejected", lo.calories === 50 && hi.calories === 100 && hi.confidence === "low");
  }
  {
    const out = await webCheckPlateItem(plateItem("sambar", 150, 90), { web: async () => null });
    expect("web down / timeout: the photo's numbers stand, labelled AI estimate", out.calories === 90 && out.source_info?.kind === "estimate" && out.source_info.label === "AI estimate");
  }
  {
    const out = await webCheckPlateItem({ ...plateItem("paneer bhurji", 120, 300), confidence: "high" }, { web: async () => webHit(265, "low") });
    expect("a low-confidence web answer lowers the item's confidence", out.confidence === "low" && out.calories === 318);
  }
}

console.log("\nWeb result sanity (webResultFrom)");
{
  const good = webResultFrom({ calories: 280, protein_g: 7.5, carbs_g: 48, fat_g: 6, sources: [{ url: "https://a.example/roti", title: "A" }, { url: "not-a-url" }], confidence: "high", matched_name: "Roti" }, [{ label: "B", url: "https://b.example" }]);
  expect("a consistent report passes, bad URLs dropped, searched pages fill in", !!good && good.calories === 280 && good.sources.length === 2 && good.sources[0].url === "https://a.example/roti" && good.sources[1].url === "https://b.example");
  const bad = webResultFrom({ calories: 100, protein_g: 20, carbs_g: 40, fat_g: 10, sources: [], confidence: "high" }, []);
  expect("macros that don't add up to the kcal (330 vs 100) are rejected", bad === null);
  const noLinks = webResultFrom({ calories: 34, protein_g: 3.3, carbs_g: 4.5, fat_g: 0.3, sources: [], confidence: "high" }, []);
  expect("no source links → never 'high' confidence", noLinks?.confidence === "medium");
}

console.log("\nPer-unit / per-100 g rescale + corrections (perUnit.ts)");
{
  const roti = { name: "Roti", food_id: "roti", grams: 80, calories: 240, protein_g: 6, carbs_g: 40, fat_g: 4 }; // 2 × 120
  expect("per-unit kcal from the total: 240 / 2 = 120", perUnitKcal(roti, 2) === 120);
  const r95 = rescalePerUnit(roti, 2, 95);
  expect("2 roti at 95 kcal each = 190 kcal, macros scale ×190/240", r95.calories === 190 && r95.protein_g === 4.8 && r95.carbs_g === 31.7 && r95.fat_g === 3.2 && r95.per_unit_kcal === 95, `${r95.calories} P${r95.protein_g} C${r95.carbs_g} F${r95.fat_g}`);
  const r3 = rescalePerUnit(roti, 3, 95, { protein_g: 3 });
  expect("3 roti at 95 each with protein 3 g per roti typed: 285 kcal, P 9 (typed), carbs scaled", r3.calories === 285 && r3.protein_g === 9 && r3.carbs_g === 47.5);
  const rice = { name: "rice", food_id: null, grams: 150, calories: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 };
  expect("per 100 g from the total: 195 / 150 g = 130", per100Kcal(rice) === 130);
  const r140 = rescalePer100(rice, 140);
  expect("150 g at 140 kcal/100 g = 210 kcal, macros ×210/195", r140.calories === 210 && r140.carbs_g === 45.2, `${r140.calories} C${r140.carbs_g}`);
  const fixed = applyCorrection(roti, { calories: 200, fat_g: 8 });
  expect("correction: kcal and typed fat win, blank macros follow the kcal, user_verified", fixed.calories === 200 && fixed.fat_g === 8 && fixed.protein_g === 5 && fixed.user_verified === true);
  const zero = rescalePerUnit({ ...roti, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, 2, 95);
  expect("a 0 kcal item still takes the new kcal (macros stay 0)", zero.calories === 190 && zero.protein_g === 0);
  expect("% error: 684 app vs 190 user = +260%", pctError(684, 190) === 260);
  expect("median of [10, -5, 40, 2] = 6", median([10, -5, 40, 2]) === 6);
  expect("override key: '2 Roti' and 'roti' share a key", overrideKey({ name: "2 Roti" }) === overrideKey({ name: "roti", food_id: "x" }) && overrideKey({ name: "roti" }) === "roti");
}

runPlateCases().then(runWebCases).then(() => {
  const total = cases.length + plateCases.length + 3 + 8 + extra; // + gram-range/kcal-band checks + follow-up effect cases + v2.15 checks
  console.log(`\n${total - failures}/${total} passed.`);
  if (failures) process.exit(1);
});
