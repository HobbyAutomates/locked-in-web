import type { Profile } from "./types";
import { ageYears, isTeen, macrosFor, proteinTargetG, todayIso, type Targets } from "./goals";

/**
 * v2.13 diet modes (`profiles.diet_mode`, schema_v36), spec §4. Pure, so scripts/check-nutrition.ts
 * runs it and Android's util/DietModes.kt can port it line for line.
 *
 * Protein is g per kg of the same body weight goals.ts uses (the current weight). Carbs and fat are
 * worked out from the calories left after protein: most modes keep the app's default (fat 25 % of
 * calories, carbs the rest); keto caps carbs at 50 g, low-carb at 26 % of calories (never over 130 g),
 * Mediterranean sets fat to 35 %. Switching a mode never changes calories.
 *
 * Food filters only shape suggestions (what-to-eat, quick picks, menu best pick). They never block
 * logging.
 */

export type DietMode = "balanced" | "high_protein" | "vegetarian" | "eggetarian" | "vegan" | "jain" | "keto" | "low_carb" | "mediterranean";

export type DietModeInfo = {
  key: DietMode;
  label: string;
  /** One line under the name in the picker. */
  short: string;
  /** Can't be picked under 18. */
  adultsOnly: boolean;
  /** "The science": the 1-2 line rationale and its source. */
  science: string;
  source: string;
  /** Shown in the confirm step (keto only today). */
  warning?: string;
};

export const DIET_MODES: DietModeInfo[] = [
  {
    key: "balanced",
    label: "Balanced",
    short: "The app's default split",
    adultsOnly: false,
    science: "Protein from your training and age, fat about a quarter of your calories, carbs the rest. The everyday pattern Indian dietary guidelines recommend.",
    source: "ICMR-NIN Dietary Guidelines for Indians and RDA (2020)",
  },
  {
    key: "high_protein",
    label: "High protein",
    short: "2 g per kg, for lifting and cutting",
    adultsOnly: false,
    science: "More protein helps you keep and build muscle when you train hard or eat a little less. 2 g/kg is the top of the range for active adults; under 18 it stays at 1.6 g/kg.",
    source: "ISSN position stand: protein and exercise (Jäger et al., 2017): 1.4–2.0 g/kg/day",
  },
  {
    key: "vegetarian",
    label: "Vegetarian",
    short: "No meat, fish or egg",
    adultsOnly: false,
    science: "Dal, paneer, curd, soya and milk cover protein well when you eat a mix of them through the day. 1.6 g/kg keeps it on target.",
    source: "ICMR-NIN 2020; Academy of Nutrition and Dietetics position on vegetarian diets (2016)",
  },
  {
    key: "eggetarian",
    label: "Eggetarian",
    short: "Vegetarian plus eggs",
    adultsOnly: false,
    science: "Eggs add a cheap, complete protein to a vegetarian plate. 1.6 g/kg keeps protein on target.",
    source: "ICMR-NIN 2020",
  },
  {
    key: "vegan",
    label: "Vegan",
    short: "No animal foods, dairy, ghee or honey",
    adultsOnly: false,
    science: "Plant proteins digest a little less completely, so the target is 10–15 % higher: 1.8 g/kg. Mix dals, soya, tofu, nuts and grains.",
    source: "Academy of Nutrition and Dietetics position on vegetarian diets (Melina et al., 2016)",
  },
  {
    key: "jain",
    label: "Jain",
    short: "Vegetarian, no roots or tubers",
    adultsOnly: false,
    science: "No onion, garlic, potato, carrot, beetroot, radish, ginger or other roots, and no honey. Dals, paneer, curd and grains carry the protein at 1.6 g/kg.",
    source: "ICMR-NIN 2020",
  },
  {
    key: "keto",
    label: "Keto",
    short: "Carbs under 50 g a day. Adults only",
    adultsOnly: true,
    science: "Very low carb (under 50 g a day), with fat making up the rest of your calories and protein at 1.6 g/kg. It works for some people, but it's hard to keep up.",
    source: "Low-carbohydrate diet definitions (Feinman et al., Nutrition 2015)",
    warning: "Not for pregnancy, type 1 diabetes, or anyone on diabetes or blood-pressure medicines without a doctor's OK.",
  },
  {
    key: "low_carb",
    label: "Low carb",
    short: "Carbs about a quarter of calories. Adults only",
    adultsOnly: true,
    science: "Carbs at 26 % of calories (never over 130 g), fat the rest, protein 1.8 g/kg. The standard definition of a low-carb diet.",
    source: "Feinman et al., Nutrition 2015",
  },
  {
    key: "mediterranean",
    label: "Mediterranean",
    short: "More healthy fats, fish and nuts",
    adultsOnly: false,
    science: "About 35 % of calories from fat, mostly oils, nuts and fish, with plenty of vegetables and legumes. Protein at least 1.2 g/kg.",
    source: "PREDIMED trial (Estruch et al., NEJM 2018)",
  },
];

export const TEEN_MODES: DietMode[] = ["balanced", "high_protein", "vegetarian", "eggetarian", "vegan", "jain"];
export const NOT_FOR_TEENS = "Not recommended under 18";

export function isDietMode(x: unknown): x is DietMode {
  return typeof x === "string" && DIET_MODES.some((m) => m.key === x);
}

export function dietModeInfo(mode: DietMode): DietModeInfo {
  return DIET_MODES.find((m) => m.key === mode) ?? DIET_MODES[0];
}

/** Whether `mode` can be picked at `age` (null age = unknown, treated as an adult like goals.ts). */
export function modeAllowed(mode: DietMode, age: number | null | undefined): boolean {
  return !isTeen(age) || TEEN_MODES.includes(mode);
}

/** The mode the maths uses: an under-18 account holding an adults-only mode counts as balanced. */
export function effectiveDietMode(mode: DietMode | null | undefined, age: number | null | undefined): DietMode {
  const m = isDietMode(mode) ? mode : "balanced";
  return modeAllowed(m, age) ? m : "balanced";
}

/** g/kg per mode; null = balanced (goals.ts decides). */
export function proteinPerKg(mode: DietMode, teen: boolean): number | null {
  switch (mode) {
    case "balanced":
      return null;
    case "high_protein":
      return teen ? 1.6 : 2.0;
    case "vegan":
    case "low_carb":
      return 1.8;
    case "mediterranean":
      return 1.2;
    default:
      return 1.6;
  }
}

export const KETO_CARBS_G = 50;
export const LOW_CARB_PCT = 0.26;
export const LOW_CARB_MAX_G = 130;

/**
 * Macro targets for `calories` in `mode`. Calories are never changed. Protein: the mode's g/kg of
 * the current weight (Mediterranean: at least 1.2 g/kg, never under the balanced amount); balanced
 * uses goals.ts. Without weight, age or sex the current protein target is kept.
 */
export function dietTargets(p: Profile, calories: number, mode: DietMode, today: string = todayIso()): Targets {
  const age = ageYears(p.dob, today);
  const m = effectiveDietMode(mode, age);
  const teen = isTeen(age);
  const kg = p.weight_kg && p.weight_kg > 0 ? p.weight_kg : null;
  const kcal = Math.max(0, Math.round(calories));
  const balanced = kg != null && age != null ? proteinTargetG(age, kg, p.gender, p.weekly_workout_target) : p.protein_target_g;
  const perKg = proteinPerKg(m, teen);
  let protein = perKg == null || kg == null ? balanced : Math.round(perKg * kg);
  if (m === "mediterranean" && kg != null) protein = Math.max(protein, balanced);
  // Protein can never take more than the whole budget.
  protein = Math.max(0, Math.min(protein, Math.floor(kcal / 4)));
  const left = kcal - protein * 4;
  if (m === "keto" || m === "low_carb") {
    const cap = m === "keto" ? KETO_CARBS_G : Math.min(LOW_CARB_MAX_G, Math.round((kcal * LOW_CARB_PCT) / 4));
    const carbs = Math.max(0, Math.min(cap, Math.floor(left / 4)));
    const fat = Math.max(0, Math.round((left - carbs * 4) / 9));
    return { calories: kcal, protein, carbs, fat };
  }
  if (m === "mediterranean") {
    const fat = Math.min(Math.round((kcal * 0.35) / 9), Math.floor(left / 9));
    const carbs = Math.max(0, Math.round((left - fat * 9) / 4));
    return { calories: kcal, protein, carbs, fat };
  }
  // balanced, high_protein and the food-pattern modes: fat 25 %, carbs the rest (goals.macrosFor).
  return macrosFor(kcal, protein);
}

// ---------------------------------------------------------------- food filters

/** Word lists matched against food names (lower-case, whole words or word starts). */
const MEAT = ["chicken", "mutton", "lamb", "goat", "beef", "pork", "keema", "kheema", "bacon", "ham", "sausage", "salami", "pepperoni", "turkey", "duck", "meat", "murgh", "gosht", "tangdi", "tandoori chicken", "nihari", "haleem", "shawarma", "liver", "kaleji", "seekh", "galouti", "boti", "kebab"];
const FISH = ["fish", "prawn", "prawns", "shrimp", "crab", "lobster", "tuna", "salmon", "rohu", "pomfret", "surmai", "bangda", "mackerel", "sardine", "hilsa", "ilish", "anchovy", "squid", "calamari", "seafood", "machli", "machhi", "jhinga", "katla", "basa", "tilapia", "mussel", "oyster", "clam"];
const EGG = ["egg", "eggs", "omelette", "omelet", "anda", "ande", "frittata", "mayonnaise", "mayo", "eggnog", "shakshuka"];
const DAIRY = ["milk", "paneer", "curd", "dahi", "yogurt", "yoghurt", "ghee", "butter", "cheese", "cream", "khoya", "khoa", "mawa", "lassi", "raita", "kheer", "chaas", "buttermilk", "whey", "ice cream", "rabri", "rabdi", "rasgulla", "rasmalai", "gulab jamun", "kulfi", "shrikhand", "malai", "milkshake", "shake", "chai", "latte", "cappuccino", "kalakand", "sandesh", "peda", "burfi", "barfi", "halwa", "payasam", "basundi", "makhani", "tikka masala", "korma", "dudh", "doodh", "chhena", "chena", "custard", "pudding"];
/** "peanut butter", "coconut milk" … aren't dairy. */
const NOT_DAIRY = ["peanut butter", "almond butter", "nut butter", "cocoa butter", "coconut milk", "almond milk", "soy milk", "soya milk", "oat milk", "rice milk", "vegan", "coconut cream", "cashew milk"];
const HONEY = ["honey", "shahad"];
const JAIN_ROOTS = ["onion", "pyaz", "pyaaz", "kanda", "garlic", "lahsun", "lehsun", "lasun", "potato", "potatoes", "aloo", "alu", "batata", "carrot", "carrots", "gajar", "beetroot", "beet", "radish", "mooli", "ginger", "adrak", "sweet potato", "shakarkandi", "yam", "suran", "jimikand", "arbi", "colocasia", "turnip", "shalgam", "tuber", "samosa", "vada pav", "pav bhaji", "masala dosa", "french fries", "fries", "potato chips", "tikki", "hash brown", "leek", "spring onion", "scallion"];

function hasWord(name: string, words: string[]): boolean {
  return words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^a-z]|$)`).test(name));
}

/** What a mode leaves out, as the word "groups" that are checked. */
function excluded(mode: DietMode): { meat: boolean; fish: boolean; egg: boolean; dairy: boolean; honey: boolean; roots: boolean } {
  const veg = mode === "vegetarian" || mode === "jain";
  return {
    meat: veg || mode === "eggetarian" || mode === "vegan",
    fish: veg || mode === "eggetarian" || mode === "vegan",
    egg: veg || mode === "vegan",
    dairy: mode === "vegan",
    honey: mode === "vegan" || mode === "jain",
    roots: mode === "jain",
  };
}

/** Why `name` doesn't fit `mode` ("meat", "egg", …); empty when it fits. Name matching only. */
export function dietConflicts(mode: DietMode, name: string): string[] {
  const n = ` ${name.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  const x = excluded(mode);
  const out: string[] = [];
  // "Veg biryani" / "veg momos" name themselves; a bare "veg" wins over the dish's usual meat.
  const saysVeg = /\b(veg|veggie|vegetable|vegetarian|paneer|soya|tofu|mushroom|dal|hara bhara|chana|rajma|corn|palak)\b/.test(n) && !/\bnon veg\b/.test(n);
  if (x.meat && hasWord(n, MEAT) && !(saysVeg && !/\b(chicken|mutton|lamb|beef|pork|keema|fish|prawn)\b/.test(n))) out.push("meat");
  if (x.fish && hasWord(n, FISH)) out.push("fish");
  if (x.egg && hasWord(n, EGG) && !/\beggless\b/.test(n)) out.push("egg");
  if (x.dairy && hasWord(n, DAIRY) && !NOT_DAIRY.some((w) => n.includes(w))) out.push("dairy");
  if (x.honey && hasWord(n, HONEY)) out.push("honey");
  if (x.roots && hasWord(n, JAIN_ROOTS)) out.push("roots");
  return out;
}

export function foodAllowed(mode: DietMode, name: string): boolean {
  return dietConflicts(mode, name).length === 0;
}
