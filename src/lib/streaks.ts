import { addDays, daysBetween, today, weekStart } from "./dates";
import type { Muscle } from "./muscles";
import { MUSCLES } from "./muscles";

/** Consecutive weeks (ending this week or last) that met the weekly target. */
export function workoutWeekStreak(dates: string[], target: number) {
  const perWeek = new Map<string, number>();
  for (const d of dates) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const t = today();
  let w = weekStart(t);
  // current week only counts if already met; otherwise start from last week
  if ((perWeek.get(w) ?? 0) < target) w = addDays(w, -7);
  let streak = 0;
  while ((perWeek.get(w) ?? 0) >= target) {
    streak++;
    w = addDays(w, -7);
  }
  return streak;
}

/** Consecutive days with a session, ending today or yesterday. */
export function workoutDayStreak(dates: string[]) {
  const set = new Set(dates);
  const t = today();
  let cur = set.has(t) ? t : addDays(t, -1);
  let n = 0;
  while (set.has(cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

/**
 * v2.2 day streak: consecutive Asia/Kolkata days, ending today or yesterday, on which ANYTHING
 * was logged — a workout, an exercise_log row (any source) or a meal. `today()` is already IST.
 */
export function activityDayStreak(...dateLists: string[][]) {
  return workoutDayStreak(dateLists.flat());
}

/** Consecutive days with at least one meal logged, ending today or yesterday. */
export function mealDayStreak(dates: string[]) {
  return workoutDayStreak(dates);
}

export function thisWeekCount(dates: string[]) {
  const t = today();
  const ws = weekStart(t);
  return dates.filter((d) => d >= ws && d <= t).length;
}

export type RestRow = { muscle: Muscle; last: string | null; days: number };

export function restByMuscle(workouts: { date: string; muscles: string[] }[]): RestRow[] {
  const t = today();
  const sorted = [...workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
  return MUSCLES.map((muscle) => {
    const hit = sorted.find((w) => w.muscles.includes(muscle));
    return { muscle, last: hit?.date ?? null, days: hit ? daysBetween(hit.date, t) : Infinity };
  }).sort((a, b) => b.days - a.days);
}
