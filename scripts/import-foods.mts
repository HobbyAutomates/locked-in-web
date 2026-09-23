/**
 * Builds bandlog.foods from three open datasets plus the hand-curated list in src/lib/foods.ts.
 *
 *   node scripts/import-foods.mts            # import (upsert in batches of 500)
 *   node scripts/import-foods.mts --dry      # only write data/foods_import.json and print counts
 *
 * Sources (raw files live in data/, which is gitignored — download them first):
 *   IFCT 2017 (ICMR-NIN "Indian Food Composition Tables 2017", 542 raw foods), CSV mirror:
 *     https://raw.githubusercontent.com/nodef/ifct2017/main/compositions/index.csv   → data/ifct_compositions.csv
 *     package licence AGPL-3.0-or-later (github.com/ifct2017/compositions); the values are ICMR-NIN's.
 *   INDB — Indian Nutrient Databank (1,014 recipes, per 100 g and per serving), CC BY 4.0
 *     (Curr Dev Nutr 2024, doi:10.1016/j.cdnut.2024.103790):
 *     https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/INDB.xlsx
 *     https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes_servingsize.xlsx
 *   USDA FoodData Central SR Legacy (April 2018 release, public domain / CC0):
 *     https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip → data/usda/
 *
 * Everything is normalised to per 100 g. `search_text` is filled by a trigger, so it is not sent.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { FOODS } from "../src/lib/foods.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const DRY = process.argv.includes("--dry");
const DATA = new URL("../data/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

type Unit = { name: string; grams: number };
type Row = {
  id: string;
  name: string;
  aliases: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  micros: Record<string, number>;
  source: "custom" | "dish" | "ifct" | "usda";
  region: string;
  names_local: Record<string, string>;
  units: Unit[];
  unit_name: string | null;
  unit_grams: number | null;
  barcode: null;
};

// ---------- helpers ----------

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const uniq = (xs: string[]) => [...new Set(xs.map((x) => clean(x).toLowerCase()).filter((x) => x.length >= 2))];

function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n") {
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else if (c !== "\r") f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const STD: Unit[] = [
  { name: "tbsp", grams: 15 },
  { name: "tsp", grams: 5 },
];
const KATORI: Unit[] = [
  { name: "katori", grams: 150 },
  { name: "bowl", grams: 200 },
  { name: "ladle", grams: 60 },
];
const CUP150: Unit = { name: "cup", grams: 150 };
const GLASS: Unit = { name: "glass", grams: 250 };

function mergeUnits(...lists: Unit[][]): Unit[] {
  const seen = new Map<string, Unit>();
  for (const l of lists) for (const u of l) if (u.grams > 0 && !seen.has(u.name)) seen.set(u.name, { name: u.name, grams: r1(u.grams) });
  return [...seen.values()];
}

/** Devanagari for the dishes and staples people actually type. Matched on name/aliases, longest key first. */
const HI: [string, string][] = [
  ["chole bhature", "छोले भटूरे"], ["chana masala", "चना मसाला"], ["chole", "छोले"], ["chana", "चना"], ["rajma chawal", "राजमा चावल"], ["rajma", "राजमा"],
  ["paneer bhurji", "पनीर भुर्जी"], ["palak paneer", "पालक पनीर"], ["matar paneer", "मटर पनीर"], ["shahi paneer", "शाही पनीर"], ["paneer tikka", "पनीर टिक्का"],
  ["paneer paratha", "पनीर पराठा"], ["aloo paratha", "आलू पराठा"], ["aloo gobi", "आलू गोभी"], ["aloo", "आलू"], ["bhindi", "भिंडी"], ["baingan bharta", "बैंगन भर्ता"],
  ["dal makhani", "दाल मखनी"], ["dal tadka", "दाल तड़का"], ["dal fry", "दाल फ्राई"], ["moong dal", "मूंग दाल"], ["toor dal", "अरहर दाल"], ["masoor dal", "मसूर दाल"],
  ["urad dal", "उड़द दाल"], ["chana dal", "चना दाल"], ["dal", "दाल"], ["makki ki roti", "मक्की की रोटी"], ["roti", "रोटी"], ["chapati", "चपाती"], ["phulka", "फुल्का"],
  ["paratha", "पराठा"], ["poha", "पोहा"], ["upma", "उपमा"], ["idli", "इडली"], ["masala dosa", "मसाला डोसा"], ["dosa", "डोसा"], ["sambar", "सांभर"], ["rasam", "रसम"],
  ["uttapam", "उत्तपम"], ["medu vada", "मेदु वड़ा"], ["vada pav", "वड़ा पाव"], ["vada", "वड़ा"], ["chutney", "चटनी"], ["raita", "रायता"], ["curd", "दही"], ["dahi", "दही"],
  ["khichdi", "खिचड़ी"], ["pulao", "पुलाव"], ["biryani", "बिरयानी"], ["jeera rice", "जीरा चावल"], ["rice", "चावल"], ["pav bhaji", "पाव भाजी"], ["misal pav", "मिसल पाव"],
  ["samosa", "समोसा"], ["pakora", "पकौड़ा"], ["jalebi", "जलेबी"], ["gulab jamun", "गुलाब जामुन"], ["laddu", "लड्डू"], ["ladoo", "लड्डू"], ["halwa", "हलवा"], ["kheer", "खीर"],
  ["lassi", "लस्सी"], ["chai", "चाय"], ["tea", "चाय"], ["buttermilk", "छाछ"], ["chaas", "छाछ"], ["ghee", "घी"], ["milk", "दूध"], ["paneer", "पनीर"], ["butter chicken", "बटर चिकन"],
  ["chicken curry", "चिकन करी"], ["chicken", "चिकन"], ["mutton", "मटन"], ["fish", "मछली"], ["egg", "अंडा"], ["naan", "नान"], ["kadhi", "कढ़ी"], ["sabzi", "सब्ज़ी"],
  ["sprouts", "अंकुरित"], ["dhokla", "ढोकला"], ["thepla", "थेपला"], ["bisi bele bath", "बिसी बेले बाथ"], ["puri", "पूरी"], ["poori", "पूरी"], ["bhature", "भटूरे"],
  ["malai kofta", "मलाई कोफ्ता"], ["sarson ka saag", "सरसों का साग"], ["litti chokha", "लिट्टी चोखा"], ["bread", "ब्रेड"], ["banana", "केला"], ["apple", "सेब"], ["mango", "आम"],
  ["peanut", "मूंगफली"], ["almond", "बादाम"], ["cashew", "काजू"], ["oats", "ओट्स"], ["whey", "व्हे प्रोटीन"], ["soya", "सोया"], ["tofu", "टोफू"], ["potato", "आलू"],
  ["spinach", "पालक"], ["palak", "पालक"], ["momos", "मोमोज़"], ["maggi", "मैगी"], ["noodles", "नूडल्स"], ["sugar", "चीनी"], ["honey", "शहद"], ["oil", "तेल"], ["butter", "मक्खन"],
  ["cheese", "चीज़"], ["coffee", "कॉफ़ी"], ["juice", "जूस"], ["water", "पानी"], ["wheat", "गेहूं"], ["atta", "आटा"], ["besan", "बेसन"], ["suji", "सूजी"], ["rava", "रवा"],
];
HI.sort((a, b) => b[0].length - a[0].length);
function devanagari(name: string, aliases: string[]): string | null {
  const hay = " " + [name, ...aliases].join(" ").toLowerCase() + " ";
  for (const [k, v] of HI) if (hay.includes(" " + k + " ") || hay.includes(" " + k + ",") || hay.startsWith(" " + k)) return v;
  return null;
}

const SOUTH = /idli|dosa|sambar|rasam|uttapam|upma|pongal|vada|appam|puttu|avial|kootu|poriyal|bisi bele|chitranna|puliyo|payasam|sadam|annam|thayir|kesari|neer dosa|akki|ragi mudde|obbattu|holige|thoran|olan|malabar|chettinad|andhra|hyderabadi|mysore|udupi|kerala|karnataka|tamil|coorg/i;
const EAST = /bengali|shorshe|machher|mishti|rosogolla|rasgulla|sandesh|luchi|chorchori|shukto|posto|litti|chokha|momo|thukpa|assam|odia|dalma|pakhala|khar|pitha/i;
const WEST = /gujarati|dhokla|thepla|khandvi|undhiyu|fafda|khakhra|handvo|maharashtrian|misal|vada pav|pav bhaji|poha|sabudana|puran poli|bharli|bhakri|thalipeeth|goan|vindaloo|xacuti|sorpotel|shrikhand|basundi|modak/i;
const NORTH = /punjabi|sarson|makki|chole|rajma|paratha|parantha|kulcha|naan|butter chicken|dal makhani|kadhi|pakora|chaat|kashmiri|rogan|dum aloo|awadhi|lucknowi|kebab|nihari|korma|rajasthani|dal bati|gatte|ker sangri|lassi/i;
function regionOf(name: string): string {
  if (SOUTH.test(name)) return "south";
  if (EAST.test(name)) return "east";
  if (WEST.test(name)) return "west";
  if (NORTH.test(name)) return "north";
  return "pan-india";
}
const WESTERN = /pizza|burger|fries|pasta|penne|spaghetti|lasagn|sandwich|toast|oat|quinoa|salmon|tuna|greek yogurt|cheese|peanut butter|whey|cookie|cake|pie|muffin|pancake|waffle|cereal|granola|smoothie|coffee|latte|cappuccino|espresso|americano|coke|soft drink|soda|chocolate|ice cream|broccoli|avocado|steak|bacon|ham|sausage|hot dog|taco|burrito|sushi|noodle/i;

// ---------- 1. custom (src/lib/foods.ts) ----------

function customRows(): Row[] {
  return FOODS.map((f) => {
    const units = mergeUnits(f.unit && f.unitGrams ? [{ name: f.unit, grams: f.unitGrams }] : [], /dal|rice|sabzi|curry|chole|rajma|khichdi|curd|raita|upma|poha|oats|pasta|noodles|sprouts|soya|mushroom|spinach|salad|corn|peas|biryani|chana/i.test(f.name) ? KATORI : [], /milk|juice|coffee|tea|buttermilk|soft drink/i.test(f.name) ? [GLASS, CUP150] : [], STD);
    return {
      id: f.id,
      name: f.name,
      aliases: uniq(f.aliases),
      calories: r1(f.calories),
      protein_g: r1(f.protein),
      carbs_g: r1(f.carbs),
      fat_g: r1(f.fat),
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
      micros: {},
      source: "custom",
      region: WESTERN.test(f.name + " " + f.aliases.join(" ")) ? "western" : regionOf(f.name + " " + f.aliases.join(" ")),
      names_local: (() => {
        const h = devanagari(f.name, f.aliases);
        return h ? { hi: h } : {};
      })(),
      units,
      unit_name: f.unit ?? units[0]?.name ?? null,
      unit_grams: f.unitGrams ?? units[0]?.grams ?? null,
      barcode: null,
    };
  });
}

// ---------- 2. INDB recipes → source 'dish' ----------

function dishRows(): Row[] {
  const wb = XLSX.readFile(DATA + "indb_INDB.xlsx");
  const recipes = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  const ss = XLSX.readFile(DATA + "indb_recipes_servingsize.xlsx");
  const servings = new Map<string, Record<string, unknown>>();
  for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(ss.Sheets[ss.SheetNames[0]])) servings.set(String(r.recipe_code), r);

  const out: Row[] = [];
  for (const r of recipes) {
    const raw = clean(String(r.food_name ?? ""));
    if (!raw) continue;
    const kcal = num(r.energy_kcal);
    if (kcal == null || kcal <= 0) continue;
    // "Kidney bean curry (Rajmah curry)" → name + aliases from the bracket and the slashes.
    const m = raw.match(/^(.*?)\s*\((.*)\)\s*$/);
    const main = clean(m ? m[1] : raw);
    const extra = m ? m[2] : "";
    const mainParts = main.split("/").map(clean).filter(Boolean);
    const name = mainParts[0].replace(/^\w/, (c) => c.toUpperCase());
    const aliases = uniq([...mainParts.slice(1), ...extra.split(/[\/,]/), ...mainParts.flatMap((p) => p.split(/,\s*/))]);

    const unitName = clean(String(r.servings_unit ?? "")).toLowerCase();
    const perServing = num(r.unit_serving_energy_kcal);
    const gramsPerServing = perServing != null && perServing > 0 ? (perServing / kcal) * 100 : null;
    const units: Unit[] = [];
    if (unitName && unitName !== "undefined" && gramsPerServing && gramsPerServing > 3 && gramsPerServing < 1500) {
      units.push({ name: unitName.replace(/^parantha$/, "paratha"), grams: gramsPerServing });
    }
    const wet = /dal|curry|sabzi|sabji|gravy|kadhi|sambar|rasam|raita|kheer|soup|stew|bhaji|masala|korma|rice|pulao|biryani|khichdi|upma|poha|halwa|payasam/i.test(name + " " + aliases.join(" "));
    const drink = /tea|coffee|lassi|juice|milk|shake|sharbat|panna|drink|buttermilk|chaas/i.test(name);
    const all = mergeUnits(units, wet ? KATORI : [], drink ? [GLASS, CUP150] : [], STD);

    const micros: Record<string, number> = {};
    const put = (k: string, v: unknown, scale = 1) => {
      const n = num(v);
      if (n != null && n >= 0) micros[k] = r1(n * scale);
    };
    put("iron_mg", r.iron_mg);
    put("calcium_mg", r.calcium_mg);
    put("vitamin_c_mg", r.vitc_mg);
    put("vitamin_a_ug", r.vita_ug);
    put("potassium_mg", r.potassium_mg);
    put("magnesium_mg", r.magnesium_mg);
    put("zinc_mg", r.zinc_mg);
    put("folate_ug", r.folate_ug);

    const hi = devanagari(name, aliases);
    out.push({
      id: "dish-" + slug(name),
      name,
      aliases,
      calories: r1(kcal),
      protein_g: r1(num(r.protein_g) ?? 0),
      carbs_g: r1(num(r.carb_g) ?? 0),
      fat_g: r1(num(r.fat_g) ?? 0),
      fiber_g: num(r.fibre_g) != null ? r1(num(r.fibre_g)!) : null,
      sugar_g: num(r.freesugar_g) != null ? r1(num(r.freesugar_g)!) : null,
      sodium_mg: num(r.sodium_mg) != null ? r1(num(r.sodium_mg)!) : null,
      micros,
      source: "dish",
      region: WESTERN.test(name) && !/indian|masala|paneer|dal/i.test(name) ? "western" : regionOf(raw),
      names_local: hi ? { hi } : {},
      units: all,
      unit_name: all[0]?.name ?? null,
      unit_grams: all[0]?.grams ?? null,
      barcode: null,
    });
  }
  return out;
}

// ---------- 3. IFCT 2017 → source 'ifct' ----------

function ifctRows(): Row[] {
  const rows = csv(readFileSync(DATA + "ifct_compositions.csv", "utf8"));
  const h = rows[0];
  const ix = (k: string) => h.indexOf(k);
  const col = (r: string[], k: string) => num(r[ix(k)]);
  const out: Row[] = [];
  for (const r of rows.slice(1)) {
    if (!r[ix("name")]) continue;
    const name = clean(r[ix("name")]);
    const group = r[ix("grup")];
    // "A. Aam; H. Aam (paka); Kan. Mvina hannu; Tam. Mampazham" → Hindi, English, Kannada, Tamil, Telugu, Malayalam names.
    const lang = r[ix("lang")] ?? "";
    const local: Record<string, string> = {};
    const aliases: string[] = [];
    for (const part of lang.split(";")) {
      const m = part.trim().match(/^([A-Za-z.]+(?:,\s*[A-Za-z.]+)*)\s+(.+)$/);
      if (!m) continue;
      const codes = m[1].split(",").map((c) => c.trim().replace(/\.$/, ""));
      const val = clean(m[2].replace(/\(.*?\)/g, (s) => " " + s.slice(1, -1) + " "));
      for (const code of codes) {
        if (code === "H") local.hi ??= val;
        if (code === "Kan") local.kn ??= val;
        if (code === "Tam") local.ta ??= val;
        if (code === "Tel") local.te ??= val;
        if (code === "Mal") local.ml ??= val;
        if (["H", "E", "Kan", "Tam", "Tel", "Mal", "Mar", "G", "B", "P", "U"].includes(code)) aliases.push(...val.split(/[\/,]/));
      }
    }
    const kj = col(r, "enerc");
    const kcal = kj != null ? kj / 4.184 : null;
    if (kcal == null) continue;
    const micros: Record<string, number> = {};
    const g2mg = (k: string, key: string) => {
      const v = col(r, k);
      if (v != null) micros[key] = r1(v * 1000);
    };
    g2mg("fe", "iron_mg");
    g2mg("ca", "calcium_mg");
    g2mg("vitc", "vitamin_c_mg");
    g2mg("k", "potassium_mg");
    g2mg("mg", "magnesium_mg");
    g2mg("zn", "zinc_mg");
    const va = col(r, "vita");
    if (va != null) micros.vitamin_a_ug = r1(va * 1e6);
    const fol = col(r, "folsum");
    if (fol != null) micros.folate_ug = r1(fol * 1e6);
    const na = col(r, "na");

    const units: Unit[] = [];
    if (/Cereals|Legumes/.test(group)) units.push({ name: "cup", grams: 180 }, { name: "katori", grams: 120 });
    else if (/Vegetables|Roots/.test(group)) units.push({ name: "katori", grams: 100 }, { name: "cup", grams: 100 });
    else if (/Fruits/.test(group)) units.push({ name: "piece", grams: 120 }, { name: "cup", grams: 150 });
    else if (/Condiments|Spices/.test(group)) units.push({ name: "tsp", grams: 3 }, { name: "tbsp", grams: 9 });
    else if (/Nuts/.test(group)) units.push({ name: "handful", grams: 30 });
    else if (/Oils/.test(group)) units.push({ name: "tbsp", grams: 14 }, { name: "tsp", grams: 5 });
    else if (/Egg/.test(group)) units.push({ name: "egg", grams: 50 });
    else if (/Milk/.test(group) && /paneer|khoa|chhena|cheese/i.test(name)) units.push({ name: "piece", grams: 30 }, { name: "cup", grams: 100 });
    else if (/Milk/.test(group)) units.push(GLASS, CUP150);
    else if (/Fish|Meat|Poultry|Shellfish|Mollusks/.test(group)) units.push({ name: "piece", grams: 100 }, { name: "katori", grams: 150 });
    else if (/Mushrooms/.test(group)) units.push({ name: "katori", grams: 100 });
    const all = mergeUnits(units, STD);
    const rawish = /Cereals|Legumes|Vegetables|Roots|Meat|Poultry|Fish|Shellfish|Mollusks|Mushrooms/.test(group) && !/cooked|boiled|fried|roasted/i.test(name);
    if (local.hi) local.hi_latin = local.hi;
    const dev = devanagari(name, aliases);
    if (dev) local.hi = dev;
    else delete local.hi;
    out.push({
      id: "ifct-" + slug(name),
      name: rawish ? name + " (raw)" : name,
      aliases: uniq(aliases),
      calories: r1(kcal),
      protein_g: r1(col(r, "protcnt") ?? 0),
      carbs_g: r1(col(r, "choavldf") ?? 0),
      fat_g: r1(col(r, "fatce") ?? 0),
      fiber_g: col(r, "fibtg") != null ? r1(col(r, "fibtg")!) : null,
      sugar_g: col(r, "fsugar") != null ? r1(col(r, "fsugar")!) : null,
      sodium_mg: na != null ? r1(na * 1000) : null,
      micros,
      source: "ifct",
      region: "pan-india",
      names_local: local,
      units: all,
      unit_name: all[0]?.name ?? null,
      unit_grams: all[0]?.grams ?? null,
      barcode: null,
    });
  }
  return out;
}

// ---------- 4. USDA SR Legacy → source 'usda' ----------

const USDA_CAPS: Record<string, number> = {
  "Dairy and Egg Products": 120,
  "Fruits and Fruit Juices": 150,
  "Vegetables and Vegetable Products": 200,
  "Poultry Products": 60,
  "Beef Products": 50,
  "Pork Products": 40,
  "Lamb, Veal, and Game Products": 25,
  "Finfish and Shellfish Products": 80,
  "Legumes and Legume Products": 80,
  "Nut and Seed Products": 60,
  "Cereal Grains and Pasta": 80,
  "Baked Products": 100,
  "Fast Foods": 120,
  "Breakfast Cereals": 40,
  Sweets: 80,
  Beverages: 100,
  Snacks: 60,
  "Fats and Oils": 40,
  "Spices and Herbs": 63,
  "Soups, Sauces, and Gravies": 60,
  "Meals, Entrees, and Side Dishes": 40,
  "Restaurant Foods": 60,
  "Sausages and Luncheon Meats": 30,
};
const USDA_STAPLE =
  /chicken, broilers or fryers, breast|chicken, broilers or fryers, thigh|chicken, broilers or fryers, drumstick|egg, whole|egg, white|egg, yolk|salmon, atlantic|tuna|shrimp|cod|tilapia|sardine|beef, ground|steak|pork, fresh, loin|bacon|ham|turkey, breast|oats|oatmeal|bread, whole-wheat|bread, white|bagel|tortilla|rice, white, long-grain|rice, brown|quinoa|pasta, cooked|spaghetti|macaroni|noodles|potatoes, boiled|potatoes, baked|sweet potato|broccoli|spinach|carrots|tomatoes|onions|garlic|lettuce|cucumber|bell pepper|peppers, sweet|mushrooms|avocados|apples, raw|bananas, raw|oranges, raw|strawberries|blueberries|grapes|watermelon|pineapple|mango|kiwi|peaches|pears|milk, whole|milk, reduced fat|milk, nonfat|yogurt, greek|yogurt, plain|cheese, cheddar|cheese, mozzarella|cheese, parmesan|cheese, cottage|cream cheese|butter, salted|butter, without salt|olive oil|peanut butter|almonds|walnuts|cashew|peanuts|chia|flax|sunflower seed|pumpkin seed|beans, black|beans, kidney|chickpeas|lentils|tofu|hummus|pizza|hamburger|cheeseburger|french fries|hot dog|taco|burrito|chocolate|ice cream|donut|pancakes|waffles|granola|cereals ready-to-eat, kellogg|cornflakes|coffee|tea, brewed|cola|orange juice|apple juice|beer|wine|honey|sugars, granulated|maple syrup|jam|ketchup|mayonnaise|mustard|soy sauce|whey|protein/i;
const USDA_NUTRIENTS: Record<string, string> = {
  "1008": "calories",
  "1003": "protein_g",
  "1004": "fat_g",
  "1005": "carbs_g",
  "1079": "fiber_g",
  "2000": "sugar_g",
  "1093": "sodium_mg",
  "1089": "iron_mg",
  "1087": "calcium_mg",
  "1162": "vitamin_c_mg",
  "1106": "vitamin_a_ug",
  "1092": "potassium_mg",
  "1090": "magnesium_mg",
  "1095": "zinc_mg",
  "1178": "b12_ug",
};

function usdaRows(): Row[] {
  const dir = DATA + "usda/";
  const cats = new Map(csv(readFileSync(dir + "food_category.csv", "utf8")).slice(1).map((r) => [r[0], r[2]]));
  const foods = csv(readFileSync(dir + "food.csv", "utf8")).slice(1).filter((r) => r[1] === "sr_legacy_food");
  const byCat = new Map<string, { id: string; desc: string }[]>();
  for (const r of foods) {
    const cat = cats.get(r[3]) ?? "";
    const cap = USDA_CAPS[cat];
    if (!cap) continue;
    const desc = clean(r[2]);
    if (/babyfood|infant|USDA Commodity|industrial|fortified with|unprepared|dehydrated|freeze-dried|prepared from recipe|home-prepared|nfs\b|not further specified/i.test(desc)) continue;
    // Skip branded rows (two+ shouting words) outside the fast-food / restaurant sets.
    if (!/Fast Foods|Restaurant/.test(cat) && /\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b/.test(desc)) continue;
    const list = byCat.get(cat) ?? [];
    list.push({ id: r[0], desc });
    byCat.set(cat, list);
  }
  const picked = new Map<string, { desc: string; cat: string }>();
  for (const [cat, list] of byCat) {
    // Staples first (chicken breast, eggs, salmon, oats…), then the plainest descriptions.
    const score = (d: string) => (USDA_STAPLE.test(d) ? 100 : 0) + (/(raw|cooked|boiled|roasted|grilled|baked|plain|whole)/i.test(d) ? 10 : 0) - d.split(",").length - d.length / 100;
    list.sort((a, b) => score(b.desc) - score(a.desc));
    for (const f of list.slice(0, USDA_CAPS[cat])) picked.set(f.id, { desc: f.desc.replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/i, ""), cat });
  }

  // Nutrients: stream the 36 MB file, keep only the ids we picked.
  const nut = new Map<string, Record<string, number>>();
  const lines = readFileSync(dir + "food_nutrient.csv", "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^"\d+","(\d+)","(\d+)","([-\d.]+)"/);
    if (!m || !picked.has(m[1])) continue;
    const key = USDA_NUTRIENTS[m[2]];
    if (!key) continue;
    const o = nut.get(m[1]) ?? {};
    o[key] = Number(m[3]);
    nut.set(m[1], o);
  }
  // Household portions: the unit lives in `modifier` (measure_unit_id is 9999 for SR Legacy).
  const portions = new Map<string, Unit[]>();
  for (const r of csv(readFileSync(dir + "food_portion.csv", "utf8")).slice(1)) {
    if (!picked.has(r[1])) continue;
    const amount = num(r[3]) ?? 1;
    const grams = num(r[7]);
    if (!grams || grams <= 0) continue;
    let unit = clean(r[6]).toLowerCase().replace(/\s*\(.*?\)/g, "");
    unit = unit.replace(/^(cup|tbsp|tablespoon|tsp|teaspoon|slice|piece|oz|fl oz|large|medium|small|egg|serving|scoop|bar|cookie|muffin|packet|can|bottle|fillet|breast|thigh|drumstick|leg|patty|link|biscuit|cracker|roll|loaf|steak|chop|fruit|leaf|stalk|wedge|pod|head|bunch|ear|clove)\b.*/, "$1");
    unit = unit.replace(/^tablespoon$/, "tbsp").replace(/^teaspoon$/, "tsp");
    if (!unit || unit.length > 14 || /\d/.test(unit)) continue;
    const list = portions.get(r[1]) ?? [];
    if (list.length < 3 && !list.some((u) => u.name === unit)) list.push({ name: unit, grams: grams / (amount || 1) });
    portions.set(r[1], list);
  }

  const out: Row[] = [];
  for (const [id, { desc, cat }] of picked) {
    const n = nut.get(id);
    if (!n || n.calories == null) continue;
    const parts = desc.split(",").map(clean);
    const name = desc.length > 90 ? parts.slice(0, 4).join(", ") : desc;
    const micros: Record<string, number> = {};
    for (const k of ["iron_mg", "calcium_mg", "vitamin_c_mg", "vitamin_a_ug", "potassium_mg", "magnesium_mg", "zinc_mg", "b12_ug"]) if (n[k] != null) micros[k] = r1(n[k]);
    const drink = /Beverages/.test(cat);
    const all = mergeUnits(portions.get(id) ?? [], drink ? [GLASS, CUP150] : [], /Vegetables|Legumes|Cereal|Pasta|Soups/.test(cat) ? [CUP150, { name: "bowl", grams: 200 }] : [], STD);
    out.push({
      id: "usda-" + slug(name),
      name,
      aliases: uniq([parts[0], parts.slice(0, 2).join(" ")]),
      calories: r1(n.calories),
      protein_g: r1(n.protein_g ?? 0),
      carbs_g: r1(n.carbs_g ?? 0),
      fat_g: r1(n.fat_g ?? 0),
      fiber_g: n.fiber_g != null ? r1(n.fiber_g) : null,
      sugar_g: n.sugar_g != null ? r1(n.sugar_g) : null,
      sodium_mg: n.sodium_mg != null ? r1(n.sodium_mg) : null,
      micros,
      source: "usda",
      region: "western",
      names_local: {},
      units: all,
      unit_name: all[0]?.name ?? null,
      unit_grams: all[0]?.grams ?? null,
      barcode: null,
    });
  }
  return out;
}

// ---------- assemble, dedupe, upsert ----------

function dedupe(lists: Row[][]): Row[] {
  const seen = new Map<string, Row>();
  for (const list of lists) {
    for (const row of list) {
      let id = row.id;
      let i = 2;
      while (seen.has(id)) id = `${row.id}-${i++}`;
      seen.set(id, { ...row, id });
    }
  }
  return [...seen.values()];
}

function env(): Record<string, string> {
  const p = new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
}

async function main() {
  const custom = customRows();
  const dish = dishRows();
  const ifct = ifctRows();
  const usda = usdaRows();
  const rows = dedupe([custom, dish, ifct, usda]);
  const counts = { custom: custom.length, dish: dish.length, ifct: ifct.length, usda: usda.length, total: rows.length, withHindi: rows.filter((r) => r.names_local.hi).length };
  console.log(counts);
  writeFileSync(DATA + "foods_import.json", JSON.stringify(rows, null, 1));
  if (DRY) return;

  const e = { ...env(), ...process.env } as Record<string, string>;
  const url = e.NEXT_PUBLIC_SUPABASE_URL;
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const sb = createClient(url, key, { db: { schema: "bandlog" }, auth: { persistSession: false } });
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from("foods").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`batch ${i}: ${error.message}`);
    console.log(`upserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }
  const { count } = await sb.from("foods").select("id", { count: "exact", head: true });
  console.log("foods in DB:", count);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
