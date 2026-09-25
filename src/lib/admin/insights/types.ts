/**
 * Shared shapes for the /admin insights layer.
 *
 * `Dataset` is the raw, server-only input (rows as read from bandlog, bounded to the last 90 days).
 * Everything the pure metric functions return is a plain JSON-serialisable view model: no Maps,
 * Sets or Dates, so a page (or a future client chart) can take it as-is.
 */

export type EventRow = {
  user_id: string;
  name: string;
  props: Record<string, unknown>;
  platform: string | null;
  app_version: string | null;
  created_at: string;
};

export type AuthUserRow = { id: string; email: string; created_at: string; last_sign_in_at: string | null };

/** The profile columns the insights read. `dob` is only ever turned into an age band. */
export type ProfileRow = {
  id: string;
  username: string;
  name: string;
  dob: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  goal_type: string | null;
  goal_weight_kg: number | null;
  goal_speed_kg_wk: number | null;
  calorie_target: number | null;
  protein_target_g: number | null;
  carb_target_g: number | null;
  fat_target_g: number | null;
  water_goal_ml: number | null;
  step_goal: number | null;
  weekly_workout_target: number | null;
};

export type MealRow = { id: string; user_id: string; date: string; meal_type: string | null; has_photo: boolean; created_at: string };
export type MealItemRow = { user_id: string; meal_id: string; date: string; name: string; calories: number; protein_g: number };
export type DatedRow = { user_id: string; date: string; created_at: string };
export type WorkoutRow = DatedRow & { kind: string };
export type ExerciseRow = DatedRow & { source: string; name: string };
export type ScanRow = { user_id: string; kind: string; created_at: string };
export type PostRow = { id: string; user_id: string; group_id: string; kind: string; created_at: string };
export type ReactionRow = { post_id: string; user_id: string; post_author: string; created_at: string };
export type ReadRow = { user_id: string; group_id: string; last_read_at: string };
export type ChallengeRow = { user_id: string; created_at: string };
export type MemberRow = { user_id: string; group_id: string; joined_at: string };

export type Dataset = {
  /** IST "today" the data was read for, yyyy-MM-dd. */
  today: string;
  /** First IST day of the window (today − 89). */
  since: string;
  users: AuthUserRow[];
  profiles: ProfileRow[];
  events: EventRow[];
  eventsAvailable: boolean;
  meals: MealRow[];
  items: MealItemRow[];
  workouts: WorkoutRow[];
  exercises: ExerciseRow[];
  water: DatedRow[];
  weight: DatedRow[];
  scans: ScanRow[];
  posts: PostRow[];
  reactions: ReactionRow[];
  reads: ReadRow[];
  challenges: ChallengeRow[];
  battles: DatedRow[];
  members: MemberRow[];
  /** Per-table read errors (missing table/column), shown on the page instead of failing it. */
  errors: { table: string; message: string }[];
};

export type Source = "event" | "table";

/** One use of one feature by one user. `at` is a timestamp; `day` its IST day. */
export type Use = { user: string; feature: string; at: string; day: string; source: Source };

/** user id → set of IST days that user did anything (any event or any logged row). Internal only. */
export type ActiveDays = Map<string, Set<string>>;
