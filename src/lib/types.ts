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
