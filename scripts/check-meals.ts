/**
 * `npx tsx scripts/check-meals.ts` — offline checks for v2.8 meals:
 *  - the hour → meal_type rule (src/lib/mealType.ts; schema_v30.sql and Android's MealTypes.kt use the same table),
 *  - the meal editor's grams rescale (rescaleItem),
 *  - B2: single-piece counting (unitFor, a port of Android's Counting.unitFor) and what one tap adds,
 *  - B4: restaurant portions stored by grams, and how rows read.
 */
import { groupMeals, mealTypeForHour, mealTypeOf, type MealType } from "../src/lib/mealType";
import { applyRestaurant, itemQtyLabel, oneTap, priceItem, rescaleItem, toGrams, unitFor, type QuantityFood } from "../src/lib/quantity";
import type { Meal, MealItem } from "../src/lib/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, eps = 0.051) => Math.abs(a - b) <= eps;

// ---- hour rule: 04–10:59 breakfast, 11–15:59 lunch, 16–18:59 snack, 19–03:59 dinner ----
const hours: [number, MealType][] = [
  [0, "dinner"], [3, "dinner"], [4, "breakfast"], [7, "breakfast"], [10, "breakfast"], [11, "lunch"], [13, "lunch"], [15, "lunch"],
  [16, "snack"], [18, "snack"], [19, "dinner"], [21, "dinner"], [23, "dinner"], [24, "dinner"], [-1, "dinner"],
];
for (const [h, want] of hours) check(`hour ${h}`, mealTypeForHour(h) === want, `got ${mealTypeForHour(h)}, want ${want}`);

// created_at is UTC in Postgres; the rule reads India time (UTC+5:30).
const at = (iso: string, meal_type: string | null = null) => ({ created_at: iso, meal_type });
check("02:00Z = 07:30 IST → breakfast", mealTypeOf(at("2026-09-24T02:00:00+00:00")) === "breakfast");
check("05:29Z = 10:59 IST → breakfast", mealTypeOf(at("2026-09-24 05:29:59+00")) === "breakfast");
check("05:30Z = 11:00 IST → lunch", mealTypeOf(at("2026-09-24 05:30:00+00")) === "lunch");
check("11:00Z = 16:30 IST → snack", mealTypeOf(at("2026-09-24T11:00:00Z")) === "snack");
check("13:30Z = 19:00 IST → dinner", mealTypeOf(at("2026-09-24T13:30:00Z")) === "dinner");
check("22:00Z = 03:30 IST → dinner", mealTypeOf(at("2026-09-24T22:00:00Z")) === "dinner");
check("22:30Z = 04:00 IST → breakfast", mealTypeOf(at("2026-09-24T22:30:00Z")) === "breakfast");
check("stored type wins over the hour", mealTypeOf(at("2026-09-24T02:00:00Z", "dinner")) === "dinner");
check("junk type falls back to the hour", mealTypeOf(at("2026-09-24T02:00:00Z", "brunch")) === "breakfast");

// groupMeals: always four sections, Home's order, per-section totals.
const item = (name: string, grams: number, kcal: number, protein: number, extra: Partial<MealItem> = {}): MealItem => ({ food_id: null, name, grams, calories: kcal, protein_g: protein, carbs_g: 0, fat_g: 0, source: "table", confidence: 1, ...extra });
const meal = (id: string, created_at: string, items: MealItem[], meal_type: Meal["meal_type"] = null): Meal => ({ id, date: "2026-09-24", raw_text: "", created_at, items, meal_type });
const g = groupMeals([
  meal("a", "2026-09-24T02:00:00Z", [item("Poha", 150, 250, 5)]),
  meal("b", "2026-09-24T07:00:00Z", [item("Roti", 80, 240, 8), item("Dal", 150, 180, 9.5)]),
  meal("c", "2026-09-24T02:30:00Z", [item("Whey", 30, 120, 24)], "snack"),
]);
check("four sections in order", g.map((s) => s.type).join(",") === "breakfast,lunch,dinner,snack", g.map((s) => s.type).join(","));
check("breakfast totals", g[0].kcal === 250 && g[0].protein === 5);
check("lunch totals", g[1].kcal === 420 && g[1].protein === 17.5, `${g[1].kcal} ${g[1].protein}`);
check("empty dinner", g[2].meals.length === 0 && g[2].kcal === 0);
check("typed snack", g[3].meals.length === 1 && g[3].meals[0].id === "c");

// ---- the editor's rescale: per-gram values, micros included ----
const dal = item("Dal tadka", 150, 180, 9, { carbs_g: 24, fat_g: 6, micros: { fiber_g: 6, iron_mg: 2.4 } });
const half = rescaleItem(dal, 75);
check("rescale kcal", half.calories === 90, String(half.calories));
check("rescale macros", half.protein_g === 4.5 && half.carbs_g === 12 && half.fat_g === 3);
check("rescale micros", half.micros?.fiber_g === 3 && half.micros?.iron_mg === 1.2);
const roti = item("Roti", 80, 240, 8, { unit: "serving", servings: 2 });
const three = rescaleItem(roti, 120, 3);
check("rescale counted row", three.calories === 360 && three.servings === 3 && three.grams === 120);
check("rescale keeps servings in step", rescaleItem(roti, 40).servings === 1);
check("rescale zero-gram item", rescaleItem(item("x", 0, 0, 0), 50).grams === 50);

// ---- B2: count single pieces like Android ----
const food = (servings: { label: string; grams: number }[], def: string | null, per100 = 500): QuantityFood => ({ name: "x", food_id: "f", per100: { calories: per100, protein_g: 10, carbs_g: 10, fat_g: 10 }, servings, defaultServing: def, source: "table" });
const cases: { s: { label: string; grams: number }[]; def: string | null; noun: string | null; grams?: number; step?: number; dc?: number; label?: string | null }[] = [
  { s: [{ label: "2 tbsp", grams: 30 }], def: "2 tbsp", noun: "tbsp", grams: 15, step: 0.5, dc: 1 },
  { s: [{ label: "10 almonds", grams: 12 }], def: "10 almonds", noun: "almond", grams: 1.2, step: 1, dc: 10 },
  { s: [{ label: "2 roti", grams: 80 }, { label: "1 roti", grams: 40 }], def: "2 roti", noun: "roti", grams: 40, step: 1, dc: 1 },
  { s: [{ label: "2 idli", grams: 80 }], def: "2 idli", noun: "idli", grams: 40, step: 1, dc: 1 },
  { s: [{ label: "1 katori", grams: 150 }], def: "1 katori", noun: "katori", grams: 150, step: 0.5, dc: 1 },
  { s: [{ label: "1 katori (2 pcs)", grams: 120 }], def: "1 katori (2 pcs)", noun: "katori", grams: 120, step: 0.5, dc: 1 },
  { s: [{ label: "2 slices", grams: 60 }], def: "2 slices", noun: "slice", grams: 30, step: 1, dc: 1 },
  { s: [{ label: "6 momos", grams: 150 }], def: "6 momos", noun: "momo", grams: 25, step: 1, dc: 6 },
  { s: [{ label: "1 scoop", grams: 30 }], def: null, noun: "scoop", grams: 30, step: 1, dc: 1 },
  { s: [{ label: "100 g", grams: 100 }], def: "100 g", noun: null },
  { s: [{ label: "200 g pack", grams: 200 }], def: null, noun: null },
  { s: [], def: null, noun: null },
  { s: [{ label: "5-6 pieces", grams: 90 }], def: "5-6 pieces", noun: "5-6 pieces", grams: 90, step: 0.5, dc: 1, label: "5-6 pieces" },
];
for (const c of cases) {
  const cu = unitFor(c.s, c.def);
  const name = `unitFor ${c.s.map((x) => x.label).join("/") || "(none)"}`;
  if (c.noun === null) {
    check(name, cu === null, JSON.stringify(cu));
    continue;
  }
  check(name, !!cu && cu.noun === c.noun && near(cu.grams, c.grams!) && cu.step === c.step && cu.defaultCount === c.dc && (c.label === undefined || cu.label === c.label), JSON.stringify(cu));
}

// One tap: what the web adds straight away equals what Android's sheet opens at (unit grams × default count).
const tap = (s: { label: string; grams: number }[], def: string | null) => {
  const t = oneTap(food(s, def));
  return toGrams(t.food, t.q);
};
check("one tap 2 tbsp → 15 g", near(tap([{ label: "2 tbsp", grams: 30 }], "2 tbsp"), 15));
check("one tap 10 almonds → 12 g", near(tap([{ label: "10 almonds", grams: 12 }], "10 almonds"), 12));
check("one tap 2 roti → 40 g", near(tap([{ label: "2 roti", grams: 80 }], "2 roti"), 40));
check("one tap 1 katori → 150 g", near(tap([{ label: "1 katori", grams: 150 }], "1 katori"), 150));
check("one tap loose → 100 g", near(tap([], null), 100));
const tbsp = oneTap(food([{ label: "2 tbsp", grams: 30 }], "2 tbsp"));
const tbspItem = priceItem(tbsp.food, tbsp.q);
check("tbsp row stored as 1 serving", tbspItem.unit === "serving" && tbspItem.servings === 1 && tbspItem.grams === 15 && tbspItem.calories === 75, JSON.stringify(tbspItem));
check("tbsp row reads 1 tbsp", itemQtyLabel(tbspItem, tbsp.label) === "1 tbsp", itemQtyLabel(tbspItem, tbsp.label));
const almonds = oneTap(food([{ label: "10 almonds", grams: 12 }], "10 almonds"));
check("almond row reads 10 almonds", itemQtyLabel(priceItem(almonds.food, almonds.q), almonds.label) === "10 almonds");

// ---- B4: restaurant portions by grams ----
const rotiTap = oneTap({ ...food([{ label: "1 katori", grams: 150 }], "1 katori", 120), name: "Dal makhani", category: "restaurant" });
const rest = applyRestaurant(priceItem(rotiTap.food, rotiTap.q), true);
check("restaurant stored by grams", rest.unit === "g" && rest.servings === null && rest.grams === 210, JSON.stringify({ unit: rest.unit, servings: rest.servings, grams: rest.grams }));
check("restaurant reads in grams", itemQtyLabel(rest) === "210 g", itemQtyLabel(rest));
check("old 1.4-serving restaurant row reads in grams", itemQtyLabel(item("Paneer (restaurant)", 196, 500, 20, { unit: "serving", servings: 1.4, cooked_in: "restaurant" })) === "196 g");
check("saved roti row reads 2 roti", itemQtyLabel(item("Roti", 80, 240, 8, { unit: "serving", servings: 2 })) === "2 roti");
check("saved katori row reads 1½ serving", itemQtyLabel(item("Dal tadka", 225, 270, 13, { unit: "serving", servings: 1.5 })) === "1½ servings", itemQtyLabel(item("Dal tadka", 225, 270, 13, { unit: "serving", servings: 1.5 })));
check("gram row reads grams", itemQtyLabel(item("Paneer", 180, 480, 32, { unit: "g", servings: 0.9 })) === "180 g");
check("odd count reads grams", itemQtyLabel(item("Roti", 55, 160, 5, { unit: "serving", servings: 1.37 })) === "55 g");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
