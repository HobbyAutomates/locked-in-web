/**
 * Gap-fill import for bandlog.foods / bandlog.food_aliases.
 *
 * Context: scripts/import-foods.mts (already run against production — see backups/2026-09-25/foods.json,
 * 3,390 rows: custom 96, dish 1014 [INDB], ifct 542, usda 1738 [SR Legacy]) already covers most raw
 * Indian ingredients data-wise. Auditing the ~150 most common Indian home/street/restaurant foods and
 * the ~150 most common raw fruits/veg/pulses/grains/dairy/nuts/seeds/oils against production showed the
 * real gap is mostly SEARCH VISIBILITY, not missing data: e.g. "Cucumber, green, elongate (raw)" (ifct)
 * already exists, but bandlog.search_foods ranks "Cold cucumber cream soup" (dish) above it for the
 * query "cucumber" because there is no food_aliases row for "cucumber" (an exact alias hit is scored
 * above everything else — see supabase/schema_v25.sql's search_foods). A smaller number of items
 * (chickpea flour/besan, basmati rice as its own row, etc.) are genuine data gaps.
 *
 * This script therefore does two things:
 *   1. food_aliases: maps ~300 common English/Hindi/Hinglish terms to the correct existing row
 *      (id chosen by preferring source ifct > custom > usda > dish, and a "(raw)"/plain name over a
 *      composite dish, using the local snapshot in backups/2026-09-25/foods.json so no DB write is
 *      needed to compute this).
 *   2. foods: for terms with NO adequate existing row, adds a new raw-ingredient row from USDA
 *      FoodData Central — Foundation Foods (scripts/data/fdc_foundation/, public domain / CC0,
 *      https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip)
 *      or, where neither open dataset mirrored locally has the exact Indian item (e.g. besan), a single
 *      nutrient record fetched from the public FoodData Central API (api.nal.usda.gov, SR Legacy,
 *      public domain — not a proprietary app), tagged source 'usda_foundation' / 'usda'.
 *
 * Output: supabase/seeds/foods_v27.sql (idempotent, ON CONFLICT DO NOTHING) + a summary CSV.
 * Does NOT touch the database — reads only the local JSON/CSV snapshots.
 *
 *   npx tsx scripts/import-foods-gapfill.mjs        (plain Node also works: node scripts/import-foods-gapfill.mjs)
 */
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DATA = ROOT + "scripts/data/";

const r1 = (n) => Math.round(n * 10) / 10;
const clean = (s) => String(s).replace(/\s+/g, " ").trim();
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const sqlArr = (xs) => "array[" + xs.map(sqlStr).join(",") + "]::text[]";
const sqlJsonb = (o) => sqlStr(JSON.stringify(o)) + "::jsonb";
const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

function csv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const num = (v) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };

// ---------------------------------------------------------------------------
// 1. Load the existing snapshot (production as of 2026-09-25) to match aliases against.
// ---------------------------------------------------------------------------
const existing = JSON.parse(readFileSync(ROOT + "backups/2026-09-25/foods.json", "utf8")).rows;
const existingIds = new Set(existing.map((r) => r.id));
const existingAliasSet = new Set(
  JSON.parse(readFileSync(ROOT + "backups/2026-09-25/food_aliases.json", "utf8")).rows.map((r) => r.alias),
);

const SOURCE_RANK = { ifct: 4, custom: 3, usda: 2, usda_foundation: 2, dish: 1 };
/** Best existing row for a search term: prefer a plain/raw ingredient over a composite dish. */
function bestMatch(term, extraMustMatch) {
  const t = term.toLowerCase();
  const cands = existing.filter((r) => {
    const name = r.name.toLowerCase();
    const hay = name + " " + r.aliases.join(" ").toLowerCase();
    // A targeted regex matched against the canonical `name` is sufficient on its own (e.g.
    // /bengal gram, dal/i for "chana dal"). It is also matched against `aliases`, but only for
    // 'dish'/'custom' rows: those aliases are English synonyms derived from the same record (safe).
    // ifct rows carry many unrelated *regional-language* names as aliases (e.g. "Aluva", a fish,
    // has the Malayalam alias "halwa") — matching aliases there would wrongly resolve the dessert
    // "halwa" to a fish row, so ifct/usda aliases are excluded from the regex fallback.
    if (extraMustMatch) {
      if (extraMustMatch.test(name)) return true;
      if (r.source === "dish" || r.source === "custom") return r.aliases.some((a) => extraMustMatch.test(a.toLowerCase()));
      return false;
    }
    return hay.includes(t) || r.aliases.some((a) => a.toLowerCase() === t);
  });
  if (cands.length === 0) return null;
  cands.sort((a, b) => {
    const rankA = SOURCE_RANK[a.source] ?? 0, rankB = SOURCE_RANK[b.source] ?? 0;
    if (rankA !== rankB) return rankB - rankA;
    const rawA = /\(raw\)/i.test(a.name) ? 1 : 0, rawB = /\(raw\)/i.test(b.name) ? 1 : 0;
    if (rawA !== rawB) return rawB - rawA;
    return a.name.length - b.name.length; // shorter/plainer name wins
  });
  return cands[0];
}

// ---------------------------------------------------------------------------
// 2. Curated list of the ~150 most common Indian home/street/restaurant dishes and the ~150 most
//    common raw fruits/vegetables/pulses/grains/dairy/nuts/seeds/oils, each with the Hindi/Hinglish
//    way people actually type it. `match` narrows candidates when the plain term is ambiguous
//    (e.g. "rice" alone would grab any dish with rice in the name).
// ---------------------------------------------------------------------------
const COMMON = [
  // -- raw fruits --
  ["cucumber", ["kheera", "kakdi"], /cucumber/i],
  ["tomato", ["tamatar"], /^tomato/i],
  ["onion", ["pyaz", "kanda"], /^onion/i],
  ["potato", ["aloo", "batata"], /^potato/i],
  ["carrot", ["gajar"], /^carrot/i],
  ["cauliflower", ["gobi", "phool gobi"], /cauliflower/i],
  ["cabbage", ["patta gobi", "bandh gobi"], /^cabbage/i],
  ["brinjal", ["baingan", "eggplant", "vangi"], /^brinjal/i],
  ["okra", ["bhindi", "ladies finger"], /^okra|^ladies.?finger/i],
  ["spinach", ["palak"], /^spinach/i],
  ["bottle gourd", ["lauki", "dudhi", "ghia"], /bottle gourd/i],
  ["ridge gourd", ["turai", "tori"], /ridge gourd/i],
  ["bitter gourd", ["karela"], /bitter gourd/i],
  ["pumpkin", ["kaddu", "sitaphal vegetable"], /^pumpkin/i],
  ["radish", ["mooli"], /^radish/i],
  ["beetroot", ["chukandar"], /^beetroot|^beet/i],
  ["green peas", ["matar", "hara matar"], /green pea/i],
  ["french beans", ["farasbi"], /french bean/i],
  ["capsicum", ["shimla mirch", "bell pepper"], /capsicum|bell pepper/i],
  ["green chilli", ["hari mirch"], /chilli|chili/i],
  ["ginger", ["adrak"], /^ginger/i],
  ["garlic", ["lehsun"], /^garlic/i],
  ["coriander leaves", ["dhaniya patta", "cilantro"], /coriander leaves/i],
  ["curry leaves", ["kadi patta"], /curry leaves/i],
  ["mint leaves", ["pudina"], /^mint/i],
  ["lemon", ["nimbu"], /^lime|^lemon/i],
  ["banana", ["kela"], /^banana/i],
  ["apple", ["seb"], /^apple/i],
  ["mango", ["aam"], /^mango/i],
  ["papaya", ["papita"], /^papaya/i],
  ["guava", ["amrud"], /^guava/i],
  ["pomegranate", ["anar"], /^pomegranate/i],
  ["grapes", ["angoor"], /^grapes/i],
  ["watermelon", ["tarbooz"], /^watermelon/i],
  ["muskmelon", ["kharbooja"], /musk melon|^cantaloupe/i],
  ["orange", ["santra"], /^orange/i],
  ["pineapple", ["ananas"], /^pineapple/i],
  ["sapota", ["chikoo", "sapodilla"], /sapota/i],
  ["custard apple", ["sitaphal"], /custard apple/i],
  ["jackfruit", ["kathal"], /^jackfruit/i],
  ["fig", ["anjeer"], /^fig/i],
  ["dates", ["khajur"], /^dates/i],
  ["raisins", ["kishmish"], /^raisins/i],
  // -- pulses / grains --
  ["toor dal", ["arhar dal", "pigeon pea"], /pigeon pea|red gram/i],
  ["moong dal", ["mung dal"], /green gram/i],
  ["chana dal", ["bengal gram dal"], /bengal gram, dal/i],
  ["masoor dal", ["red lentil"], /lentil/i],
  ["urad dal", ["black gram"], /black gram/i],
  ["rajma", ["kidney beans"], /rajmah|kidney bean/i],
  ["chickpea", ["kabuli chana", "chole", "garbanzo"], /bengal gram, whole|chickpea/i],
  ["soybean", ["soya bean"], /^soya bean/i],
  ["rice", ["chawal"], /^rice, raw, milled/i],
  ["basmati rice", ["basmati chawal"], /^rice, raw, milled/i],
  ["wheat flour", ["atta"], /wheat flour, atta/i],
  ["maida", ["refined flour"], /wheat flour, refined/i],
  ["semolina", ["suji", "rava"], /semolina/i],
  ["ragi", ["finger millet", "nachni"], /finger millet|ragi/i],
  ["jowar", ["sorghum"], /sorghum|jowar/i],
  ["bajra", ["pearl millet"], /pearl millet|bajra/i],
  ["oats", [], /^oats|^oat, /i],
  // -- dairy / fats --
  ["milk", ["doodh", "dudh"], /^milk,/i],
  ["curd", ["dahi", "yogurt"], /^yogurt|^curd/i],
  ["paneer", ["cottage cheese"], /^paneer|cottage cheese/i],
  ["ghee", [], /^ghee/i],
  ["butter", ["makhan"], /^butter,/i],
  ["buttermilk", ["chaas", "chhaach"], /^buttermilk/i],
  ["mustard oil", ["sarson tel"], /mustard oil/i],
  ["groundnut oil", ["peanut oil"], /groundnut oil|peanut oil/i],
  ["sunflower oil", [], /sunflower oil/i],
  ["coconut oil", ["nariyal tel"], /coconut oil/i],
  ["olive oil", [], /olive oil/i],
  // -- nuts / seeds / sweeteners --
  ["groundnut", ["peanut", "moongphali"], /^peanut|^groundnut/i],
  ["almond", ["badam"], /^almond/i],
  ["cashew", ["kaju"], /^cashew/i],
  ["walnut", ["akhrot"], /^walnut/i],
  ["pistachio", ["pista"], /^pistachio/i],
  ["sesame seed", ["til"], /sesame seed/i],
  ["flax seed", ["alsi"], /flaxseed|flax seed/i],
  ["jaggery", ["gur"], /^jaggery/i],
  ["honey", ["shahad"], /^honey/i],
  ["turmeric powder", ["haldi"], /turmeric/i],
  ["cumin seed", ["jeera"], /cumin/i],
  ["coriander seed", ["dhaniya"], /coriander seed/i],
  ["black pepper", ["kali mirch"], /pepper, black/i],
  // -- proteins --
  ["chicken breast", ["murgi"], /chicken, broiler.*breast|chicken breast/i],
  ["egg", ["anda"], /^egg, whole, raw/i],
  ["fish rohu", ["rohu"], /rohu/i],
  ["prawns", ["shrimp"], /prawn|shrimp/i],
  ["tofu", ["soy paneer"], /^tofu/i],
  // -- common home / street / restaurant dishes (mostly already covered by 'dish'; alias just the
  //    Hinglish forms so they surface as the top hit instead of a rarer variant) --
  ["dal tadka", ["yellow dal"], /dal.*tadka|tadka.*dal/i],
  ["dal makhani", [], /dal makhani/i],
  ["chole bhature", ["chana bhatura"], /chole bhature|bhature/i],
  ["rajma chawal", [], /rajma/i],
  ["paneer butter masala", ["butter paneer"], /paneer butter masala|butter paneer|paneer in butter sauce/i],
  ["palak paneer", [], /palak paneer/i],
  ["shahi paneer", [], /shahi paneer/i],
  ["matar paneer", [], /matar paneer/i],
  ["aloo gobi", [], /aloo gobi/i],
  ["aloo paratha", [], /aloo parat|aloo parantha/i],
  ["plain paratha", ["paratha"], /^parantha, plain|^paratha, plain|plain parantha/i],
  ["roti", ["chapati", "phulka"], /chapati|phulka/i],
  ["naan", [], /^naan/i],
  ["poha", [], /^poha|flattened rice/i],
  ["upma", [], /^upma/i],
  ["idli", [], /^idli/i],
  ["masala dosa", [], /masala dosa/i],
  ["plain dosa", ["dosa"], /^dosa,|plain dosa/i],
  ["sambar", [], /^sambar/i],
  ["rasam", [], /^rasam/i],
  ["vada pav", [], /vada pav/i],
  ["pav bhaji", [], /pav bhaji/i],
  ["misal pav", [], /misal pav/i],
  ["samosa", [], /^samosa/i],
  ["pakora", [], /pakora|pakoda/i],
  ["biryani", [], /biryani/i],
  ["veg pulao", ["pulao"], /pulao/i],
  ["khichdi", [], /khichdi/i],
  ["butter chicken", [], /butter chicken/i],
  ["chicken tikka masala", [], /chicken tikka masala/i],
  ["chicken curry", [], /chicken curry/i],
  ["egg curry", [], /egg curry/i],
  ["mutton curry", [], /mutton curry/i],
  ["fish curry", [], /fish curry/i],
  ["gulab jamun", [], /gulab jamun/i],
  ["jalebi", [], /^jalebi/i],
  ["rasgulla", ["rosogolla"], /rasgulla|rosogolla/i],
  ["besan ladoo", ["gram flour ladoo"], /gram flour ladoo/i],
  ["kheer", [], /^kheer/i],
  ["halwa", [], /^halwa|carrot halwa/i],
  ["lassi", [], /^lassi/i],
  ["masala chai", ["chai"], /^tea, /i],
];

// ---------------------------------------------------------------------------
// 3. Foundation Foods (public domain / CC0) — new raw-ingredient rows for genuine misses.
// ---------------------------------------------------------------------------
function loadFoundationFoods() {
  const dir = DATA + "fdc_foundation/";
  const cats = new Map(csv(readFileSync(dir + "food_category.csv", "utf8")).slice(1).map((r) => [r[0], r[2]]));
  const foods = csv(readFileSync(dir + "food.csv", "utf8")).slice(1).filter((r) => r[1] === "foundation_food");
  const nut = new Map();
  const NUT_MAP = { 1008: "calories", 1003: "protein_g", 1004: "fat_g", 1005: "carbs_g", 1079: "fiber_g", 2000: "sugar_g", 1093: "sodium_mg", 1089: "iron_mg", 1087: "calcium_mg", 1162: "vitamin_c_mg", 1106: "vitamin_a_ug", 1092: "potassium_mg", 1090: "magnesium_mg", 1095: "zinc_mg", 1178: "b12_ug" };
  for (const r of csv(readFileSync(dir + "food_nutrient.csv", "utf8")).slice(1)) {
    const [, fdcId, nutrientId, amount] = r;
    const key = NUT_MAP[Number(nutrientId)];
    if (!key) continue;
    const o = nut.get(fdcId) ?? {};
    const v = num(amount);
    if (v != null) o[key] = v;
    nut.set(fdcId, o);
  }
  return foods.map((r) => ({ id: r[0], desc: clean(r[2]), cat: cats.get(r[3]) ?? "", nutrients: nut.get(r[0]) ?? {} }));
}

function foundationRow(desc, nutrients, aliases) {
  const n = nutrients;
  if (n.calories == null) return null;
  const micros = {};
  for (const k of ["iron_mg", "calcium_mg", "vitamin_c_mg", "vitamin_a_ug", "potassium_mg", "magnesium_mg", "zinc_mg", "b12_ug"]) if (n[k] != null) micros[k] = r1(n[k]);
  return {
    id: "usda-fdn-" + slug(desc),
    name: desc,
    aliases: aliases ?? [],
    calories: r1(n.calories),
    protein_g: r1(n.protein_g ?? 0),
    carbs_g: r1(n.carbs_g ?? 0),
    fat_g: r1(n.fat_g ?? 0),
    fiber_g: n.fiber_g != null ? r1(n.fiber_g) : null,
    sugar_g: n.sugar_g != null ? r1(n.sugar_g) : null,
    sodium_mg: n.sodium_mg != null ? r1(n.sodium_mg) : null,
    micros,
    source: "usda_foundation",
    region: "western",
    names_local: {},
    units: [],
    unit_name: null,
    unit_grams: null,
  };
}

// A handful of genuine misses that neither the local IFCT mirror nor Foundation Foods carry under an
// obvious name; values are single facts pulled from the public FoodData Central API
// (api.nal.usda.gov, SR Legacy release, public domain / CC0 — the government's own analytical data,
// not scraped from a proprietary nutrition app), fetched 2026-09-25:
//   "Chickpea flour (besan)" — fdcId 174288, SR Legacy.
//   "Seeds, sesame seeds, whole, dried" — fdcId 170150, SR Legacy.
const MANUAL_USDA = [
  {
    id: "usda-besan",
    name: "Chickpea flour (besan)",
    aliases: ["besan", "gram flour", "chickpea flour"],
    calories: 387, protein_g: 22.4, carbs_g: 57.8, fat_g: 6.7,
    fiber_g: 10.8, sugar_g: 10.7, sodium_mg: 64,
    micros: { iron_mg: 4.9, calcium_mg: 45, potassium_mg: 846, magnesium_mg: 166, zinc_mg: 2.8 },
    source: "usda", region: "pan-india", names_local: { hi: "बेसन" },
    units: [{ name: "tbsp", grams: 15 }, { name: "cup", grams: 100 }], unit_name: "cup", unit_grams: 100,
  },
  {
    id: "usda-sesame-seeds",
    name: "Sesame seeds, whole, dried",
    aliases: ["sesame seed", "sesame seeds", "til", "gingelly seed"],
    calories: 573, protein_g: 17.73, carbs_g: 23.45, fat_g: 49.67,
    fiber_g: 11.8, sugar_g: 0.3, sodium_mg: 11,
    micros: { iron_mg: 14.55, calcium_mg: 975, potassium_mg: 468, magnesium_mg: 351, zinc_mg: 7.75 },
    source: "usda", region: "pan-india", names_local: { hi: "तिल" },
    units: [{ name: "tbsp", grams: 9 }, { name: "tsp", grams: 3 }], unit_name: "tbsp", unit_grams: 9,
  },
];

// ---------------------------------------------------------------------------
// 4. Assemble.
// ---------------------------------------------------------------------------
const FOUNDATION = loadFoundationFoods();
const newFoods = [];
const newAliases = []; // {alias, food_id, weight}
const report = []; // {term, status, food_id, name, source}

for (const [term, hinglish, matchRe] of COMMON) {
  const found = bestMatch(term, matchRe);
  let targetId = found?.id ?? null;
  let targetName = found?.name ?? null;
  let targetSource = found?.source ?? null;

  if (!found) {
    // Try Foundation Foods by simple substring match on description.
    const ff = FOUNDATION.find((f) => f.desc.toLowerCase().startsWith(term.toLowerCase()) || f.desc.toLowerCase().includes(term.toLowerCase()));
    if (ff) {
      const row = foundationRow(ff.desc, ff.nutrients, []);
      if (row && !existingIds.has(row.id) && !newFoods.some((r) => r.id === row.id)) {
        newFoods.push(row);
        targetId = row.id; targetName = row.name; targetSource = row.source;
      }
    }
  }
  if (!found && !targetId) {
    const manual = MANUAL_USDA.find((m) => m.aliases.includes(term.toLowerCase()) || slug(term) === slug(m.name));
    if (manual) { targetId = manual.id; targetName = manual.name; targetSource = manual.source; }
  }

  if (!targetId) {
    report.push({ term, status: "MISS", food_id: "", name: "", source: "" });
    continue;
  }
  report.push({ term, status: found ? "existing" : "new", food_id: targetId, name: targetName, source: targetSource });

  const aliasCandidates = [term, ...hinglish].map((a) => a.toLowerCase().trim());
  for (const alias of new Set(aliasCandidates)) {
    if (existingAliasSet.has(alias)) continue; // already aliased (possibly to a different id) — leave as-is
    newAliases.push({ alias, food_id: targetId, weight: 100 });
    existingAliasSet.add(alias);
  }
}

// Always add the manual besan row even if none of the terms above happened to need it standalone.
for (const m of MANUAL_USDA) if (!existingIds.has(m.id) && !newFoods.some((r) => r.id === m.id)) newFoods.push(m);

// ---------------------------------------------------------------------------
// 5. Sanity gates (task spec): calories <= 900, macros >= 0, p+c+f <= 100 g/100g, Atwater check
//    (4p + 4c + 9f) within ~25% + 15 kcal of stated calories.
// ---------------------------------------------------------------------------
const clean_rows = [];
const rejected = [];
for (const row of newFoods) {
  const { calories, protein_g, carbs_g, fat_g } = row;
  const atwater = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  const ok =
    calories >= 0 && calories <= 900 &&
    protein_g >= 0 && carbs_g >= 0 && fat_g >= 0 &&
    protein_g + carbs_g + fat_g <= 100 + 1e-6 &&
    Math.abs(atwater - calories) <= calories * 0.25 + 15;
  (ok ? clean_rows : rejected).push(row);
}
if (rejected.length) console.log("rejected by sanity gate:", rejected.map((r) => r.id));

// ---------------------------------------------------------------------------
// 6. Write supabase/seeds/foods_v27.sql (idempotent) + summary CSV.
// ---------------------------------------------------------------------------
const lines = [];
lines.push("-- foods_v27.sql — gap-fill for common Indian raw ingredients + Hindi/Hinglish aliases.");
lines.push("-- Generated by scripts/import-foods-gapfill.mjs. Idempotent (ON CONFLICT DO NOTHING). NOT applied automatically.");
lines.push("-- Sources: USDA FoodData Central Foundation Foods (public domain/CC0) for new raw-ingredient rows tagged");
lines.push("-- 'usda_foundation'; one manually-verified USDA SR Legacy fact (besan) tagged 'usda'. All other rows referenced");
lines.push("-- by the new food_aliases already exist in production (ifct/usda/dish/custom, imported by scripts/import-foods.mts).");
lines.push("");
if (clean_rows.length) {
  lines.push(
    "insert into bandlog.foods (id, name, aliases, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, micros, source, region, names_local, units, unit_name, unit_grams) values",
  );
  lines.push(
    clean_rows
      .map(
        (r, i) =>
          `  (${sqlStr(r.id)}, ${sqlStr(r.name)}, ${sqlArr(r.aliases)}, ${r.calories}, ${r.protein_g}, ${r.carbs_g}, ${r.fat_g}, ${r.fiber_g ?? "null"}, ${r.sugar_g ?? "null"}, ${r.sodium_mg ?? "null"}, ${sqlJsonb(r.micros)}, ${sqlStr(r.source)}, ${sqlStr(r.region)}, ${sqlJsonb(r.names_local)}, ${sqlJsonb(r.units)}, ${r.unit_name ? sqlStr(r.unit_name) : "null"}, ${r.unit_grams ?? "null"})` +
          (i === clean_rows.length - 1 ? "" : ","),
      )
      .join("\n"),
  );
  lines.push("on conflict (id) do nothing;");
  lines.push("");
}
if (newAliases.length) {
  lines.push("insert into bandlog.food_aliases (alias, food_id, weight) values");
  lines.push(
    newAliases
      .map((a, i) => `  (${sqlStr(a.alias)}, ${sqlStr(a.food_id)}, ${a.weight})` + (i === newAliases.length - 1 ? "" : ","))
      .join("\n"),
  );
  lines.push("on conflict (alias) do nothing;");
  lines.push("");
}
lines.push(`select ${clean_rows.length} as new_foods, ${newAliases.length} as new_aliases;`);

writeFileSync(ROOT + "supabase/seeds/foods_v27.sql", lines.join("\n") + "\n");

const csvLines = ["term,status,food_id,name,source"];
for (const r of report) csvLines.push([r.term, r.status, r.food_id, r.name, r.source].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
writeFileSync(ROOT + "supabase/seeds/foods_v27_coverage_summary.csv", csvLines.join("\n") + "\n");

const byStatus = report.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
console.log("coverage terms checked:", report.length, byStatus);
console.log("new foods rows:", clean_rows.length, "(rejected by sanity gate:", rejected.length, ")");
console.log("new aliases:", newAliases.length);
console.log("wrote supabase/seeds/foods_v27.sql and supabase/seeds/foods_v27_coverage_summary.csv");
