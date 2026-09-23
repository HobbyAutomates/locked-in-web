import type { BandLevel, Muscle } from "./muscles";

export type Workout = {
  id: string;
  date: string;
  muscles: Muscle[];
  band_level: BandLevel;
  resistance_kg: number | null;
  minutes: number | null;
  exercises: string;
  notes: string;
};

/** Per-item micronutrients, already scaled to the item's grams. */
export type ItemMicros = Partial<Record<"fiber_g" | "sugar_g" | "sodium_mg" | "iron_mg" | "calcium_mg" | "vitamin_c_mg" | "vitamin_a_ug" | "potassium_mg" | "magnesium_mg" | "zinc_mg" | "b12_ug" | "folate_ug", number>>;

export type MealItem = {
  id?: string;
  food_id: string | null;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "table" | "estimated";
  confidence: number | null;
  micros?: ItemMicros;
};

export type Meal = {
  id: string;
  date: string;
  raw_text: string;
  created_at: string;
  photo_path?: string | null;
  items: MealItem[];
};

export type Profile = {
  weekly_workout_target: number;
  protein_target_g: number;
  calorie_target: number;
};

export type ParsedItem = MealItem & {
  input: string;
  /** "table" when the numbers came from bandlog.foods, "estimated" when Haiku guessed. */
  matched_from?: "table" | "estimated";
};
export type ParseResult = { items: ParsedItem[]; assumptions: string[]; unparsed: string[] };

/** A repeatable meal ("rice dal eggs whey") saved for one-tap logging. */
export type SavedMeal = {
  id: string;
  name: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
};

export type LabelVerdict = "safe" | "caution" | "unsafe" | "misleading" | "fake";
export type Lens = "protein" | "snack" | "cutting" | "bulking";
export type FitVerdict = "great" | "ok" | "weak";
export type Fit = { verdict: FitVerdict; why: string };

/** Result of scanning a packaged food's label or barcode (see /api/scan-label, /api/scan-barcode). */
export type LabelReport = {
  id?: string | null;
  kind?: "label" | "barcode";
  lens?: Lens;
  product: string;
  readable: boolean;
  what_it_is?: string;
  /** Safety / authenticity only — shown as "Trust". */
  verdict: LabelVerdict;
  verdict_reason: string;
  fits?: Partial<Record<Lens, Fit>>;
  per_100g?: Partial<Record<"calories" | "protein_g" | "carbs_g" | "sugar_g" | "fat_g" | "fiber_g" | "sodium_mg", number>>;
  serving_g?: number | null;
  protein?: { rating: "excellent" | "good" | "average" | "poor"; per_serving_g?: number | null; quality: string; note: string };
  concerns?: { ingredient: string; issue: string; severity: "low" | "medium" | "high" }[];
  claims?: { claim: string; status: "supported" | "misleading" | "false" | "unclear"; why: string }[];
  research?: string[];
  suggestions?: string[];
  alternatives?: string[];
  infographic?: {
    serving_share: { protein_pct: number; carbs_pct: number; fat_pct: number; calories_pct: number };
    sugar_teaspoons_per_serving: number;
    sodium_pct_of_2000mg: number;
    score_out_of_10: number;
    one_liner: string;
    eat_it: "yes" | "sometimes" | "skip";
  };
  image_url?: string | null;
  barcode?: string | null;
  transcript?: string;
};

/** One detected item on a food photo (see /api/photo-meal). */
export type PlateItem = {
  name: string;
  grams: number;
  confidence: "high" | "medium" | "low";
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micros: ItemMicros;
  source: "table" | "estimated";
  food_id: string | null;
};

export type PlateEstimate = {
  id?: string | null;
  items: PlateItem[];
  /** The model's own numbers before the database cross-check. */
  raw: { items: PlateItem[] };
  notes: string[];
  plate_note: string;
  photo_path?: string | null;
};

/** A row of the Scan tab's History list. */
export type ScanHistoryItem = {
  id: string;
  kind: "label" | "barcode" | "photo";
  lens: string;
  product: string;
  verdict: string;
  created_at: string;
  score: number | null;
  image_url: string | null;
  image_path: string | null;
};

/** Derived macro targets, exactly as Android's Profile: fat 25% of kcal, carbs the remainder. */
export function fatTargetG(p: Profile) {
  return Math.trunc((p.calorie_target * 0.25) / 9);
}
export function carbTargetG(p: Profile) {
  return Math.max(0, Math.trunc((p.calorie_target - p.protein_target_g * 4 - fatTargetG(p) * 9) / 4));
}
