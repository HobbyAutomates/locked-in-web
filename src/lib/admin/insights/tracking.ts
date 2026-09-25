import type { DatedRow, EventRow, MealItemRow, MealRow, WorkoutRow, ExerciseRow } from "./types";
import { METHODS, methodOf } from "./catalog";
import { istDay, round, within } from "./time";

/** What people track: foods, logging methods, meal types, nutrition vs. targets, water/weight/workouts. */

export type Count = { label: string; count: number };

export type MethodMix = {
  /** From meal_logged events, by method (all six always present). */
  methods: Count[];
  /** meal_logged events with no/unknown method. */
  unknown: number;
  /** Meals in the table created before that user's first event (their method was never recorded). */
  untracked: number;
  total: number;
};

export function methodMix(events: Pick<EventRow, "name" | "props" | "created_at">[], today: string, n = 30, untracked = 0): MethodMix {
  const c = new Map<string, number>(METHODS.map((m) => [m, 0]));
  let unknown = 0;
  for (const e of events) {
    if (e.name !== "meal_logged" || !within(istDay(e.created_at), today, n)) continue;
    const m = methodOf(e.props ?? {});
    if (m) c.set(m, (c.get(m) ?? 0) + 1);
    else unknown++;
  }
  const methods = [...c].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return { methods, unknown, untracked, total: methods.reduce((a, x) => a + x.count, 0) + unknown + untracked };
}

export type FoodCount = { name: string; count: number; users: number };

/** Normalised food name: trimmed, single-spaced, lower-case. */
export function foodKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function topFoods(items: Pick<MealItemRow, "name" | "user_id">[], limit = 10): FoodCount[] {
  const m = new Map<string, { name: string; count: number; users: Set<string> }>();
  for (const it of items) {
    const k = foodKey(it.name ?? "");
    if (!k) continue;
    const r = m.get(k) ?? { name: it.name.trim().replace(/\s+/g, " "), count: 0, users: new Set<string>() };
    r.count++;
    r.users.add(it.user_id);
    m.set(k, r);
  }
  return [...m.values()]
    .map((r) => ({ name: r.name, count: r.count, users: r.users.size }))
    .sort((a, b) => b.count - a.count || b.users - a.users || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export function mealTypeMix(meals: Pick<MealRow, "meal_type">[]): Count[] {
  const c = new Map<string, number>([...MEAL_TYPES.map((t): [string, number] => [t, 0]), ["unset", 0]]);
  for (const m of meals) {
    const t = (m.meal_type ?? "").toLowerCase();
    const k = (MEAL_TYPES as readonly string[]).includes(t) ? t : "unset";
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return [...c].map(([label, count]) => ({ label, count }));
}

export type Nutrition = {
  /** Days (by meal date) with at least one food item. */
  daysLogged: number;
  mealsPerLoggedDay: number | null;
  avgKcal: number | null;
  avgProtein: number | null;
  kcalTarget: number | null;
  proteinTarget: number | null;
  /** avgKcal ÷ kcalTarget. */
  kcalOfTarget: number | null;
  proteinOfTarget: number | null;
  /** Share of logged days where protein ≥ target. */
  proteinHitRate: number | null;
  proteinHitDays: number;
};

/** Averages over days that have logged food (unlogged days would just read as 0 kcal). */
export function nutrition(meals: Pick<MealRow, "id" | "date">[], items: Pick<MealItemRow, "date" | "calories" | "protein_g">[], targets: { kcal: number | null; protein: number | null }): Nutrition {
  const perDay = new Map<string, { kcal: number; protein: number }>();
  for (const it of items) {
    if (!it.date) continue;
    const d = perDay.get(it.date) ?? { kcal: 0, protein: 0 };
    d.kcal += Number(it.calories) || 0;
    d.protein += Number(it.protein_g) || 0;
    perDay.set(it.date, d);
  }
  const days = [...perDay.values()];
  const n = days.length;
  const avgKcal = n ? round(days.reduce((a, d) => a + d.kcal, 0) / n, 0) : null;
  const avgProtein = n ? round(days.reduce((a, d) => a + d.protein, 0) / n, 1) : null;
  const pt = targets.protein && targets.protein > 0 ? targets.protein : null;
  const kt = targets.kcal && targets.kcal > 0 ? targets.kcal : null;
  const hit = pt ? days.filter((d) => d.protein >= pt).length : 0;
  const mealDays = new Set(meals.map((m) => m.date).filter(Boolean)).size;
  return {
    daysLogged: n,
    mealsPerLoggedDay: mealDays ? round(meals.length / mealDays, 1) : null,
    avgKcal,
    avgProtein,
    kcalTarget: kt,
    proteinTarget: pt,
    kcalOfTarget: avgKcal != null && kt ? round(avgKcal / kt, 3) : null,
    proteinOfTarget: avgProtein != null && pt ? round(avgProtein / pt, 3) : null,
    proteinHitRate: pt && n ? round(hit / n, 3) : null,
    proteinHitDays: hit,
  };
}

export type LogFrequency = { entries: number; days: number; perWeek: number };

/** Entries and distinct days over a `spanDays` window, and entries per week. */
export function logFrequency(rows: Pick<DatedRow, "date">[], spanDays: number): LogFrequency {
  return { entries: rows.length, days: new Set(rows.map((r) => r.date)).size, perWeek: spanDays > 0 ? round(rows.length / (spanDays / 7), 1) : 0 };
}

/** Workouts by kind, plus exercise_log entries (not the ones written for a workout) by source. */
export function workoutsByKind(workouts: Pick<WorkoutRow, "kind">[], exercises: Pick<ExerciseRow, "source">[]): Count[] {
  const c = new Map<string, number>();
  for (const w of workouts) c.set(w.kind || "bands", (c.get(w.kind || "bands") ?? 0) + 1);
  for (const x of exercises) {
    if (x.source === "workout") continue;
    const k = `activity (${x.source || "manual"})`;
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return [...c].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
