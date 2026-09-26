import type { DietMode } from "./dietModes";
import type { CheckinResult } from "./adaptive";

/** v2.13 shapes shared by the server reads (nutrition-data.ts) and the client screens. */

export type NutritionSettings = {
  /** False while schema_v36 isn't applied (the settings can't be saved yet). */
  available: boolean;
  diet_mode: DietMode;
  adaptive_targets: boolean;
  fasting_hours: number | null;
};

export const DEFAULT_SETTINGS: NutritionSettings = { available: false, diet_mode: "balanced", adaptive_targets: false, fasting_hours: null };

export type FastSession = { id: string; started_at: string; ended_at: string | null; target_hours: number; note: string | null };

export type CheckinRow = {
  id: string;
  week_start: string;
  avg_weight_kg: number | null;
  trend_kg_per_week: number | null;
  avg_kcal: number | null;
  old_target: number | null;
  new_target: number | null;
  reason: string;
  applied: boolean;
};

export type CheckinState = {
  available: boolean;
  /** This week's stored check-in (created on the first open on / after Monday). */
  row: CheckinRow | null;
  /** When there isn't enough data: what's missing (nothing is stored then). */
  pending: Extract<CheckinResult, { ok: false }> | null;
};
