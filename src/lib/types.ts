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
  source: "table" | "estimated" | "scan";
  confidence: number | null;
  micros?: ItemMicros;
  /** v1.9: how the quantity was entered — "g" | "ml" | "kg" | "serving" — and how many servings that was. */
  unit?: string | null;
  servings?: number | null;
  /** v1.9: the fat preset id this dish was cooked in (the fat itself is a separate item). */
  cooked_in?: string | null;
};

export type Meal = {
  id: string;
  date: string;
  raw_text: string;
  created_at: string;
  photo_path?: string | null;
  items: MealItem[];
};

export type Gender = "male" | "female" | "other";
export type GoalType = "lose" | "maintain" | "gain";
/** Profile → Preferences → "Judge scans for". `goal` follows the weight goal (lose → cutting, gain → bulking, else protein). */
export type LensDefault = "protein" | "goal" | "snack" | "cutting" | "bulking";
export const LENS_DEFAULTS: { key: LensDefault; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "goal", label: "My goal" },
  { key: "snack", label: "Snack" },
  { key: "cutting", label: "Cutting" },
  { key: "bulking", label: "Bulking" },
];

/** A one-tap Indian food preset (bandlog.food_presets) joined to its foods row. Per-100 g numbers come from the food. */
export type PresetServing = { label: string; grams: number };
export type PresetCategory = "breakfast" | "staple" | "dal" | "sabzi" | "protein" | "snack" | "drink" | "sweet" | "fruit" | "fat" | "restaurant";
export type FoodPreset = {
  id: string;
  food_id: string;
  label: string;
  label_hi: string | null;
  category: PresetCategory;
  servings: PresetServing[];
  default_serving: string | null;
  sort: number;
  icon: string | null;
  /** From the joined foods row. */
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micros: Record<string, number>;
};

/** A row of bandlog.foods as the food picker sees it (search_foods RPC, per 100 g). */
export type FoodSearchHit = {
  id: string;
  name: string;
  name_hi: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  units: PresetServing[];
  micros: Record<string, number>;
  score: number;
};

/** One of the five meal reminders stored in `profiles.reminders`. */
export type ReminderPref = { on: boolean; time: string };

/** The full `bandlog.profiles` row, mirroring Android's `data.Profile`. */
export type Profile = {
  weekly_workout_target: number;
  protein_target_g: number;
  calorie_target: number;
  name: string;
  /** ISO yyyy-MM-dd. */
  dob: string | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  goal_type: GoalType;
  goal_speed_kg_wk: number;
  step_goal: number;
  /** Explicit macro goals; null falls back to the derived formula. */
  carb_target_g: number | null;
  fat_target_g: number | null;
  reminders: Record<string, ReminderPref>;
  /** v1.9: the lens a scan report opens on. */
  lens_default: LensDefault;
  /** Squads: share protein & calories with squad-mates, or streaks only. */
  share_stats: boolean;
};

export const DEFAULT_PROFILE: Profile = {
  weekly_workout_target: 3,
  protein_target_g: 120,
  calorie_target: 2200,
  name: "",
  dob: null,
  gender: null,
  height_cm: null,
  weight_kg: null,
  goal_weight_kg: null,
  goal_type: "maintain",
  goal_speed_kg_wk: 0.5,
  step_goal: 8000,
  carb_target_g: null,
  fat_target_g: null,
  reminders: {},
  lens_default: "protein",
  share_stats: true,
};

/** One row of `bandlog.weight_log`, newest first. */
export type WeightEntry = {
  id: string;
  date: string;
  weight_kg: number;
  note: string;
};

/** One row of `bandlog.activities` — a MET-table entry the user can log against. */
export type Activity = {
  code: string;
  name: string;
  description: string;
  met: number;
  category: string;
  tags: string[];
};

/** One row of `bandlog.exercise_log`: a burn the user logged (or a band workout wrote for them). */
export type ExerciseEntry = {
  id: string;
  date: string;
  activity_code: string | null;
  name: string;
  minutes: number;
  intensity: "low" | "medium" | "high";
  kcal: number;
  source: "manual" | "workout" | "health" | "describe";
  /** For source=workout this holds the workout id so a delete can find its row. */
  note: string;
  created_at: string;
};

/** One activity Haiku pulled out of a free-text description (see /api/describe-exercise). */
export type DescribedExercise = {
  activity_code: string | null;
  name: string;
  minutes: number;
  intensity: "low" | "medium" | "high";
  met: number;
  kcal: number;
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

/** The lens a report should open on for this profile: `goal` follows the weight goal. */
export function initialLens(p: Pick<Profile, "lens_default" | "goal_type">): Lens {
  const d = p.lens_default ?? "protein";
  if (d !== "goal") return d;
  return p.goal_type === "lose" ? "cutting" : p.goal_type === "gain" ? "bulking" : "protein";
}
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
  /** v2.0: "restaurant" when the portion was scaled up and the hidden oil added. */
  cooked_in?: string | null;
};

export type PlateEstimate = {
  id?: string | null;
  items: PlateItem[];
  /** The model's own numbers before the database cross-check. */
  raw: { items: PlateItem[] };
  notes: string[];
  plate_note: string;
  photo_path?: string | null;
  /** v2.0: "restaurant" when the note or the plate description said it was eaten out. */
  portion_hint?: "restaurant" | null;
};

// ---- v2.0: squads ----

/** A squad the signed-in user belongs to. */
export type Squad = { id: string; name: string; code: string; owner_id: string; created_at: string };

/** One day of a member's rollup (bandlog.daily_stats); numbers are null when they share streaks only. */
export type SquadDay = {
  date: string;
  trained: boolean;
  week_streak: number;
  protein_g: number | null;
  calories: number | null;
  burned: number | null;
  meals: number | null;
};

/** One row of `bandlog.squad_board(g)`. */
export type SquadMember = {
  user_id: string;
  name: string;
  share_stats: boolean;
  is_owner: boolean;
  joined_at: string;
  days: SquadDay[];
};

/** A nudge sent to the signed-in user in the last 24 h (`bandlog.my_nudges()`). */
export type Nudge = { id: string; group_id: string; group_name: string; from_user: string; from_name: string; kind: string; created_at: string };

/** The 9 pm daily wrap (see lib/wrap.ts and Android's util/Wrap.kt). */
export type Wrap = {
  date: string;
  protein: number;
  proteinTarget: number;
  proteinHit: boolean;
  calories: number;
  calorieBudget: number;
  burned: number;
  sessions: number;
  sessionTarget: number;
  tomorrow: string;
  bestMeal: { name: string; protein: number } | null;
  /** One line, the same as the Android notification. */
  line: string;
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

/** Macro targets, exactly as Android's Profile: explicit if set, else fat 25% of kcal and carbs the remainder. */
export function fatTargetG(p: Profile) {
  return p.fat_target_g ?? Math.trunc((p.calorie_target * 0.25) / 9);
}
export function carbTargetG(p: Profile) {
  return p.carb_target_g ?? Math.max(0, Math.trunc((p.calorie_target - p.protein_target_g * 4 - fatTargetG(p) * 9) / 4));
}

/** Whole years from `dob`, or null when no birthday is set (Android's `Profile.age`). */
export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 1 && age <= 120 ? age : null;
}
