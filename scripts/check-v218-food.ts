/**
 * `npx tsx scripts/check-v218-food.ts` — offline checks for the v2.18 food stream (Area A, schema_v42):
 * photo + voice merge, the home recipe library and voice recipes, honest ranges and the accuracy score,
 * the order helper, portion reference, leftovers, meal split, label vs reality, swaps, water from food
 * and the grocery list. Android mirrors these cases in app/src/test (VoicePlateTest, FoodHonestyTest,
 * OrderHelperTest, FoodBitsTest, GroceryTest, HomeRecipesTest).
 */
import assert from "node:assert/strict";
import { applyVoiceAmounts, applyVoiceOil, dropUnpriced, foodTokens, matchItem, mergeVoice, parseVoice } from "../src/lib/food/voicePlate";
import { HOME_RECIPES, homeRecipeAsOwn, homeRecipeItem, ingredientFromItem, parseVoiceRecipe, searchHomeRecipes, unitLabel } from "../src/lib/food/homeRecipes";
import { dayAccuracy, kcalRange, plusMinusLabel, rangeFromGrams, relUncertainty, totalPlusMinus } from "../src/lib/food/honesty";
import { orderPlan, parseOrderText, planItems, type OrderDish } from "../src/lib/food/orderHelper";
import { cleanScaleRef, fractionLabel, labelRealityGaps, leftoverActive, leftoverLine, normalizeShares, pickSwap, realityLine, scaleMealItem, sizedUsingLabel, splitEaten, splitShares, waterFromMeals, waterMl } from "../src/lib/food/foodBits";
import { groceryList, groceryText, inPantry, pantryCategory } from "../src/lib/food/grocery";
import type { MealItem, PlateItem } from "../src/lib/types";
import { rescaleItem } from "../src/lib/quantity";

const plate = (name: string, grams: number, kcal: number, over: Partial<PlateItem> = {}): PlateItem => ({ name, grams, confidence: "medium", calories: kcal, protein_g: kcal / 20, carbs_g: kcal / 8, fat_g: kcal / 30, micros: {}, source: "estimated", food_id: null, ...over });
const meal = (name: string, grams: number, kcal: number, over: Partial<MealItem> = {}): MealItem => ({ food_id: null, name, grams, calories: kcal, protein_g: 5, carbs_g: 20, fat_g: 5, source: "table", confidence: 1, micros: {}, unit: "g", servings: null, ...over });

// ---------------------------------------------------------------- A1 voice merge
assert.deepEqual(foodTokens("Chapatis"), ["roti"]);
assert.deepEqual(foodTokens("Dal Tadka"), ["dal", "tadka"]);
assert.equal(matchItem([plate("jeera rice", 150, 230), plate("dal tadka", 150, 170)], "daal"), 1);
assert.equal(matchItem([plate("jeera rice", 150, 230)], "chawal"), 0);
assert.equal(matchItem([plate("jeera rice", 150, 230)], "paneer"), -1);

let p = parseVoice("2 roti, less oil, extra dal");
assert.equal(p.segments.length, 2);
assert.deepEqual(p.segments.map((s) => [s.food, s.count, s.mod]), [["roti", 2, "set"], ["dal", null, "extra"]]);
assert.deepEqual(p.oil, [{ level: "less", food: null }]);

const base = [plate("roti", 120, 330), plate("dal tadka", 150, 170), plate("aloo gobi", 150, 150)];
let m = applyVoiceAmounts(base, p);
assert.equal(m.items[0].grams, 80); // 3 roti seen (120 g) → 2 × 40 g
assert.equal(m.items[0].calories, 220);
assert.equal(m.items[1].grams, 225); // extra dal ×1.5
assert.equal(m.items[2].grams, 150);
assert.equal(m.added.length, 0);
assert.ok(m.changes[0].startsWith("Roti → 2 roti (80 g)"));
const oiled = applyVoiceOil(m.items, p);
// less oil: dal and aloo gobi are oily (−30 % fat), roti is not
assert.equal(oiled.items[0].fat_g, m.items[0].fat_g);
assert.ok(oiled.items[1].fat_g < m.items[1].fat_g && oiled.items[2].fat_g < m.items[2].fat_g);
assert.ok(oiled.changes[0].startsWith("Less oil on 2 dishes"));

// "set", not "add": saying the count the photo already shows changes nothing
assert.equal(mergeVoice([plate("roti", 80, 220)], "2 roti").changes.length, 0);
// Hinglish numbers, katori units, removal, foods the photo missed
m = mergeVoice([plate("rice", 200, 260), plate("papad", 12, 50)], "do katori chawal aur papad nahi khaya, plus a glass of chaas");
assert.equal(m.items.length, 2);
assert.equal(m.items[0].grams, 300);
assert.equal(m.items[1].name, "chaas");
assert.equal(m.items[1].grams, 250);
assert.equal(m.items[1].from_voice, true);
assert.deepEqual(m.added, [1]);
assert.ok(m.changes.includes("Removed papad"));
// "no papad" when there is none: nothing happens
assert.equal(mergeVoice([plate("rice", 200, 260)], "no papad").items.length, 1);
// half / double / explicit grams / Devanagari
assert.equal(mergeVoice([plate("rice", 200, 260)], "half rice").items[0].grams, 100);
assert.equal(mergeVoice([plate("rice", 200, 260)], "double rice").items[0].grams, 400);
assert.equal(mergeVoice([plate("paneer bhurji", 200, 500)], "120g paneer").items[0].grams, 120);
assert.equal(mergeVoice([plate("roti", 40, 110)], "तीन रोटी").items[0].grams, 120);
// extra ghee goes to the dish it names; no dish named → the biggest oily dish
let g = mergeVoice([plate("roti", 80, 220), plate("dal", 150, 170)], "2 roti with ghee");
assert.equal(g.items[0].calories, 265);
assert.equal(g.items[1].calories, 170);
g = mergeVoice([plate("salad", 100, 40), plate("rajma", 150, 210)], "extra ghee");
assert.equal(g.items[1].calories, 255);
// no oil on a named dish only
g = mergeVoice([plate("bhindi", 150, 160, { fat_g: 11 }), plate("dal", 150, 170, { fat_g: 6 })], "bhindi without oil");
assert.equal(g.items[0].fat_g, 4.4);
assert.equal(g.items[1].fat_g, 6);
// voice-added items the web couldn't price are dropped, never logged at 0 kcal
const d = dropUnpriced([plate("rice", 150, 195), plate("chaas", 250, 0, { from_voice: true })]);
assert.equal(d.items.length, 1);
assert.equal(d.notes.length, 1);
// an empty / junk utterance changes nothing
assert.equal(mergeVoice(base, "").changes.length, 0);
assert.equal(mergeVoice(base, "umm okay, that's it").items.length, 3);
assert.equal(mergeVoice(base, "chaas bhi").items.length, 4);

// ---------------------------------------------------------------- A2 home recipes
assert.ok(HOME_RECIPES.length >= 60, "60+ home recipes");
const ids = new Set(HOME_RECIPES.map((r) => r.id));
assert.equal(ids.size, HOME_RECIPES.length, "unique ids");
for (const r of HOME_RECIPES) {
  const calc = 4 * r.protein_g + 4 * r.carbs_g + 9 * r.fat_g;
  assert.ok(Math.abs(calc - r.kcal) / r.kcal <= 0.15, `${r.id}: macros match kcal`);
  assert.ok(r.unit_grams > 0 && r.ingredients.length > 0, `${r.id}: unit + ingredients`);
  assert.ok(["katori", "roti", "piece", "plate", "glass", "cup", "bowl"].includes(r.unit), `${r.id}: unit`);
}
assert.equal(searchHomeRecipes("chapati")[0].id, "roti");
assert.equal(searchHomeRecipes("dal tadka")[0].id, "dal-tadka");
assert.ok(searchHomeRecipes("paneer").length >= 4);
assert.equal(searchHomeRecipes("").length, HOME_RECIPES.length);
const dal = HOME_RECIPES.find((r) => r.id === "dal-tadka")!;
const two = homeRecipeItem(dal, 2);
assert.equal(two.grams, 300);
assert.equal(two.calories, 340);
assert.equal(two.servings, 2);
assert.equal(two.serving_unit?.label, "1 katori");
assert.equal(unitLabel(dal, 0.5), "½ katori");
assert.equal(unitLabel(dal, 2), "2 katoris");
assert.equal(homeRecipeAsOwn(dal).per_serving.kcal, 170);
let v = parseVoiceRecipe("Mom's dal: 1 katori toor dal, 1 spoon ghee, serves 4");
assert.deepEqual(v, { name: "Mom's dal", ingredients: "1 katori toor dal, 1 spoon ghee", servings: 4 });
v = parseVoiceRecipe("nani ka rajma 2 cup rajma 1 tbsp oil 2 onions for 6 people");
assert.equal(v.name, "Nani ka rajma");
assert.equal(v.servings, 6);
assert.ok(v.ingredients.startsWith("2 cup rajma"));
assert.equal(parseVoiceRecipe("1 katori poha").name, "");
const ing = ingredientFromItem(meal("Toor dal", 150, 180, { protein_g: 9, micros: { fiber_g: 3 } }));
assert.equal(ing.kcal, 180);
assert.equal(ing.fiber_g, 3);
assert.deepEqual(ing.per100, { kcal: 120, protein_g: 6, carbs_g: 13.3, fat_g: 3.3, micros: { fiber_g: 2 } });

// ---------------------------------------------------------------- A3 honest ranges
assert.equal(relUncertainty(meal("x", 100, 200, { user_verified: true })), 0.05);
assert.equal(relUncertainty(meal("x", 100, 200, { source: "scan" })), 0.08);
assert.equal(relUncertainty(meal("x", 100, 200, { source: "estimated", confidence: 0.9, source_urls: ["https://a"] })), 0.12);
assert.equal(relUncertainty(meal("x", 100, 200, { source: "estimated", confidence: 0.3 })), 0.4);
assert.deepEqual(kcalRange(meal("x", 100, 200, { source: "table" })), { low: 176, high: 224, plusMinus: 24, rel: 0.12 });
assert.deepEqual(kcalRange(meal("x", 100, 200, { kcal_low: 150, kcal_high: 260 })), { low: 150, high: 260, plusMinus: 55, rel: 0.275 });
assert.equal(kcalRange(meal("x", 100, 400, { kcal_low: 150, kcal_high: 260, source: "table" })).plusMinus, 48); // edited amount: the stale range is ignored
assert.equal(plusMinusLabel(meal("x", 10, 20)), ""); // ±2 isn't worth showing
assert.equal(totalPlusMinus([meal("a", 100, 300), meal("b", 100, 400)]), 60); // sqrt(36² + 48²)
assert.deepEqual(rangeFromGrams({ calories: 200, grams: 100, grams_low: 80, grams_high: 130 }), { kcal_low: 160, kcal_high: 260 });
assert.equal(rangeFromGrams({ calories: 200, grams: 100 }), null);
let acc = dayAccuracy([{ id: "m1", items: [meal("oats", 40, 150, { source: "scan" }), meal("whey", 30, 120, { user_verified: true })] }]);
assert.ok(acc.score! >= 80 && acc.label === "Sharp" && acc.vague.length === 0);
acc = dayAccuracy([{ id: "m1", items: [meal("biryani", 300, 600, { source: "estimated", confidence: 0.3 }), meal("curd", 100, 60, { source: "table" })] }]);
assert.ok(acc.score! < 20);
assert.deepEqual(acc.vague.map((x) => [x.mealId, x.index, x.name]), [["m1", 0, "biryani"]]);
assert.equal(dayAccuracy([]).score, null);

// ---------------------------------------------------------------- A4 order helper
const order = parseOrderText(`Order #88213
2 x Butter Naan ₹120
Paneer Tikka x 1   ₹280
Dal Makhani (Qty 1)
Item total ₹560
Delivery fee ₹35
GST and restaurant charges ₹42
1 Gulab Jamun
To pay ₹637`);
assert.deepEqual(order, [
  { name: "Butter Naan", qty: 2 },
  { name: "Paneer Tikka", qty: 1 },
  { name: "Dal Makhani", qty: 1 },
  { name: "Gulab Jamun", qty: 1 },
]);
assert.deepEqual(parseOrderText("Veg Biryani\nveg biryani x 2"), [{ name: "Veg Biryani", qty: 3 }]);
const dish = (name: string, kl: number, kh: number, pl: number, ph: number, qty = 1): OrderDish => ({ name, description: "", section: null, portion: "1", grams: 200, kcal_low: kl, kcal_high: kh, protein_low: pl, protein_high: ph, carbs_g: 30, fat_g: 10, confidence: "medium", why: "", veg: true, contains: [], price: null, fits_diet: true, diet_conflicts: [], score: 0, best_pick: false, qty });
const ds = [dish("Butter Naan", 260, 320, 7, 9, 2), dish("Paneer Tikka", 300, 360, 20, 24), dish("Gulab Jamun", 280, 320, 3, 5)];
let plan = orderPlan(ds, { kcal: 2000, protein: 80 });
assert.equal(plan.fits, true);
assert.ok(plan.rows.every((r) => r.eat === 1));
plan = orderPlan(ds, { kcal: 700, protein: 60 });
assert.equal(plan.fits, false);
assert.equal(plan.rows[1].eat, 1); // paneer tikka (most protein per kcal) stays whole
assert.ok(plan.plan_kcal <= 700);
assert.ok(plan.rows[2].eat < 1); // dessert shrinks
const pre = planItems(ds, plan);
assert.ok(pre.every((i) => i.calories > 0 && i.kcal_low! <= i.calories && i.kcal_high! >= i.calories));
plan = orderPlan(ds, { kcal: 0, protein: 0 });
assert.equal(plan.rows[1].eat, 0.5); // nothing fits → half the most protein-dense dish
assert.equal(orderPlan([], { kcal: 500, protein: 0 }).rows.length, 0);

// ---------------------------------------------------------------- A5 portion reference
assert.equal(cleanScaleRef("steel katori"), "katori");
assert.equal(cleanScaleRef("Hand / palm"), "hand");
assert.equal(cleanScaleRef("none"), null);
assert.equal(cleanScaleRef("a banana"), null);
assert.equal(sizedUsingLabel("tablespoon"), "Sized using: spoon");
assert.equal(sizedUsingLabel(null), null);

// ---------------------------------------------------------------- A6 leftovers
const biryani = meal("Paneer biryani", 400, 640, { kcal_low: 560, kcal_high: 720, unit: "serving", servings: 2 });
const half = splitEaten([biryani], 0.5);
assert.equal(half.eaten[0].calories, 320);
assert.equal(half.left[0].calories, 320);
assert.equal(half.left[0].servings, 1);
assert.equal(half.left[0].kcal_low, 280);
assert.equal(half.leftFraction, 0.5);
assert.equal(splitEaten([biryani], 1).left.length, 0);
assert.equal(fractionLabel(0.75), "¾");
assert.equal(leftoverLine({ name: "Paneer biryani", kcal: 320, fraction_left: 0.5 }), "½ of Paneer biryani · 320 kcal");
const now = Date.parse("2026-09-29T12:00:00Z");
assert.equal(leftoverActive({ created_at: "2026-09-28T20:00:00Z" }, now), true);
assert.equal(leftoverActive({ created_at: "2026-09-25T20:00:00Z" }, now), false); // > 3 days
assert.equal(leftoverActive({ created_at: "2026-09-29T08:00:00Z", used_at: "2026-09-29T09:00:00Z" }, now), false);
assert.equal(scaleMealItem(biryani, 0.25).grams, 100);

// ---------------------------------------------------------------- A7 split
assert.deepEqual(normalizeShares([1, 1, 2]), [0.25, 0.25, 0.5]);
assert.deepEqual(normalizeShares([0, 0]), [0.5, 0.5]);
assert.deepEqual(normalizeShares([2, -1, 2]), [0.5, 0, 0.5]);
const parts = splitShares([meal("Rajma", 600, 840)], [1, 1, 1]);
assert.equal(parts.length, 3);
assert.equal(parts[0][0].calories, 280);
assert.equal(parts[0][0].grams, 200);

// ---------------------------------------------------------------- A8 label vs reality
let gaps = labelRealityGaps({ calories: 380, protein_g: 30, carbs_g: 40, fat_g: 10 }, { calories: 400, protein_g: 20, carbs_g: 42, fat_g: 11 });
assert.deepEqual(gaps.map((x) => x.field), ["protein_g"]);
assert.equal(gaps[0].pct, 50);
assert.equal(realityLine(gaps[0]), "Protein: label says 30 g per 100 g, the web says 20 g (50% apart)");
assert.equal(labelRealityGaps({ calories: 50, protein_g: 1 }, { calories: 60, protein_g: 1.5 }).length, 0); // tiny absolute gaps
assert.equal(labelRealityGaps({ calories: 250 }, { calories: 480 })[0].field, "calories");
assert.equal(labelRealityGaps({}, { calories: 400 }).length, 0);

// ---------------------------------------------------------------- A9 swaps
let s = pickSwap([meal("Butter naan", 90, 290), meal("Dal makhani", 150, 280)]);
assert.equal(s?.to, "Dal tadka");
assert.equal(s?.delta, -111);
assert.equal(s?.line, "Dal tadka instead of dal makhani: −111 kcal");
s = pickSwap([meal("Maida roti", 60, 200)]);
assert.equal(s?.line, "Wheat roti instead of maida roti: −40 kcal");
assert.equal(pickSwap([meal("Roti", 40, 105)]), null);
assert.equal(pickSwap([meal("Pav bhaji", 300, 550)]), null); // not a pakora
assert.equal(pickSwap([meal("Diet coke", 330, 1)]), null);
assert.equal(pickSwap([meal("Chai without sugar", 150, 50)]), null);

// ---------------------------------------------------------------- A10 water from food
assert.equal(waterMl({ name: "Dal tadka", grams: 150 }), 120);
assert.equal(waterMl({ name: "Chaas", grams: 250 }), 225);
assert.equal(waterMl({ name: "Watermelon", grams: 200 }), 186);
assert.equal(waterMl({ name: "Roti", grams: 80 }), 0);
assert.equal(waterMl({ name: "Whey protein powder with milk", grams: 30 }), 0);
assert.equal(waterFromMeals([{ items: [{ name: "Dal", grams: 150 }, { name: "Curd", grams: 100 }] }, { items: [{ name: "Apple", grams: 180 }] }]), 120 + 85 + 151);

// ---------------------------------------------------------------- A11 grocery
const eaten = [
  { name: "Roti", grams: 80 }, { name: "Roti", grams: 120 }, { name: "Dal tadka", grams: 150 }, { name: "Dal tadka", grams: 150 },
  { name: "Paneer bhurji", grams: 120 }, { name: "Jeera rice", grams: 150 }, { name: "Masala chai", grams: 150 }, { name: "Banana", grams: 120 },
];
const list = groceryList({ eaten, days: 7, proteinTarget: 110, avgProtein: 70, pantry: [{ name: "atta", in_stock: true }, { name: "Rice", in_stock: false }], diet: "veg" });
const byKey = Object.fromEntries(list.map((i) => [i.key, i]));
assert.equal(byKey.atta.inPantry, true);
assert.equal(byKey.rice.inPantry, false);
assert.ok(byKey.paneer.why.includes("protein gap"));
assert.ok(byKey.soya, "second protein fill for veg");
assert.ok(!byKey.eggs && !byKey.chicken, "veg: no eggs or chicken");
assert.ok(byKey.veg && byKey.fruit);
assert.deepEqual([...new Set(list.map((i) => i.category))], ["staples", "protein", "dairy", "produce"]);
assert.ok(!groceryText(list).includes("atta"));
assert.ok(groceryText(list).includes("☐ Rice"));
const ne = groceryList({ eaten: [], days: 14, proteinTarget: 120, avgProtein: 60, pantry: [], diet: "nonveg" });
assert.ok(ne.some((i) => i.key === "eggs") || ne.some((i) => i.key === "paneer"));
assert.equal(groceryList({ eaten: [], days: 7, proteinTarget: 100, avgProtein: 95, pantry: [] }).length, 2); // just produce
assert.equal(inPantry("Toor dal", [{ name: "toor dal 1kg", in_stock: true }]), true);
assert.equal(pantryCategory("Paneer"), "dairy");
assert.equal(pantryCategory("Onions"), "produce");

console.log("check-v218-food: all good");
// parity with Android: Devanagari "और" splits an utterance; a null label field is skipped, not 0
{
  const dv = mergeVoice([plate("roti", 40, 110), plate("rice", 200, 260)], "दो रोटी और आधा चावल");
  if (dv.items[0].grams !== 80 || dv.items[1].grams !== 100) throw new Error("Devanagari split");
  if (labelRealityGaps({ calories: null, protein_g: 20 }, { calories: 400, protein_g: 20 }).length !== 0) throw new Error("null label field");
  console.log("check-v218-food: parity good");
}

// ---- review fixes (v2.18): no phantom ghee from dish names, "not much", "half roti", servings, stale ranges
{
  const bc = mergeVoice([plate("butter chicken", 150, 330), plate("butter naan", 90, 290)], "butter chicken and butter naan");
  assert.equal(bc.items[0].calories, 330);
  assert.equal(bc.items[1].calories, 290);
  assert.deepEqual(parseVoice("fried rice").oil, []);
  assert.deepEqual(parseVoice("dal tadka").oil, []);
  assert.equal(mergeVoice([plate("dal tadka", 150, 170), plate("rice", 150, 195)], "extra dal tadka").items[0].grams, 225);
  assert.deepEqual(parseVoice("oil kam").oil, [{ level: "less", food: null }]);
  assert.deepEqual(parseVoice("without any oil").oil, [{ level: "none", food: null }]);
  assert.equal(mergeVoice([plate("rice", 200, 260)], "not much rice").items[0].grams, 140); // less, not removed
  assert.equal(mergeVoice([plate("rice", 200, 260)], "no rice").items.length, 0);
  assert.equal(mergeVoice([plate("roti", 120, 330)], "half roti").items[0].grams, 20); // half of ONE roti
  assert.equal(parseVoiceRecipe("Mom's dal: 1 katori toor dal, coriander for garnish, serves 4").servings, 4);
}
{

  const r = rescaleItem(meal("Biryani", 300, 600, { kcal_low: 500, kcal_high: 700 }), 150);
  assert.equal(r.kcal_low, 250);
  assert.equal(r.kcal_high, 350);
  console.log("check-v218-food: review fixes good");
}
