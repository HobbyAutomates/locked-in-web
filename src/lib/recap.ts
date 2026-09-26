/**
 * v2.13 weekly / monthly recap (spec §13). Pure: the period maths and the numbers on each slide.
 * scripts/check-recap.ts pins the periods; Android's util/Recap.kt ports it.
 */
import { addDays, daysBetween, parseIso, weekStart } from "./dates";
import { totalsFor } from "./totals";
import { exerciseHistory, loggedExercises } from "./e1rm";
import type { ExerciseEntry, Meal, WeightEntry, Workout } from "./types";

export type RecapKind = "weekly" | "monthly";

export type Period = { kind: RecapKind; from: string; to: string; label: string; key: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** Weekly = the previous Monday–Sunday; monthly = the previous calendar month. */
export function recapPeriod(kind: RecapKind, today: string): Period {
  if (kind === "weekly") {
    const to = addDays(weekStart(today), -1);
    const from = addDays(to, -6);
    const f = parseIso(from);
    const t = parseIso(to);
    const label = `${f.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${t.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    return { kind, from, to, label, key: `w-${from}` };
  }
  const d = parseIso(today);
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  const from = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
  const to = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  return { kind, from, to, label: first.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), key: `m-${from.slice(0, 7)}` };
}

/** Which recap Home offers today: weekly on Mondays, monthly on the 1st (monthly wins on a Monday the 1st). */
export function recapDue(today: string): RecapKind | null {
  const d = parseIso(today);
  if (d.getDate() === 1) return "monthly";
  if (d.getDay() === 1) return "weekly";
  return null;
}

/** A protein day counts as hit at 90 % of the target (the Macros card's "on track"). */
export const PROTEIN_HIT = 0.9;

export type Recap = {
  period: Period;
  days: number;
  daysLogged: number;
  workouts: number;
  minutes: number;
  proteinDays: number;
  proteinTarget: number;
  avgKcal: number | null;
  bestLift: { name: string; kg: number | null; reps: number; e1rm: number; pr: boolean } | null;
  weight: { start: number; end: number; delta: number } | null;
  topFoods: { name: string; count: number }[];
  streak: number;
  squad: { name: string; rank: number; of: number } | null;
  nextGoal: string;
};

export type RecapInput = {
  meals: Meal[];
  workouts: Workout[];
  exercises: ExerciseEntry[];
  weights: WeightEntry[];
  proteinTarget: number;
  weeklyTarget: number;
  streak: number;
  squad?: { name: string; rank: number; of: number } | null;
};

const within = (d: string, p: Period) => d >= p.from && d <= p.to;

export function buildRecap(period: Period, i: RecapInput): Recap {
  const days = daysBetween(period.from, period.to) + 1;
  const dates = Array.from({ length: days }, (_, k) => addDays(period.from, k));
  const logged = new Set<string>();
  for (const m of i.meals) if (within(m.date, period)) logged.add(m.date);
  for (const w of i.workouts) if (within(w.date, period)) logged.add(w.date);
  for (const e of i.exercises) if (within(e.date, period)) logged.add(e.date);

  const workouts = i.workouts.filter((w) => within(w.date, period));
  const exercises = i.exercises.filter((e) => within(e.date, period) && e.source !== "workout");
  const minutes = Math.round(workouts.reduce((a, w) => a + (Number(w.minutes) || 0), 0) + exercises.reduce((a, e) => a + (Number(e.minutes) || 0), 0));

  let proteinDays = 0;
  let kcalSum = 0;
  let kcalDays = 0;
  for (const d of dates) {
    const t = totalsFor(i.meals, d);
    if (t.calories > 0) {
      kcalSum += t.calories;
      kcalDays += 1;
    }
    if (i.proteinTarget > 0 && t.protein >= i.proteinTarget * PROTEIN_HIT) proteinDays += 1;
  }

  // Best lift: the highest e1RM set logged in the period, flagged when it beat everything before it.
  let bestLift: Recap["bestLift"] = null;
  const lifts = i.workouts.filter((w) => w.date <= period.to);
  for (const { name } of loggedExercises(workouts)) {
    const h = exerciseHistory(lifts, name);
    for (const p of h.points) {
      if (!within(p.date, period)) continue;
      // Loaded lifts rank above bodyweight ones; then by e1RM (or reps for bodyweight).
      const score = (p.best.kg != null ? 1e6 : 0) + (p.best.kg != null ? p.best.e1rm : p.best.reps);
      const cur = bestLift ? (bestLift.kg != null ? 1e6 + bestLift.e1rm : bestLift.reps) : -Infinity;
      if (score > cur) bestLift = { name, kg: p.best.kg, reps: p.best.reps, e1rm: p.best.e1rm, pr: p.pr };
    }
  }

  const ws = i.weights.filter((w) => within(w.date, period)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const weight = ws.length >= 2 ? { start: ws[0].weight_kg, end: ws[ws.length - 1].weight_kg, delta: Math.round((ws[ws.length - 1].weight_kg - ws[0].weight_kg) * 10) / 10 } : null;

  const foods = new Map<string, { name: string; count: number }>();
  for (const m of i.meals) {
    if (!within(m.date, period)) continue;
    for (const it of m.items) {
      const k = it.name.trim().toLowerCase();
      if (!k) continue;
      const cur = foods.get(k);
      if (cur) cur.count += 1;
      else foods.set(k, { name: it.name.trim(), count: 1 });
    }
  }
  const topFoods = [...foods.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);

  const weeks = days / 7;
  const perWeek = weeks > 0 ? workouts.length / weeks : 0;
  const nextGoal =
    i.weeklyTarget > 0 && perWeek < i.weeklyTarget
      ? `Train ${i.weeklyTarget} times next week`
      : proteinDays / days < 5 / 7
        ? "Hit your protein on 5 days next week"
        : logged.size < days
          ? "Log something every day next week"
          : "Keep the streak alive, one day at a time";

  return {
    period,
    days,
    daysLogged: logged.size,
    workouts: workouts.length + exercises.length,
    minutes,
    proteinDays,
    proteinTarget: i.proteinTarget,
    avgKcal: kcalDays ? Math.round(kcalSum / kcalDays) : null,
    bestLift,
    weight,
    topFoods,
    streak: i.streak,
    squad: i.squad ?? null,
    nextGoal,
  };
}
