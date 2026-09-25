import { addDays, daysBetween, parseIso, weekStart } from "./dates";
import { longestDayRun } from "./badges";
import { macrosFor } from "./goals";
import { mealTypeOf, parseTimestamp, type MealType } from "./mealType";
import { totalsFor } from "./totals";
import type { Meal, Profile, WeightEntry } from "./types";

/**
 * v2.12 Progress / Profile numbers. Pure (no React, no DB): everything is derived from rows the
 * screens already load (weigh-ins, meals, workouts, exercise log, the profile).
 */

// ---------------------------------------------------------------- weight

export type WeightPoint = { date: string; avg: number };

/**
 * The 7-day average weight at each weigh-in inside the last `days` days (plus the last one before
 * the window as its starting point). Each point averages every weigh-in in the 7 days ending on it.
 */
export function weightTrend(weights: WeightEntry[], today: string, days: number): WeightPoint[] {
  const asc = [...weights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const from = addDays(today, -days);
  const inside = asc.filter((w) => w.date >= from && w.date <= today);
  const before = asc.filter((w) => w.date < from);
  const rows = before.length ? [before[before.length - 1], ...inside] : inside;
  // One point per date (the average already folds same-day weigh-ins together).
  const seen = new Set<string>();
  const out: WeightPoint[] = [];
  for (const r of rows) {
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    const lo = addDays(r.date, -6);
    const win = asc.filter((w) => w.date >= lo && w.date <= r.date);
    out.push({ date: r.date, avg: win.reduce((a, w) => a + w.weight_kg, 0) / win.length });
  }
  return out;
}

/** kg per day from a least-squares line through the points (null with fewer than 2 or one day). */
export function slopePerDay(points: WeightPoint[]): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.avg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}

/**
 * Roughly when the goal weight lands: the recent trend when it's heading the right way, otherwise
 * the pace chosen in Goal & weight. Null when there's no goal, it's reached, or it's > 3 years out.
 */
export function goalEta(current: number | null, goal: number | null, slope: number | null, speedKgWk: number, today: string): { date: string | null; reached: boolean } {
  if (current == null || goal == null) return { date: null, reached: false };
  const gap = goal - current;
  if (Math.abs(gap) < 0.15) return { date: null, reached: true };
  let perDay: number | null = null;
  if (slope != null && Math.sign(slope) === Math.sign(gap) && Math.abs(slope) > 0.004) perDay = Math.abs(slope);
  else if (speedKgWk > 0) perDay = speedKgWk / 7;
  if (!perDay) return { date: null, reached: false };
  const days = Math.ceil(Math.abs(gap) / perDay);
  if (days > 3 * 365) return { date: null, reached: false };
  return { date: addDays(today, days), reached: false };
}

/** 0..1 of the way from the starting weight to the goal. */
export function goalFraction(start: number | null, current: number | null, goal: number | null): number {
  if (start == null || current == null || goal == null) return 0;
  const span = start - goal;
  if (Math.abs(span) < 0.05) return Math.abs(current - goal) <= 0.15 ? 1 : 0;
  return Math.max(0, Math.min(1, (start - current) / span));
}

// ---------------------------------------------------------------- streak

/** Personal best run of logged days (anything logged), never below the current streak. */
export function bestDayRun(current: number, ...dateLists: string[][]): number {
  return Math.max(current, longestDayRun(dateLists.flat()));
}

export type FlameDay = { date: string; letter: string; state: "done" | "open" | "missed" | "future" };

/** This week, Monday to Sunday, for the flame circles. */
export function weekFlames(today: string, ...dateLists: string[][]): FlameDay[] {
  const set = new Set(dateLists.flat());
  const ws = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const state: FlameDay["state"] = set.has(d) ? "done" : d === today ? "open" : d > today ? "future" : "missed";
    return { date: d, letter: "MTWTFSS"[i], state };
  });
}

// ---------------------------------------------------------------- energy

export type EnergyDay = { date: string; kcal: number; logged: boolean; status: "on" | "over" | "under" | "none" };

/** Calories per day from `from` to `to`, judged against the target (±5% counts as on target). */
export function energyDays(meals: Meal[], from: string, to: string, target: number): EnergyDay[] {
  const n = daysBetween(from, to) + 1;
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const d = addDays(from, i);
    const kcal = totalsFor(meals, d).calories;
    const logged = kcal > 0;
    const status: EnergyDay["status"] = !logged ? "none" : kcal > target * 1.05 ? "over" : kcal < target * 0.95 ? "under" : "on";
    return { date: d, kcal, logged, status };
  });
}

// ---------------------------------------------------------------- macros

export type MacroTargets = { protein: number; carbs: number; fat: number };

export function macroTargets(p: Pick<Profile, "calorie_target" | "protein_target_g" | "carb_target_g" | "fat_target_g">): MacroTargets {
  const d = macrosFor(p.calorie_target, p.protein_target_g);
  return { protein: p.protein_target_g, carbs: p.carb_target_g ?? d.carbs, fat: p.fat_target_g ?? d.fat };
}

/** Daily average protein / carbs / fat over the logged days in [from, to] (today excluded unless it's the only one). */
export function macroAverages(meals: Meal[], from: string, to: string, today: string): { protein: number; carbs: number; fat: number; days: number } {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const logged = days.filter((d) => totalsFor(meals, d).calories > 0);
  const use = logged.filter((d) => d !== today).length ? logged.filter((d) => d !== today) : logged;
  if (!use.length) return { protein: 0, carbs: 0, fat: 0, days: 0 };
  const sum = use.reduce(
    (a, d) => {
      const t = totalsFor(meals, d);
      return { protein: a.protein + t.protein, carbs: a.carbs + t.carbs, fat: a.fat + t.fat };
    },
    { protein: 0, carbs: 0, fat: 0 },
  );
  return { protein: sum.protein / use.length, carbs: sum.carbs / use.length, fat: sum.fat / use.length, days: use.length };
}

/** Everyday Indian protein top-ups for "N g protein to go. Quick picks". */
export const PROTEIN_PICKS: { name: string; protein: number }[] = [
  { name: "2 egg whites", protein: 7 },
  { name: "Cup of curd", protein: 8 },
  { name: "Bowl of dal", protein: 9 },
  { name: "50 g paneer", protein: 9 },
  { name: "Cup of chana", protein: 12 },
  { name: "30 g soya chunks", protein: 15 },
  { name: "Scoop of whey", protein: 24 },
  { name: "100 g chicken", protein: 27 },
];

/** Three picks that fit the gap best: the largest ones that don't overshoot, smallest first. */
export function proteinPicks(toGo: number): { name: string; protein: number }[] {
  const fit = PROTEIN_PICKS.filter((p) => p.protein <= Math.max(toGo, 7));
  const top = fit.slice(-3);
  return top.length === 3 ? top : PROTEIN_PICKS.slice(0, 3);
}

// ---------------------------------------------------------------- meal times

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });

/** Minutes after midnight, India time. */
export function istMinutes(d: Date): number {
  const [h, m] = TIME.format(d).split(":").map(Number);
  return ((h % 24) * 60 + m) % 1440;
}

/** "8:31 am" from minutes after midnight. */
export function clockText(min: number): { time: string; ampm: string } {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return { time: `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")}`, ampm: h < 12 ? "am" : "pm" };
}

export type MealTimeRow = {
  type: MealType;
  /** Median time of day of the first meal of this type, or null without two days of history. */
  usual: number | null;
  /** First logged time of this type today, or null. */
  today: number | null;
};

/** Usual (median) meal times over the `days` days before today, plus today's times. */
export function mealTimes(meals: Meal[], today: string, days: number): MealTimeRow[] {
  const from = addDays(today, -days);
  const first = new Map<string, number>(); // `${date}|${type}` → earliest minutes
  for (const m of meals) {
    if (m.date < from || m.date > today) continue;
    const d = parseTimestamp(m.created_at);
    if (!d) continue;
    // A meal logged for another day (back-filled) says nothing about when it was eaten.
    const loggedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    if (loggedOn !== m.date) continue;
    const key = `${m.date}|${mealTypeOf(m)}`;
    const min = istMinutes(d);
    if (!first.has(key) || (first.get(key) as number) > min) first.set(key, min);
  }
  const types: MealType[] = ["breakfast", "lunch", "snack", "dinner"];
  return types.map((type) => {
    const past = [...first.entries()].filter(([k]) => k.endsWith(`|${type}`) && !k.startsWith(today)).map(([, v]) => v).sort((a, b) => a - b);
    const usual = past.length >= 2 ? (past.length % 2 ? past[(past.length - 1) / 2] : (past[past.length / 2 - 1] + past[past.length / 2]) / 2) : null;
    return { type, usual: usual == null ? null : Math.round(usual), today: first.get(`${today}|${type}`) ?? null };
  });
}

/** "Joined Aug 2026". */
export function monthYear(isoOrTimestamp: string | null | undefined): string | null {
  if (!isoOrTimestamp) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrTimestamp) ? parseIso(isoOrTimestamp) : new Date(isoOrTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** "Nov 20". */
export function monthDay(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
