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
};

export type Meal = {
  id: string;
  date: string;
  raw_text: string;
  created_at: string;
  items: MealItem[];
};

export type Profile = {
  weekly_workout_target: number;
  protein_target_g: number;
  calorie_target: number;
};

export type ParsedItem = MealItem & { input: string };
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

/** Result of scanning a packaged food's label (see /api/scan-label). */
export type LabelReport = {
  id?: string | null;
  product: string;
  readable: boolean;
  verdict: LabelVerdict;
  verdict_reason: string;
  per_100g?: Partial<Record<"calories" | "protein_g" | "carbs_g" | "sugar_g" | "fat_g" | "sodium_mg", number>>;
  serving_g?: number | null;
  protein?: { rating: "excellent" | "good" | "average" | "poor"; per_serving_g?: number | null; quality: string; note: string };
  concerns?: { ingredient: string; issue: string; severity: "low" | "medium" | "high" }[];
  claims?: { claim: string; status: "supported" | "misleading" | "false" | "unclear"; why: string }[];
  research?: string[];
  suggestions?: string[];
  alternatives?: string[];
  transcript?: string;
};

/** Derived macro targets, exactly as Android's Profile: fat 25% of kcal, carbs the remainder. */
export function fatTargetG(p: Profile) {
  return Math.trunc((p.calorie_target * 0.25) / 9);
}
export function carbTargetG(p: Profile) {
  return Math.max(0, Math.trunc((p.calorie_target - p.protein_target_g * 4 - fatTargetG(p) * 9) / 4));
}
