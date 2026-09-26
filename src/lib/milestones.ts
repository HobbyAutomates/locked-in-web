import { addDays } from "./dates";
import { exerciseHistory, loggedExercises } from "./e1rm";
import type { Workout } from "./types";

/**
 * v2.14 "Milestone flood" (canvas "Ember is earned", idea 01): the whole screen turns ember only
 * for real moments: a 7 / 30 / 100-day streak, the goal weight reached, or a PR. Each fires once
 * (keys in profiles.milestones_seen, schema_v37, and in local storage as the fallback). Pure, so
 * scripts/check-milestones.ts runs it and Android ports it.
 */

export type Milestone = { key: string; eyebrow: string; big: string; line: string; sub: string; share: "streak" | "goal" | "pr" };

export const STREAK_STEPS = [7, 30, 100] as const;
/** A streak milestone only floods in its first week; an older streak just marks it seen. */
export const STREAK_WINDOW = 7;

export type MilestoneInput = {
  today: string;
  dayStreak: number;
  weightKg: number | null;
  goalWeightKg: number | null;
  goalType: "lose" | "gain" | "maintain";
  workouts: Pick<Workout, "id" | "date" | "exercises_json">[];
};

const LINES: Record<number, string> = { 7: "One week. Locked in.", 30: "A month of showing up.", 100: "Triple digits. Unreal." };

/** Every milestone that's true right now, most special first, plus older streak keys to mark seen silently. */
export function currentMilestones(i: MilestoneInput): { fire: Milestone[]; silent: string[] } {
  const fire: Milestone[] = [];
  const silent: string[] = [];
  if (i.goalWeightKg != null && i.weightKg != null && i.goalType !== "maintain") {
    const hit = i.goalType === "lose" ? i.weightKg <= i.goalWeightKg : i.weightKg >= i.goalWeightKg;
    if (hit) fire.push({ key: `goal_reached:${i.goalWeightKg}`, eyebrow: "Goal reached", big: `${i.goalWeightKg}`, line: "kg. You said it, you did it.", sub: "Pick your next goal when you're ready.", share: "goal" });
  }
  const since = addDays(i.today, -2);
  for (const ex of loggedExercises(i.workouts)) {
    const h = exerciseHistory(i.workouts, ex.name);
    const last = [...h.points].reverse().find((p) => p.pr && p.date >= since);
    if (!last) continue;
    const value = h.weighted && last.best.kg != null ? `${last.best.kg} kg` : `${last.best.reps}`;
    fire.push({ key: `pr:${ex.name.toLowerCase()}:${last.date}`, eyebrow: `New PR · ${ex.name}`, big: value.replace(" kg", ""), line: h.weighted && last.best.kg != null ? `kg × ${last.best.reps}. Personal record.` : "reps. Personal record.", sub: "Strongest you've ever been at this.", share: "pr" });
  }
  for (const n of [...STREAK_STEPS].reverse()) {
    if (i.dayStreak < n) continue;
    if (i.dayStreak < n + STREAK_WINDOW) fire.push({ key: `streak_${n}`, eyebrow: "Milestone", big: String(n), line: "days locked in.", sub: LINES[n], share: "streak" });
    else silent.push(`streak_${n}`);
  }
  // A 30-day flood makes the 7-day one pointless: mark lower steps seen with it.
  const top = fire.find((m) => m.key.startsWith("streak_"));
  if (top) for (const n of STREAK_STEPS) if (n < Number(top.key.slice(7)) && !silent.includes(`streak_${n}`)) silent.push(`streak_${n}`);
  return { fire, silent };
}

/** The one milestone to show now (first unseen), or null. */
export function nextMilestone(i: MilestoneInput, seen: Iterable<string>): { show: Milestone | null; silent: string[] } {
  const s = new Set(seen);
  const { fire, silent } = currentMilestones(i);
  return { show: fire.find((m) => !s.has(m.key)) ?? null, silent: silent.filter((k) => !s.has(k)) };
}
