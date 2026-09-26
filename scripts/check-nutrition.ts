/**
 * `npx tsx scripts/check-nutrition.ts` — offline checks for the v2.13 nutrition modules:
 * diet modes (targets + food filters), what-to-eat ranking, fasting stages / access, recipe maths,
 * micronutrient targets and hints, the menu-scan ranking and the ⓘ item info. No DB.
 * Android runs the same vectors against its util/*.kt ports.
 */
import { DIET_MODES, dietConflicts, dietTargets, effectiveDietMode, foodAllowed, modeAllowed, type DietMode } from "../src/lib/dietModes";
import { fitScore, portionOf, proteinScore, remainingFrom, scorePreset, suggestFoods, usualPicks } from "../src/lib/whatToEat";
import { clampHours, clock, durationText, fastingAccess, stageAt } from "../src/lib/fasting";
import { perServing, priceIngredient, recipeFromRow, recipeMealItem, recipeTotals, type RecipeIngredient } from "../src/lib/recipes";
import { calciumRda, dayMicros, ironRda, microTargets, weekAverage, weekHints } from "../src/lib/micros";
import { dishMealItem, rankMenu, sanitizeDish } from "../src/lib/menuScan";
import { confidenceWhy, gramRange, gramRangeText, levelOf, originOf } from "../src/lib/itemInfo";
import { DEFAULT_PROFILE, type FoodPreset, type Meal, type Profile } from "../src/lib/types";

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

const TODAY = "2026-09-26";
const adult: Profile = { ...DEFAULT_PROFILE, dob: "1998-01-01", gender: "male", height_cm: 175, weight_kg: 80, goal_type: "maintain", weekly_workout_target: 3, protein_target_g: 120, calorie_target: 2000 };
const teen: Profile = { ...adult, dob: "2010-06-01", weight_kg: 60 };

// ---------------------------------------------------------------- diet modes: targets
eq("9 modes", DIET_MODES.length, 9);
eq("balanced = goals.ts (1.6 g/kg, fat 25 %)", dietTargets(adult, 2000, "balanced", TODAY), { calories: 2000, protein: 128, carbs: 246, fat: 56 });
eq("high protein 2.0 g/kg", dietTargets(adult, 2000, "high_protein", TODAY), { calories: 2000, protein: 160, carbs: 214, fat: 56 });
eq("vegetarian 1.6 g/kg", dietTargets(adult, 2000, "vegetarian", TODAY).protein, 128);
eq("vegan 1.8 g/kg", dietTargets(adult, 2000, "vegan", TODAY).protein, 144);
eq("keto: carbs 50 g, fat the rest", dietTargets(adult, 2000, "keto", TODAY), { calories: 2000, protein: 128, carbs: 50, fat: 143 });
eq("low carb: 26 % capped at 130 g", dietTargets(adult, 2000, "low_carb", TODAY), { calories: 2000, protein: 144, carbs: 130, fat: 100 });
eq("low carb under 2000 kcal: 26 %", dietTargets(adult, 1600, "low_carb", TODAY).carbs, 104);
eq("mediterranean: fat 35 %, protein ≥ 1.2 g/kg and never under balanced", dietTargets(adult, 2000, "mediterranean", TODAY), { calories: 2000, protein: 128, carbs: 197, fat: 78 });
eq("mediterranean for a sedentary adult: 1.2 g/kg beats 1.0", dietTargets({ ...adult, weekly_workout_target: 0 }, 2000, "mediterranean", TODAY).protein, 96);
eq("calories never change", DIET_MODES.map((m) => dietTargets(adult, 2345, m.key, TODAY).calories), DIET_MODES.map(() => 2345));
eq("no weight: protein target kept", dietTargets({ ...adult, weight_kg: null }, 2000, "high_protein", TODAY).protein, 120);
eq("teen high protein capped at 1.6 g/kg", dietTargets(teen, 2400, "high_protein", TODAY).protein, 96);
eq("teen keto counts as balanced (ICMR-NIN 55 g)", dietTargets(teen, 2400, "keto", TODAY), dietTargets(teen, 2400, "balanced", TODAY));
eq("teen balanced protein", dietTargets(teen, 2400, "balanced", TODAY).protein, 55);
eq("under 18 can't pick keto / low carb / mediterranean", (["keto", "low_carb", "mediterranean"] as DietMode[]).map((m) => modeAllowed(m, 16)), [false, false, false]);
eq("under 18 can pick the six", (["balanced", "high_protein", "vegetarian", "eggetarian", "vegan", "jain"] as DietMode[]).every((m) => modeAllowed(m, 16)), true);
eq("adults can pick all", DIET_MODES.every((m) => modeAllowed(m.key, 25)), true);
eq("unknown mode → balanced", effectiveDietMode("paleo" as DietMode, 25), "balanced");
eq("protein never over the budget", dietTargets(adult, 400, "high_protein", TODAY).protein, 100);

// ---------------------------------------------------------------- diet modes: food filters
const allowed = (m: DietMode, names: string[]) => names.map((n) => foodAllowed(m, n));
eq("balanced allows everything", allowed("balanced", ["Chicken curry", "Egg bhurji", "Fish fry", "Honey"]), [true, true, true, true]);
eq("vegetarian", allowed("vegetarian", ["Chicken curry", "Egg bhurji", "Paneer tikka", "Fish fry", "Veg biryani", "Chicken biryani", "Hara bhara kebab", "Eggless cake", "Omelette"]), [false, false, true, false, true, false, true, true, false]);
eq("eggetarian", allowed("eggetarian", ["Egg bhurji", "Boiled eggs", "Fish fry", "Mutton curry", "Anda curry"]), [true, true, false, false, true]);
eq("vegan", allowed("vegan", ["Paneer butter masala", "Peanut butter toast", "Dal tadka", "Ghee roti", "Curd rice", "Soy milk", "Masala chai", "Honey", "Tofu stir fry"]), [false, true, true, false, false, true, false, false, true]);
eq("jain", allowed("jain", ["Aloo paratha", "Jeera rice", "Onion pakoda", "Honey lemon water", "Moong dal", "Samosa", "Chicken tikka", "Gajar halwa", "Paneer bhurji"]), [false, true, false, false, true, false, false, false, true]);
eq("conflict reasons", dietConflicts("vegan", "Egg and cheese sandwich"), ["egg", "dairy"]);
eq("word boundaries (eggplant isn't egg, hamburger bun isn't ham)", allowed("vegetarian", ["Eggplant bharta", "Hamburger bun"]), [true, true]);

// ---------------------------------------------------------------- what to eat
const preset = (id: string, label: string, category: FoodPreset["category"], per100: [number, number, number, number], servings: { label: string; grams: number }[] = [], def: string | null = null): FoodPreset => ({
  id,
  food_id: `f-${id}`,
  label,
  label_hi: null,
  category,
  servings,
  default_serving: def,
  sort: 1,
  icon: null,
  food_name: label,
  calories: per100[0],
  protein_g: per100[1],
  carbs_g: per100[2],
  fat_g: per100[3],
  micros: { fiber_g: 1 },
});
const presets: FoodPreset[] = [
  preset("egg", "Boiled egg", "protein", [155, 13, 1.1, 11], [{ label: "1 egg", grams: 50 }], "1 egg"),
  preset("chicken", "Chicken breast", "protein", [165, 31, 0, 3.6], [{ label: "1 katori", grams: 150 }], "1 katori"),
  preset("paneer", "Paneer bhurji", "protein", [260, 17, 6, 19], [{ label: "1 katori", grams: 150 }], "1 katori"),
  preset("dal", "Moong dal", "dal", [105, 7, 15, 2], [{ label: "1 katori", grams: 150 }], "1 katori"),
  preset("rice", "Jeera rice", "staple", [150, 3, 30, 3], [{ label: "1 katori", grams: 150 }], "1 katori"),
  preset("jalebi", "Jalebi", "sweet", [400, 3, 60, 18], [{ label: "1 piece", grams: 30 }], "1 piece"),
  preset("ghee", "Ghee", "fat", [900, 0, 0, 100], [{ label: "1 tsp", grams: 5 }], "1 tsp"),
  preset("poha", "Poha", "breakfast", [130, 2.5, 25, 3], [{ label: "1 plate", grams: 200 }], "1 plate"),
  preset("curd", "Curd", "protein", [60, 3.5, 4.5, 3.5], [{ label: "1 katori", grams: 150 }], "1 katori"),
];
const rem = { kcal: 600, protein: 50, carbs: 60, fat: 20 };
eq("portion = one tap (1 egg, 50 g)", portionOf(presets[0]).grams, 50);
eq("protein score caps at 1", proteinScore(31, 165), 1);
eq("protein score of rice", Math.round(proteinScore(3, 150) * 1000) / 1000, 0.167);
eq("fit: inside what's left", fitScore(300, 600), 1);
eq("fit: 1.5× what's left", fitScore(900, 600), 0.5);
eq("fit: nothing left", fitScore(100, 0), 0);
eq("score of chicken at lunch", scorePreset(presets[1], rem, "lunch"), 1);
const top = suggestFoods({ remaining: rem, mode: "balanced", mealType: "lunch", presets });
eq("top 5 at lunch", top.map((s) => s.id), ["chicken", "egg", "dal", "paneer", "curd"]);
eq("never suggests fats", top.some((s) => s.category === "fat"), false);
eq("vegetarian drops chicken and egg", suggestFoods({ remaining: rem, mode: "vegetarian", mealType: "lunch", presets }).map((s) => s.id).slice(0, 3), ["dal", "paneer", "curd"]);
eq("breakfast lifts poha over rice", suggestFoods({ remaining: rem, mode: "vegan", mealType: "breakfast", presets }).map((s) => s.id), ["dal", "poha", "rice", "jalebi"]);
eq("suggestion item priced like a one-tap add", top[0].item, { food_id: "f-chicken", name: "Chicken breast", grams: 150, calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, source: "table", confidence: 1, micros: { fiber_g: 1.5 }, unit: "serving", servings: 1, cooked_in: null, image_url: null });
eq("your usual: most eaten first, excluding shown", usualPicks({ remaining: rem, mode: "balanced", mealType: "lunch", presets, usage: { "f-rice": 9, "f-dal": 4, "f-chicken": 20, "f-ghee": 50 }, exclude: ["chicken"] }).map((s) => s.id), ["rice", "dal"]);
eq("remaining never negative", remainingFrom({ kcal: 2000, protein: 100, carbs: 200, fat: 60 }, { calories: 2100, protein: 40, carbs: 250, fat: 10 }), { kcal: 0, protein: 60, carbs: 0, fat: 50 });

// ---------------------------------------------------------------- fasting
eq("stages", [0, 11.9, 12, 17.9, 18, 40].map((h) => stageAt(h).key), ["fed", "fed", "fat_burning", "fat_burning", "ketosis", "ketosis"]);
eq("clamp hours", [0, 0.2, 16.3, 100, NaN].map(clampHours), [1, 1, 16.5, 72, 16]);
eq("clock", clock(15 * 3600_000 + 42 * 60_000 + 8_000), "15:42:08");
eq("duration text", [0.5, 16, 16.54].map(durationText), ["30 min", "16 h", "16.5 h"]);
eq("fasting hidden under 18", fastingAccess(16).ok, false);
eq("fasting hidden with a safety flag", fastingAccess(25, ["very_low_bmi"]).ok, false);
eq("fasting for adults", fastingAccess(25).ok, true);

// ---------------------------------------------------------------- recipes
const oats: RecipeIngredient = { name: "Oats", grams: 80, kcal: 311, protein_g: 13.5, carbs_g: 53, fat_g: 5.5, fiber_g: 8.5, micros: { fiber_g: 8.5, iron_mg: 3.4 }, per100: { kcal: 389, protein_g: 16.9, carbs_g: 66.3, fat_g: 6.9, micros: { fiber_g: 10.6, iron_mg: 4.3 } } };
const milk: RecipeIngredient = { name: "Milk", grams: 300, kcal: 186, protein_g: 9.6, carbs_g: 14.4, fat_g: 9.9, micros: { calcium_mg: 360 } };
eq("reprice from per-100 g", priceIngredient(oats, 100), { ...oats, grams: 100, kcal: 389, protein_g: 16.9, carbs_g: 66.3, fat_g: 6.9, fiber_g: 10.6, micros: { fiber_g: 10.6, iron_mg: 4.3 } });
eq("reprice without per-100 g scales", priceIngredient(milk, 150).kcal, 93);
eq("totals", recipeTotals([oats, milk]), { kcal: 497, protein_g: 23.1, carbs_g: 67.4, fat_g: 15.4, fiber_g: 8.5, grams: 380, micros: { fiber_g: 8.5, iron_mg: 3.4, calcium_mg: 360 } });
eq("per serving (raw weight)", perServing([oats, milk], 2), { kcal: 249, protein_g: 11.6, carbs_g: 33.7, fat_g: 7.7, fiber_g: 4.3, grams: 190, micros: { fiber_g: 4.3, iron_mg: 1.7, calcium_mg: 180 } });
eq("per serving (cooked weight)", perServing([oats, milk], 2, 500).grams, 250);
eq("zero servings counts as one", perServing([oats], 0).kcal, 311);
const logged = recipeMealItem({ name: "Overnight oats", per_serving: perServing([oats, milk], 2) }, 1.5);
eq("log 1.5 servings", [logged.name, logged.calories, logged.protein_g, logged.grams, logged.unit, logged.servings, logged.source, logged.food_id], ["Overnight oats", 374, 17.4, 285, "recipe", 1.5, "table", null]);
eq("recipe row parse", recipeFromRow({ id: "r1", name: "Oats", servings: "2", items: [oats, milk], per_serving: {}, cooked_weight_g: null }).per_serving.kcal, 249);

// ---------------------------------------------------------------- micros
eq("iron RDA", [ironRda(25, "male"), ironRda(25, "female"), ironRda(14, "male"), ironRda(16, "female")], [19, 29, 22, 32]);
eq("calcium RDA", [calciumRda(30), calciumRda(11), calciumRda(14), calciumRda(17)], [1000, 850, 1000, 1050]);
const mt = microTargets({ ...adult, calorie_target: 2400 }, TODAY);
eq("targets: fibre 30 g / 2000 kcal, sugar 10 % kcal, sodium 2000", [mt.find((t) => t.key === "fiber_g")?.target, mt.find((t) => t.key === "sugar_g")?.target, mt.find((t) => t.key === "sodium_mg")?.target], [36, 60, 2000]);
eq("user's own fibre / sugar goals win", [microTargets({ ...adult, fiber_target: 25, sugar_target: 40 }, TODAY)[0].target, microTargets({ ...adult, fiber_target: 25, sugar_target: 40 }, TODAY)[5].target], [25, 40]);
const meal = (date: string, micros: Record<string, number>[]): Meal => ({ id: date, date, raw_text: "", created_at: `${date}T08:00:00Z`, items: micros.map((m, i) => ({ food_id: null, name: `x${i}`, grams: 100, calories: 100, protein_g: 5, carbs_g: 10, fat_g: 2, source: "table", confidence: 1, micros: m })) });
const meals = [meal("2026-09-26", [{ iron_mg: 5, fiber_g: 10 }, {}]), meal("2026-09-25", [{ iron_mg: 7 }]), meal("2026-09-24", [{ iron_mg: 3, sodium_mg: 7000 }]), meal("2026-09-10", [{ iron_mg: 100 }])];
eq("day micros + coverage", [dayMicros(meals, "2026-09-26").values.iron_mg, dayMicros(meals, "2026-09-26").itemsWithData, dayMicros(meals, "2026-09-26").items], [5, 1, 2]);
const wk = weekAverage(meals, TODAY);
eq("week average over logged days", [wk.values.iron_mg, wk.loggedDays, Math.round(wk.coverage * 100)], [5, 3, 75]);
const hints = weekHints(mt, wk.values, wk.loggedDays, "vegetarian");
eq("hints: low iron with veg foods, sodium high", [hints.find((h) => h.key === "iron_mg")?.foods.includes("Mutton"), hints.find((h) => h.key === "iron_mg")?.foods.includes("Rajma"), hints.find((h) => h.key === "sodium_mg")?.kind], [false, true, "high"]);
eq("no hints under 3 logged days", weekHints(mt, wk.values, 2, "balanced"), []);

// ---------------------------------------------------------------- menu scan
eq("sanitize: ranges ordered, protein capped by kcal", sanitizeDish({ name: " Paneer tikka ", kcal_low: 500, kcal_high: 300, protein_low: 30, protein_high: 200, confidence: "sure" }), {
  name: "Paneer tikka",
  description: "",
  section: null,
  portion: "1 serving",
  grams: 0,
  kcal_low: 300,
  kcal_high: 500,
  protein_low: 30,
  protein_high: 125,
  carbs_g: 0,
  fat_g: 0,
  confidence: "medium",
  why: "",
  veg: null,
  contains: [],
  price: null,
});
eq("sanitize drops nameless / zero-kcal", [sanitizeDish({ kcal_high: 300 }), sanitizeDish({ name: "Water", kcal_low: 0, kcal_high: 0 })], [null, null]);
const menu = [
  { name: "Butter chicken", kcal_low: 550, kcal_high: 750, protein_low: 30, protein_high: 40, carbs_g: 15, fat_g: 45, confidence: "high", veg: false, contains: ["meat", "dairy"] },
  { name: "Tandoori chicken (half)", kcal_low: 350, kcal_high: 450, protein_low: 45, protein_high: 55, carbs_g: 5, fat_g: 18, confidence: "high", veg: false, contains: ["meat"] },
  { name: "Paneer tikka", kcal_low: 350, kcal_high: 450, protein_low: 22, protein_high: 28, carbs_g: 10, fat_g: 28, confidence: "medium", veg: true, contains: ["dairy"] },
  { name: "Dal makhani", kcal_low: 400, kcal_high: 550, protein_low: 14, protein_high: 18, carbs_g: 45, fat_g: 22, confidence: "medium", veg: true, contains: ["dairy", "onion_garlic"] },
  { name: "Paneer tikka", kcal_low: 1, kcal_high: 2 },
];
const ranked = rankMenu(menu, { kcal: 700, protein: 60, carbs: 80, fat: 20 }, "balanced");
eq("menu dedupes by name", ranked.dishes.length, 4);
eq("balanced best pick: tandoori chicken", ranked.best, 1);
const veg = rankMenu(menu, { kcal: 700, protein: 60, carbs: 80, fat: 20 }, "vegetarian");
eq("vegetarian best pick: paneer tikka; chicken doesn't fit", [veg.best, veg.dishes[0].fits_diet, veg.dishes[0].diet_conflicts], [2, false, ["meat"]]);
eq("jain: dal makhani conflicts on onion/garlic", rankMenu(menu, { kcal: 700, protein: 60, carbs: 80, fat: 20 }, "jain").dishes[3].diet_conflicts, ["roots"]);
const it = dishMealItem(ranked.dishes[1]);
eq("dish → meal item (mid values, restaurant)", [it.calories, it.protein_g, it.source, it.cooked_in, it.food_id], [400, 50, "estimated", "restaurant", null]);
eq("dish item macros add up", Math.abs(it.protein_g * 4 + it.carbs_g * 4 + it.fat_g * 9 - it.calories) < 3, true);

// ---------------------------------------------------------------- item info
const tableRow = { name: "Roti", food_id: "roti", grams: 80, source: "table", confidence: 1 };
const aiRow = { name: "Mystery curry", food_id: null, grams: 200, source: "estimated", confidence: 0.45 };
eq("origin", [originOf(tableRow), originOf(aiRow), originOf({ ...tableRow, source: "scan" }), originOf({ ...tableRow, unit: "recipe", food_id: null })], ["database", "ai", "scan", "recipe"]);
eq("level", [levelOf(tableRow), levelOf(aiRow), levelOf({ ...aiRow, confidence: 0.6 })], ["High", "Low", "Medium"]);
eq("gram range by confidence", [gramRangeText(tableRow), gramRangeText(aiRow)], ["70–90 g", "120–280 g"]);
eq("gram range from the model", gramRange({ ...aiRow, grams_low: 150, grams_high: 260 }), { low: 150, high: 260, fromModel: true });
eq("why lines exist", [confidenceWhy(tableRow).length > 10, confidenceWhy(aiRow).includes("check")], [true, true]);

console.log(`check-nutrition: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
