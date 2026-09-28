/**
 * v2.18 A11 pantry + weekly grocery list, pure. Android: util/Grocery.kt.
 *
 * The list is built from what the person actually eats (their logged foods over the last weeks,
 * mapped to what you buy: roti → atta, dal tadka → toor dal, biryani → rice…) scaled to one week,
 * plus what the targets need: when the average protein is short of the target, protein staples fill
 * the gap for the week (paneer, eggs, soya chunks, curd, chana — diet-mode aware), and produce is
 * always on it. Anything in the pantry marked in stock is left off (it shows as "In your pantry").
 */

export type GroceryCategory = "staples" | "protein" | "dairy" | "produce" | "other";
export type GroceryItem = { key: string; name: string; qty: string; category: GroceryCategory; why: string; inPantry: boolean };
export type EatenFood = { name: string; grams: number };
export type PantryRow = { name: string; in_stock: boolean };

type Buy = { key: string; name: string; category: GroceryCategory; /** grams of the bought thing per gram eaten (roti 40 g → 28 g atta). */ ratio: number; unit: "kg" | "g" | "L" | "pcs" | "pack"; per?: number };

/** Eaten food → what to buy. First match wins. */
const MAP: [RegExp, Buy][] = [
  [/\b(roti|chapati|phulka|paratha|thepla|puri|poori|tandoori roti)\b/i, { key: "atta", name: "Whole wheat atta", category: "staples", ratio: 0.7, unit: "kg" }],
  [/\b(rice|chawal|pulao|biryani|khichdi|curd rice|lemon rice)\b/i, { key: "rice", name: "Rice", category: "staples", ratio: 0.4, unit: "kg" }],
  [/\b(idli|dosa|uttapam|appam)\b/i, { key: "batter", name: "Idli / dosa batter", category: "staples", ratio: 1, unit: "kg" }],
  [/\bpoha\b/i, { key: "poha", name: "Poha", category: "staples", ratio: 0.45, unit: "kg" }],
  [/\b(upma|rava|suji)\b/i, { key: "rava", name: "Rava (suji)", category: "staples", ratio: 0.4, unit: "kg" }],
  [/\boats|daliya|porridge\b/i, { key: "oats", name: "Oats", category: "staples", ratio: 0.3, unit: "kg" }],
  [/\bbread|toast|sandwich\b/i, { key: "bread", name: "Bread", category: "staples", ratio: 1, unit: "pack", per: 400 }],
  [/\b(moong dal|moong|pesarattu|sprouts)\b/i, { key: "moong", name: "Moong dal", category: "protein", ratio: 0.35, unit: "kg" }],
  [/\b(dal|daal|sambar|sambhar|tadka|masoor)\b/i, { key: "toor", name: "Toor dal", category: "protein", ratio: 0.35, unit: "kg" }],
  [/\brajma\b/i, { key: "rajma", name: "Rajma", category: "protein", ratio: 0.35, unit: "kg" }],
  [/\b(chole|chana|chickpea)\b/i, { key: "chana", name: "Kabuli / kala chana", category: "protein", ratio: 0.35, unit: "kg" }],
  [/\b(besan|chilla|cheela|dhokla|kadhi|pakora|pakoda)\b/i, { key: "besan", name: "Besan", category: "staples", ratio: 0.4, unit: "kg" }],
  [/\bpaneer\b/i, { key: "paneer", name: "Paneer", category: "dairy", ratio: 0.8, unit: "g" }],
  [/\b(egg|eggs|anda|omelette|bhurji)\b/i, { key: "eggs", name: "Eggs", category: "protein", ratio: 1, unit: "pcs", per: 50 }],
  [/\b(chicken|murgh)\b/i, { key: "chicken", name: "Chicken", category: "protein", ratio: 0.8, unit: "kg" }],
  [/\b(fish|machli|prawn)\b/i, { key: "fish", name: "Fish", category: "protein", ratio: 0.8, unit: "kg" }],
  [/\b(mutton|keema|gosht)\b/i, { key: "mutton", name: "Mutton", category: "protein", ratio: 0.8, unit: "kg" }],
  [/\bsoya|nutrela\b/i, { key: "soya", name: "Soya chunks", category: "protein", ratio: 0.35, unit: "g" }],
  [/\b(whey|protein shake|protein powder)\b/i, { key: "whey", name: "Whey protein", category: "protein", ratio: 1, unit: "g" }],
  [/\b(curd|dahi|yogurt|raita|chaas|buttermilk|lassi)\b/i, { key: "curd", name: "Curd", category: "dairy", ratio: 0.9, unit: "kg" }],
  [/\b(milk|chai|tea|coffee|kaapi|shake)\b/i, { key: "milk", name: "Milk", category: "dairy", ratio: 0.6, unit: "L" }],
  [/\bbanana|kela\b/i, { key: "banana", name: "Bananas", category: "produce", ratio: 1, unit: "pcs", per: 120 }],
  [/\bapple\b/i, { key: "apple", name: "Apples", category: "produce", ratio: 1, unit: "pcs", per: 180 }],
  [/\bpeanut butter\b/i, { key: "pb", name: "Peanut butter", category: "other", ratio: 1, unit: "g" }],
  [/\b(peanut|mungfali)\b/i, { key: "peanuts", name: "Peanuts", category: "other", ratio: 1, unit: "g" }],
];

export type DietKind = "veg" | "egg" | "nonveg" | "vegan" | "jain";

/** Protein staples to cover a weekly gap, best first, with protein per 100 g. */
const PROTEIN_FILL: { key: string; name: string; per100: number; unit: "g" | "pcs" | "kg"; per?: number; diets: DietKind[]; category: GroceryCategory }[] = [
  { key: "paneer", name: "Paneer", per100: 18, unit: "g", diets: ["veg", "egg", "nonveg", "jain"], category: "dairy" },
  { key: "soya", name: "Soya chunks", per100: 52, unit: "g", diets: ["veg", "egg", "nonveg", "vegan", "jain"], category: "protein" },
  { key: "eggs", name: "Eggs", per100: 13, unit: "pcs", per: 50, diets: ["egg", "nonveg"], category: "protein" },
  { key: "chicken", name: "Chicken breast", per100: 31, unit: "kg", diets: ["nonveg"], category: "protein" },
  { key: "greek", name: "Greek curd / hung curd", per100: 9, unit: "g", diets: ["veg", "egg", "nonveg", "jain"], category: "dairy" },
  { key: "chana", name: "Kala chana", per100: 20, unit: "g", diets: ["veg", "egg", "nonveg", "vegan", "jain"], category: "protein" },
];

function fmtQty(grams: number, unit: Buy["unit"], per?: number): string {
  if (unit === "pcs") return `${Math.max(1, Math.round(grams / (per ?? 100)))}`;
  if (unit === "pack") return `${Math.max(1, Math.ceil(grams / (per ?? 400)))} pack${Math.ceil(grams / (per ?? 400)) > 1 ? "s" : ""}`;
  if (unit === "L") return `~${Math.max(0.5, Math.round(grams / 500) / 2)} L`;
  if (unit === "kg" && grams >= 750) return `~${Math.round(grams / 250) / 4} kg`;
  return `~${Math.max(50, Math.round(grams / 50) * 50)} g`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

export function inPantry(name: string, pantry: PantryRow[]): boolean {
  const n = norm(name);
  return pantry.some((p) => {
    if (!p.in_stock) return false;
    const q = norm(p.name);
    if (!q) return false;
    return n === q || n.includes(q) || q.includes(n) || n.split(" ").some((w) => w.length > 3 && q.split(" ").includes(w));
  });
}

/**
 * The week's list. `eaten` is everything logged in the last `days` days (grams as eaten);
 * `proteinTarget` / `avgProtein` are per day. Sorted staples → protein → dairy → produce → other.
 */
export function groceryList(input: { eaten: EatenFood[]; days: number; proteinTarget: number; avgProtein: number; pantry: PantryRow[]; diet?: DietKind }): GroceryItem[] {
  const days = Math.max(1, input.days);
  const need = new Map<string, { buy: Buy; grams: number }>();
  for (const e of input.eaten) {
    const g = Number(e.grams) || 0;
    if (!(g > 0)) continue;
    const hit = MAP.find(([re]) => re.test(e.name));
    if (!hit) continue;
    const b = hit[1];
    const cur = need.get(b.key) ?? { buy: b, grams: 0 };
    cur.grams += g * b.ratio;
    need.set(b.key, cur);
  }
  const out: GroceryItem[] = [];
  for (const { buy, grams } of need.values()) {
    const week = (grams / days) * 7;
    if (week < 20) continue;
    out.push({ key: buy.key, name: buy.name, qty: fmtQty(week, buy.unit, buy.per), category: buy.category, why: "You eat this most weeks", inPantry: inPantry(buy.name, input.pantry) });
  }
  // Protein gap for the week.
  const gap = Math.round((input.proteinTarget - input.avgProtein) * 7);
  if (input.proteinTarget > 0 && gap >= 70) {
    const diet = input.diet ?? "veg";
    const fills = PROTEIN_FILL.filter((f) => f.diets.includes(diet)).slice(0, 2);
    for (const f of fills) {
      const grams = ((gap / fills.length) * 100) / f.per100;
      const existing = out.find((o) => o.key === f.key);
      const why = `Covers ~${Math.round(gap / fills.length)} g of your weekly protein gap`;
      if (existing) existing.why = `${existing.why} · ${why.toLowerCase()}`;
      else out.push({ key: f.key, name: f.name, qty: fmtQty(grams, f.unit, f.per), category: f.category, why, inPantry: inPantry(f.name, input.pantry) });
    }
  }
  if (!out.some((o) => o.category === "produce" && o.key === "veg")) out.push({ key: "veg", name: "Seasonal vegetables", qty: "~3 kg", category: "produce", why: "Fibre and micros, every week", inPantry: false });
  if (!out.some((o) => o.key === "fruit")) out.push({ key: "fruit", name: "Fruit", qty: "7", category: "produce", why: "One a day", inPantry: false });
  const ORDER: GroceryCategory[] = ["staples", "protein", "dairy", "produce", "other"];
  return out.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
}

/** The list as plain text for sharing / copying (in-pantry items left out). */
export function groceryText(list: GroceryItem[]): string {
  return list
    .filter((i) => !i.inPantry)
    .map((i) => `☐ ${i.name} — ${i.qty}`)
    .join("\n");
}

export const PANTRY_CATEGORIES: { key: GroceryCategory; label: string }[] = [
  { key: "staples", label: "Staples" },
  { key: "protein", label: "Protein" },
  { key: "dairy", label: "Dairy" },
  { key: "produce", label: "Fruit & veg" },
  { key: "other", label: "Other" },
];

/** A pantry item's category from its name (for rows the person adds by name). */
export function pantryCategory(name: string): GroceryCategory {
  const hit = MAP.find(([re]) => re.test(name));
  if (hit) return hit[1].category;
  if (/veg|onion|tomato|potato|aloo|spinach|palak|carrot|fruit|lemon|ginger|garlic|chilli/i.test(name)) return "produce";
  if (/oil|ghee|salt|sugar|masala|spice|jeera|haldi|tea|coffee/i.test(name)) return "other";
  return "other";
}
