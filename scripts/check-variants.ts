/**
 * `npx tsx scripts/check-variants.ts` — offline checks for the v2.9 "sources" area:
 *   - src/lib/variants.ts: "Which one?" detection (data-driven 12 % kcal rule + the curated
 *     VARIANT_GROUPS order), the async search path, and the same-grams swap.
 *   - src/lib/sourceInfo.ts: the "Where's this from?" labels / links / confidence / per-100 g note.
 *   - src/lib/plateMatch.ts still prices exactly as before (the provenance it adds is metadata only).
 * No DB, no model — hits are hand-built fixtures with the score search_foods would return.
 */
import { sourceBonus, type FoodHit } from "../src/lib/foodSearch";
import { crossValidatePlateItem } from "../src/lib/plateMatch";
import { confidenceLabel, needsCheck, per100Note, reportSourceInfo, sourceInfoFor } from "../src/lib/sourceInfo";
import { findVariants, groupFor, pickVariants, swapToVariant, type FoodVariant } from "../src/lib/variants";
import type { PlateItem } from "../src/lib/types";

let failures = 0;
let total = 0;
function check(ok: boolean, what: string, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${!ok && detail ? `\n        got: ${detail}` : ""}`);
}

function hit(id: string, name: string, source: FoodHit["source"], kcal: number, sim: number, exact = false, macros: [number, number, number] = [8, 45, 5]): FoodHit {
  return {
    id,
    name,
    aliases: [],
    calories: kcal,
    protein_g: macros[0],
    carbs_g: macros[1],
    fat_g: macros[2],
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

// ---- fixtures: what search_foods would hand back ----
const ROTI = hit("roti", "Roti / chapati", "custom", 264, 1, true, [8.5, 46, 5.5]);
const MAIDA = hit("dish-maida-roti", "Maida roti", "dish", 318, 0.9, false, [8.8, 56, 6.4]);
const MISSI = hit("dish-missi-roti", "Missi roti", "dish", 289, 0.9, false, [11, 44, 7.6]);
const TANDOORI = hit("dish-tandoori-roti", "Tandoori roti", "dish", 276, 0.88, false, [9, 50, 4]);
const GHEE_ROTI = hit("dish-ghee-roti", "Ghee roti", "dish", 336, 0.88, false, [7.9, 44, 14]);
const MAKKI = hit("dish-makki-ki-roti", "Makki ki roti", "dish", 290, 0.8);
const RUMALI = hit("dish-rumali-roti", "Rumali roti", "dish", 300, 0.8);
const ATTA = hit("ifct-wheat-flour-atta", "Wheat flour, atta (raw)", "ifct", 320, 0.3);
const ROTI_POOL = [ROTI, MAIDA, MISSI, TANDOORI, GHEE_ROTI, MAKKI, RUMALI, ATTA];

const PANEER = hit("paneer", "Paneer", "custom", 265, 1, true, [18, 1.2, 21]);
const PANEER_IFCT = hit("ifct-paneer", "Paneer", "ifct", 258, 0.95, false, [18.9, 1.2, 20.8]);
const PANEER_POOL = [
  PANEER,
  PANEER_IFCT,
  hit("dish-paneer-tikka", "Paneer tikka", "dish", 240, 0.7),
  hit("dish-paneer-butter-masala", "Paneer butter masala", "dish", 180, 0.62),
  hit("dish-paneer-bhurji", "Paneer bhurji", "dish", 220, 0.7),
  hit("dish-paneer-paratha", "Paneer paratha", "dish", 260, 0.66),
];

const MILK_POOL = [
  hit("milk-full", "Milk (full cream)", "custom", 66, 1, true, [3.2, 4.8, 3.9]),
  hit("milk-toned", "Milk (toned)", "custom", 58, 0.8, false, [3.1, 4.7, 3]),
  hit("milk-double-toned", "Milk (double toned)", "custom", 45, 0.75, false, [3.1, 4.7, 1.5]),
  hit("milk-skimmed", "Milk (skimmed)", "custom", 35, 0.75, false, [3.4, 4.9, 0.1]),
  hit("milk-buffalo", "Milk (buffalo)", "custom", 97, 0.75, false, [3.7, 5.2, 6.9]),
  hit("dish-milk-shake", "Milk shake", "dish", 112, 0.7),
  hit("usda-milk-dry", "Milk, dry, whole powder", "usda", 496, 0.6),
];

const DAL_POOL = [
  hit("dal", "Dal (cooked)", "custom", 116, 1, true, [7, 18, 2]),
  hit("dish-dal-tadka", "Dal tadka", "dish", 138, 0.9, false, [6.5, 16, 5.4]),
  hit("dish-moong-dal", "Moong dal", "dish", 104, 0.88),
  hit("dish-dal-makhani", "Dal makhani", "dish", 170, 0.88),
  hit("ifct-toor-dal-raw", "Red gram, dal (toor dal) (raw)", "ifct", 343, 0.7),
];

// ---- 1. data-driven variant detection ----
console.log("Variant detection (pickVariants)");
{
  const v = pickVariants({ query: "roti", name: ROTI.name, chosenId: ROTI.id, chosenKcal: 264, pool: ROTI_POOL });
  const names = v.map((x) => x.name);
  const wheat = v.find((x) => x.food_id === "roti");
  const maida = v.find((x) => x.food_id === "dish-maida-roti");
  check(!!wheat && !!maida && wheat.kcal_per_100g !== maida.kcal_per_100g, `"roti" gives wheat and maida variants with different kcal`, names.join(", "));
  check(names[0] === "Roti / chapati" && names[1] === "Maida roti" && names[2] === "Missi roti" && names[3] === "Tandoori roti" && names[4] === "Ghee roti", "roti variants follow the curated order (wheat, maida, missi, tandoori, ghee)", names.join(", "));
  check(!names.includes("Makki ki roti") && !names.includes("Rumali roti") && !names.some((n) => /raw/i.test(n)), "roti variants skip other grains and raw flour", names.join(", "));
  check(wheat?.label === "Wheat (atta) roti" && maida?.label === "Maida roti", "curated chips carry short labels", `${wheat?.label} / ${maida?.label}`);
}
{
  const v = pickVariants({ query: "paneer", name: "Paneer", chosenId: PANEER.id, chosenKcal: 265, pool: PANEER_POOL });
  check(v.length === 0, `"paneer" gives no variants (the only close rows are within 12 %, the rest are dishes)`, v.map((x) => x.name).join(", "));
}
{
  const v = pickVariants({ query: "doodh", name: "Milk (full cream)", chosenId: "milk-full", chosenKcal: 66, pool: MILK_POOL });
  const ids = v.map((x) => x.food_id);
  check(ids.join(",") === "milk-full,milk-toned,milk-double-toned,milk-skimmed,milk-buffalo", `"doodh" gives the five milks in order (full cream first)`, ids.join(","));
  check(!ids.includes("dish-milk-shake") && !ids.includes("usda-milk-dry"), "milk variants skip milk shake and milk powder", ids.join(","));
}
{
  const v = pickVariants({ query: "dal", name: "Dal (cooked)", chosenId: "dal", chosenKcal: 116, pool: DAL_POOL });
  const ids = v.map((x) => x.food_id);
  check(v.length >= 3 && ids.includes("dish-dal-makhani") && !ids.includes("ifct-toor-dal-raw"), `"dal" offers dal kinds but never the raw 343 kcal toor dal`, ids.join(","));
  check(ids.indexOf("dish-moong-dal") < ids.indexOf("dish-dal-tadka") && ids.indexOf("dish-dal-tadka") < ids.indexOf("dish-dal-makhani"), "dal kinds follow the curated order (moong, tadka, makhani)", ids.join(","));
}
{
  const pool = [MISSI, hit("dish-missi-roti-2", "Missi roti (besan)", "dish", 295, 0.85)];
  const v = pickVariants({ query: "missi roti", name: "Missi roti", chosenId: MISSI.id, chosenKcal: 289, pool });
  check(v.length === 0, `"missi roti" is specific — no chips`, v.map((x) => x.name).join(", "));
}
{
  const pool = [hit("dish-chicken-curry", "Chicken curry", "dish", 150, 1, true), hit("dish-chicken-curry-rest", "Chicken curry, restaurant style", "dish", 210, 0.72), hit("dish-chicken-curry-light", "Chicken curry light", "dish", 158, 0.8)];
  const v = pickVariants({ query: "chicken curry", name: "Chicken curry", chosenId: "dish-chicken-curry", chosenKcal: 150, pool });
  const ids = v.map((x) => x.food_id);
  check(ids.join(",") === "dish-chicken-curry,dish-chicken-curry-rest", "outside the staples it's purely data-driven: only rows > 12 % apart become chips", ids.join(","));
}
{
  const soup = hit("dish-cold-cucumber-cream-soup", "Cold cucumber cream soup", "dish", 95, 0.55);
  const v = pickVariants({ query: "cucumber", name: "Cucumber", chosenId: "ifct-cucumber", chosenKcal: 13, pool: [hit("ifct-cucumber", "Cucumber", "ifct", 13, 0.95, true), soup] });
  check(v.length === 0, "isAcceptableMatch still guards it: cucumber never offers the cream soup", v.map((x) => x.name).join(", "));
}
{
  const v = pickVariants({ query: "roti", name: "roti", chosenId: null, chosenKcal: 250, pool: ROTI_POOL });
  check(v.length >= 2 && v[0].food_id === "roti", "an AI-estimated roti (no row) still gets the roti chips", v.map((x) => x.food_id).join(","));
}

console.log("\nCurated group lookup (groupFor)");
for (const [text, want] of [
  ["roti", "roti"],
  ["do roti", "roti"],
  ["Roti / chapati", "roti"],
  ["phulka", "roti"],
  ["chawal", "rice"],
  ["Rice, cooked", "rice"],
  ["doodh", "milk"],
  ["Milk (full cream)", "milk"],
  ["sabzi", "sabzi"],
  ["paratha", "paratha"],
  ["missi roti", null],
  ["paneer", null],
  ["dal makhani", null],
  ["aloo paratha", null],
] as const) {
  const g = groupFor(text)?.key ?? null;
  check(g === want, `groupFor("${text}") → ${want ?? "none"}`, String(g));
}

// ---- 2. the async path (search injected) ----
async function asyncCases() {
  console.log("\nfindVariants (search injected)");
  const asked: string[] = [];
  const search = async (q: string) => {
    asked.push(q);
    if (q === "roti") return [ROTI, MAIDA, MAKKI, RUMALI, ATTA];
    if (q === "missi roti") return [MISSI];
    if (q === "tandoori roti") return [TANDOORI];
    if (q === "ghee roti") return [GHEE_ROTI];
    if (q === "paneer") return PANEER_POOL;
    return [];
  };
  const v = await findVariants({ query: "roti", name: "Roti / chapati", chosenId: "roti", chosenKcal: 264, search });
  check(v.map((x) => x.food_id).join(",") === "roti,dish-maida-roti,dish-missi-roti,dish-tandoori-roti,dish-ghee-roti", "roti: one wide search + narrow searches only for the kinds it missed", v.map((x) => x.food_id).join(","));
  check(!asked.includes("maida roti") && asked.includes("missi roti"), "no narrow search for a kind the wide search already found", asked.join(" | "));
  const p = await findVariants({ query: "paneer", name: "Paneer", chosenId: "paneer", chosenKcal: 265, search });
  check(p.length === 0, "paneer: no variants through the async path either", p.map((x) => x.name).join(", "));
  const broken = await findVariants({ query: "roti", name: "Roti", chosenId: "roti", chosenKcal: 264, search: async () => Promise.reject(new Error("db down")) });
  check(broken.length === 0, "a failing search never throws — just no chips");

  // plateMatch still prices exactly as before; provenance rides along as metadata.
  console.log("\nplateMatch keeps its numbers (v2.9 only adds source_info)");
  const item: PlateItem = { name: "roti", grams: 80, confidence: "medium", calories: 200, protein_g: 5, carbs_g: 30, fat_g: 4, micros: {}, source: "estimated", food_id: null };
  const out = await crossValidatePlateItem(item, { search: async () => [ROTI], live: async () => null });
  check(out.calories === 211 && out.food_id === "roti" && out.source === "table", "a table match re-prices from the row at the model's grams (264 × 0.8 = 211)", `${out.calories} ${out.food_id} ${out.source}`);
  check(out.source_info?.kind === "custom", "…and says where it came from", String(out.source_info?.kind));
  const ai = await crossValidatePlateItem({ ...item, name: "mystery curry" }, { search: async () => [], live: async () => hit("ai-mystery-curry", "mystery curry", "ai", 150, 1, true) });
  check(ai.food_id === null && ai.source === "estimated" && ai.source_info?.kind === "ai", "a live AI lookup stays an estimate, labelled 'AI estimate'", `${ai.food_id} ${ai.source} ${ai.source_info?.kind}`);
}

// ---- 3. the swap ----
console.log("\nSwap to a variant (same grams)");
{
  const roti80 = { name: "Roti / chapati", food_id: "roti", grams: 80, calories: 211, protein_g: 6.8, carbs_g: 36.8, fat_g: 4.4, source: "table", micros: {}, cooked_in: null };
  const maida: FoodVariant = { food_id: "dish-maida-roti", name: "Maida roti", kcal_per_100g: 318, protein_per_100g: 8.8, carbs_per_100g: 56, fat_per_100g: 6.4, source: "dish" };
  const s = swapToVariant(roti80, maida);
  check(s.grams === 80 && s.calories === 254 && s.protein_g === 7 && s.fat_g === 5.1 && s.food_id === "dish-maida-roti" && s.name === "Maida roti", "80 g roti → maida roti re-priced at 80 g (318 × 0.8 = 254 kcal)", JSON.stringify(s));
}

// ---- 4. "Where's this from?" ----
console.log("\nSource info");
{
  const usda = sourceInfoFor({ name: "Oats", food_id: "usda-oats", source: "usda", item_source: "table", source_ref: "173904" });
  check(usda.label === "USDA FoodData Central" && usda.links[0]?.url === "https://fdc.nal.usda.gov/food-details/173904", "USDA with a stored fdc id links to its FDC page", JSON.stringify(usda.links));
  const usdaNoRef = sourceInfoFor({ name: "Oats", food_id: "usda-oats", source: "usda", item_source: "table" });
  check(usdaNoRef.links[0]?.url.startsWith("https://fdc.nal.usda.gov/food-search?query=Oats") ?? false, "USDA without an fdc id (schema_v32 not applied) falls back to an FDC search", JSON.stringify(usdaNoRef.links));
  const off = sourceInfoFor({ name: "Muesli", food_id: "off-8901234567890", source: "off", item_source: "table" });
  check(off.links[0]?.url === "https://world.openfoodfacts.org/product/8901234567890", "Open Food Facts links the product page by barcode", JSON.stringify(off.links));
  const ifct = sourceInfoFor({ name: "Paneer", food_id: "ifct-paneer", source: "ifct", item_source: "table", source_ref: "L012" });
  check(ifct.label === "IFCT 2017 (ICMR-NIN)" && ifct.links.length === 1 && ifct.detail.includes("L012"), "IFCT links the NIN reference and shows its code", JSON.stringify(ifct));
  const dish = sourceInfoFor({ name: "Dal tadka", food_id: "dish-dal-tadka", source: "dish", item_source: "table" });
  check(dish.label === "Locked In dish recipe" && dish.links.length === 1, "dish rows are the Locked In dish recipe (INDB link)", dish.label);
  const est = sourceInfoFor({ name: "Grandma's curry", food_id: null, item_source: "estimated" });
  check(est.label === "AI estimate" && est.links.length === 0, "no row → AI estimate, label only", est.label);
  const scan = sourceInfoFor({ name: "Bar", food_id: null, item_source: "scan", barcode: "8901234567890" });
  check(scan.kind === "off" && scan.links.length === 1, "a barcode scan on the plate links its OFF page", JSON.stringify(scan));
  const label = reportSourceInfo({ nutrition_source: "label" }, [{ label: "FSSAI recall", url: "https://example.org/recall" }]);
  check(label.label === "Nutrition label" && label.links.length === 1, "a label scan keeps the web-search citations it captured", JSON.stringify(label));
  check(per100Note({ grams: 100, calories: 297, protein_g: 9.8, carbs_g: 46, fat_g: 7.5 }) === "Numbers per 100 g: 297 kcal · P 9.8 · C 46 · F 7.5", "per-100 g note reads like the spec");
  check(per100Note({ grams: 40, calories: 106, protein_g: 3.4, carbs_g: 18.4, fat_g: 2.2 }) === "Numbers per 100 g: 265 kcal · P 8.5 · C 46 · F 5.5", "per-100 g note scales from the item's grams");
  check(confidenceLabel(0.9) === "High" && confidenceLabel(0.6) === "Medium" && confidenceLabel(0.3) === "Low" && confidenceLabel("low") === "Low", "confidence reads High / Medium / Low");
  check(needsCheck({ confidence: 0.3 }) && needsCheck({ confidence: 0.9, variants: [{} as FoodVariant, {} as FoodVariant] }) && !needsCheck({ confidence: 0.9 }), "ⓘ reads 'Check' for low confidence or variants only");
}

asyncCases().then(() => {
  console.log(`\n${total - failures}/${total} passed.`);
  if (failures) process.exit(1);
});
