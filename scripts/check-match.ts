/**
 * `npx tsx scripts/check-match.ts` — offline check of src/lib/foodSearch.ts's isAcceptableMatch
 * against the bug that started v2.7 (a peeled cucumber photo matched "Cold cucumber cream soup")
 * plus a few sanity cases it must keep working. No DB access — hits are hand-built fixtures with
 * the score search_foods would actually return for that name.
 */
import { isAcceptableMatch, sourceBonus, type FoodHit } from "../src/lib/foodSearch";

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

console.log(`\n${cases.length - failures}/${cases.length} passed.`);
if (failures) process.exit(1);
