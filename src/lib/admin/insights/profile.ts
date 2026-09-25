import { needsOnboarding } from "../../onboarding";
import type { Profile } from "../../types";
import type { ProfileRow } from "./types";

/**
 * Profile summary for the admin views. The date of birth is reduced to an age band here and
 * never leaves this module: no view model carries `dob`.
 */

export const AGE_BANDS = ["under 18", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export function ageOn(dob: string, today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!m || !t) return null;
  let age = Number(t[1]) - Number(m[1]);
  if (t[2] + t[3] < m[2] + m[3]) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function ageBand(dob: string | null | undefined, today: string): AgeBand | null {
  if (!dob) return null;
  const a = ageOn(dob, today);
  if (a == null) return null;
  if (a < 18) return "under 18";
  if (a < 25) return "18–24";
  if (a < 35) return "25–34";
  if (a < 45) return "35–44";
  if (a < 55) return "45–54";
  if (a < 65) return "55–64";
  return "65+";
}

export type ProfileSummary = {
  username: string;
  name: string;
  ageBand: AgeBand | null;
  onboarded: boolean;
  goal: string;
  targets: { label: string; value: string }[];
};

const GOALS: Record<string, string> = { lose: "Lose weight", maintain: "Maintain", gain: "Gain weight" };

export function isOnboarded(p: ProfileRow | undefined): boolean {
  return !!p && !needsOnboarding(p as unknown as Profile);
}

export function profileSummary(p: ProfileRow | undefined, today: string): ProfileSummary {
  if (!p) return { username: "", name: "", ageBand: null, onboarded: false, goal: "—", targets: [] };
  const t: { label: string; value: string }[] = [];
  const add = (label: string, v: number | null | undefined, unit: string) => {
    if (v != null && Number.isFinite(Number(v))) t.push({ label, value: `${Number(v)}${unit}` });
  };
  add("Calories", p.calorie_target, " kcal");
  add("Protein", p.protein_target_g, " g");
  add("Carbs", p.carb_target_g, " g");
  add("Fat", p.fat_target_g, " g");
  add("Water", p.water_goal_ml, " mL");
  add("Steps", p.step_goal, "");
  add("Workouts / week", p.weekly_workout_target, "");
  const g = GOALS[p.goal_type ?? ""] ?? (p.goal_type || "—");
  const goal = p.goal_type && p.goal_type !== "maintain" && p.goal_weight_kg != null ? `${g} → ${p.goal_weight_kg} kg${p.goal_speed_kg_wk ? ` at ${p.goal_speed_kg_wk} kg/wk` : ""}` : g;
  return { username: p.username, name: p.name, ageBand: ageBand(p.dob, today), onboarded: isOnboarded(p), goal, targets: t };
}

/** Display handle for a user in insights: @username, else name, else a short id. */
export function userLabel(id: string, p: Pick<ProfileRow, "username" | "name"> | undefined): string {
  if (p?.username) return `@${p.username}`;
  if (p?.name) return p.name;
  return `user ${id.slice(0, 8)}`;
}
