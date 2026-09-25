import type { BandLevel, Muscle } from "./muscles";
import type { AutoShareKind } from "./squadSharing";
import type { SourceInfo } from "./sourceInfo";
import type { FoodVariant } from "./variants";

export type { FoodVariant } from "./variants";
export type { SourceInfo, SourceLink } from "./sourceInfo";

export type Workout = {
  id: string;
  date: string;
  muscles: Muscle[];
  band_level: BandLevel;
  resistance_kg: number | null;
  minutes: number | null;
  exercises: string;
  notes: string;
  /** v2.5: what kind of session. Old rows are "bands". */
  kind?: WorkoutKind | null;
  /** v2.5: gym / bodyweight sets — [{ name, sets: [{ kg, reps }] }]. Same shape on Android. */
  exercises_json?: WorkoutExercise[] | null;
};

export type WorkoutKind = "gym" | "bodyweight" | "bands" | "cardio" | "sport" | "yoga";
export type WorkoutSet = { kg: number | null; reps: number };
export type WorkoutExercise = { name: string; sets: WorkoutSet[] };

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
  /** v2.4: cached picture (public Storage URL) — display only, never written to meal_items. */
  image_url?: string | null;
  /** v2.5: the one unit a count item is counted in ("1 roti", 40 g) — display only, lets the plate open the stepper. */
  serving_unit?: PresetServing | null;
  /** v2.9: "Which one?" options when the name is ambiguous (display only, never written to meal_items). */
  variants?: FoodVariant[];
  /** v2.9: where the numbers came from, for the ⓘ sheet (display only). */
  source_info?: SourceInfo | null;
};

export type Meal = {
  id: string;
  date: string;
  raw_text: string;
  created_at: string;
  photo_path?: string | null;
  items: MealItem[];
  /** v2.8: breakfast | lunch | dinner | snack (schema_v30). Null / missing → the hour rule (lib/mealType.ts). */
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | null;
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
  /** v2.4: the preset's picture (bandlog.food_presets.image_url), filled by the prewarm script. */
  image_url?: string | null;
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
  image_url?: string | null;
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
  /** v2.2: "<uid>/avatar.jpg?v=<ms>" in the public `avatars` bucket, or null (initials). */
  avatar_path: string | null;
  /** v2.3: micronutrient goals (null = the defaults, 30 g fibre / 50 g sugar). */
  fiber_target: number | null;
  sugar_target: number | null;
  /** v2.3: today's exercise burn widens the calorie goal. */
  add_burned_to_goal: boolean;
  /** v2.3: up to 200 kcal left over from yesterday carries into today. */
  rollover_calories: boolean;
  water_goal_ml: number;
  /** v2.4 Preferences → Tracking: how weights are shown (always stored in kg). */
  units: Units;
  /** v2.6: @handle for squads (lowercase a-z 0-9 _, 3–20), null until created. */
  username: string | null;
  /** v2.6 water: one glass in mL (the + / − step and the goal's "gl" unit). */
  water_glass_ml: number;
  /** v2.6 water reminder window "HH:MM" and interval (0 = never; 30/60/120/180/240). */
  water_reminder_from: string;
  water_reminder_to: string;
  water_reminder_every_min: number;
  /** v2.9 Squad sharing: kinds that auto-post (meal / workout / pr). null = schema_v31 not applied yet (everything posts). */
  auto_share: AutoShareKind[] | null;
  /** v2.10 Preferences → Tracking "Hide calorie numbers" (opt-in). null = schema_v34 not applied yet (off). */
  hide_numbers: boolean | null;
  /** v2.10 optional waist for waist-to-height; null = not entered (or schema_v34 not applied yet). */
  waist_cm: number | null;
};

export type Units = "metric" | "imperial";

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
  avatar_path: null,
  fiber_target: null,
  sugar_target: null,
  add_burned_to_goal: false,
  rollover_calories: false,
  water_goal_ml: 2500,
  units: "metric",
  auto_share: null,
  hide_numbers: null,
  waist_cm: null,
  username: null,
  water_glass_ml: 250,
  water_reminder_from: "08:00",
  water_reminder_to: "22:00",
  water_reminder_every_min: 0,
};

export const DEFAULT_FIBER_G = 30;
export const DEFAULT_SUGAR_G = 50;

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
  /** v2.3 Google-Fit-style details (all optional). */
  started_at?: string | null;
  intensity_pct?: number | null;
  distance_km?: number | null;
  steps?: number | null;
};

/** v2.3: one glass / bottle logged (`bandlog.water_log`). */
export type WaterVessel = "glass" | "bottle" | "large" | "custom";
export type WaterEntry = { id: string; date: string; ml: number; created_at: string; vessel?: WaterVessel | null };

/** v2.3: a progress photo with a short-lived signed URL. */
export type ProgressPhoto = { id: string; date: string; path: string; note: string; url: string | null };

/** v2.3: a row of `bandlog.public_groups()`. */
export type PublicSquad = { id: string; name: string; tagline: string | null; cover_url: string | null; member_count: number; joined: boolean; icon?: string | null; description?: string | null; join_policy?: JoinPolicy };

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
  /** v2.5: for count foods (roti, egg, glass of milk …) how many units — 1 unless the user said a number. */
  default_count?: number | null;
};
/** v2.7: plain water pulled out of the dictated text BEFORE the LLM ever sees it — see waterParse.ts. */
export type ParsedWater = { ml: number; glasses: number; phrase: string };
export type ParseResult = { items: ParsedItem[]; assumptions: string[]; unparsed: string[]; water?: ParsedWater | null };

/** A repeatable meal ("rice dal eggs whey") saved for one-tap logging. */
export type SavedMeal = {
  id: string;
  name: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  /** v2.4: picture of its biggest item. */
  image_url?: string | null;
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
  /** v2.2: scan-photos path of the 320 px thumbnail, and a signed URL for it on a stored scan. */
  thumb_path?: string | null;
  thumb_url?: string | null;
  barcode?: string | null;
  transcript?: string;
  /** v2.8: deterministic sanity-check flags from src/lib/ai/validate/label.ts — never blocks the scan. */
  validation?: { field: string; issue: string; suggestion: string }[];
  /** v2.9: where the numbers came from (label / Open Food Facts + research links) — optional. */
  source_info?: SourceInfo | null;
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
  /** v2.8: a plausible gram range for this portion, from the model — optional, older reports have none. */
  grams_low?: number | null;
  grams_high?: number | null;
  /** v2.8: what's uncertain about this item, e.g. "oil amount unclear". */
  uncertainties?: string[];
  /** v2.9: "Which one?" options when the name is ambiguous — optional, older reports have none. */
  variants?: FoodVariant[];
  /** v2.9: where the numbers came from, for the ⓘ sheet — optional. */
  source_info?: SourceInfo | null;
};

/** v2.8: one clarifying question the model can ask after a plate scan, with a fixed effect vocabulary
 *  the client applies deterministically (see src/lib/scanFollowUp.ts). Unknown effects are ignored. */
export type FollowUpEffect = "restaurant" | "homemade" | "add_ghee" | "no_oil" | "smaller" | "bigger";
export type FollowUp = { question: string; options: { label: string; effect: string }[] };

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
  /** v2.8: one optional clarifying question, shown as quick-reply chips. */
  follow_up?: FollowUp | null;
};

// ---- v2.0: squads ----

/** A squad the signed-in user belongs to. */
export type JoinPolicy = "open" | "request";

export type Squad = {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  created_at: string;
  /** v2.6 */
  description?: string | null;
  icon?: string | null;
  cover_url?: string | null;
  tagline?: string | null;
  is_public?: boolean | null;
  join_policy?: JoinPolicy | null;
  member_count?: number;
  /** v2.8: Squad Food Battle, owner-toggled. */
  battle_enabled?: boolean | null;
};

export type SquadPostKind = "message" | "meal" | "workout" | "pr" | "photo" | "challenge" | "battle";

// ---- v2.8: Squad Food Battle (see docs/food-battle-spec.md, src/lib/battle.ts) ----

/** One row of `bandlog.battle_board(g, d)`. */
export type BattleBoardRow = {
  user_id: string;
  name: string;
  avatar_path: string | null;
  goal_type: GoalType;
  eaten: number;
  target: number;
  r: number;
  score: number;
  meals: number;
  eligible: boolean;
  private: boolean;
};

/** `bandlog.battle_close(g, d)`'s result: null when the day isn't closeable yet or nobody won. */
export type BattleWinner = { user_id: string; name: string; score: number; goal_type: GoalType } | null;

/** One row of `bandlog.my_graffiti(u)` (profile's graffiti wall). */
export type GraffitiEntry = { total: number; group_id: string; group_name: string; date: string; score: number; goal_type: GoalType };

/** One row of `bandlog.group_feed(g, before, n, kinds)`; `photo_url` is signed server-side. */
export type SquadPost = {
  id: string;
  group_id: string;
  user_id: string;
  kind: SquadPostKind;
  body: string;
  ref_id: string | null;
  photo_path: string | null;
  photo_url?: string | null;
  created_at: string;
  author_name: string;
  author_username: string | null;
  author_avatar_path: string | null;
};

/** One row of `bandlog.group_leaderboard(g)`. */
export type LeaderRow = { rank: number; user_id: string; name: string; username: string | null; avatar_path: string | null; flames: number; week_points: number; is_owner: boolean };

// ---- v2.7: squad challenges ----

export type ChallengeKind = "train_days" | "protein_days" | "log_days";
/** Derived from the dates (Asia/Kolkata "today"), never stored. */
export type ChallengeStatus = "upcoming" | "active" | "ended";

/** One row of `bandlog.group_challenge_list(g)`. `leader_*` is the board's #1 (may have 0 progress). */
export type Challenge = {
  id: string;
  kind: ChallengeKind;
  title: string;
  target_days: number;
  protein_target: number | null;
  starts_on: string;
  ends_on: string;
  created_by: string;
  creator_name: string;
  status: ChallengeStatus;
  my_progress: number;
  leader_name: string | null;
  leader_progress: number;
  participants: number;
  completed_count: number;
  /** The board's #1 (appended to the RPC after the first draft of the spec). */
  leader_user_id: string | null;
};

/** One row of `bandlog.challenge_board(c)`. */
export type ChallengeBoardRow = {
  user_id: string;
  name: string;
  username: string | null;
  avatar_path: string | null;
  progress: number;
  completed: boolean;
  completed_on: string | null;
  rank: number;
};

/** One row of `bandlog.group_members_detail(g)`. */
export type SquadMemberDetail = { id: string; name: string; username: string | null; avatar_path: string | null; is_owner: boolean; flames: number; joined_at: string };

/** One row of `bandlog.group_requests(g)` (owner only). */
export type JoinRequest = { id: string; user_id: string; name: string; username: string | null; avatar_path: string | null; created_at: string };

/** `bandlog.group_by_code(code)`: the /join/<code> preview. */
export type SquadInvite = { id: string; name: string; description: string | null; icon: string | null; cover_url: string | null; tagline: string | null; is_public: boolean; join_policy: JoinPolicy; member_count: number; joined: boolean; requested: boolean };

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
  /** v2.2: same format as profiles.avatar_path; null shows initials. */
  avatar_path?: string | null;
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
  /** Best picture for the row: the scan's thumbnail (signed), the OFF pack shot, or the plate photo (signed). */
  image_url: string | null;
  image_path: string | null;
  /** v2.2: one line from the report ("A sweetened whey protein bar"), "" when there is none. */
  what_it_is: string;
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
