import type { Dataset, Use } from "./types";
import { FEATURE_BY_KEY } from "./catalog";
import { context, RISK_DAYS } from "./build";
import { daysActiveIn, lastActiveDay } from "./engagement";
import { userLabel } from "./profile";
import { foodKey } from "./tracking";
import { addDays, daysAgo, istDay, istHour, lastNDays, round, within } from "./time";

/**
 * Extra view models for the bento admin pages (v2.12 design): per-user cards on the overview, the
 * one-user "last 14 days" calendar + summary tiles, this-30-days vs previous-30-days tracking, and
 * a weekday × hour activity grid. Pure and JSON-serialisable like build.ts; every number is derived
 * from the same 90-day Dataset (no new reads).
 */

type Ctx = ReturnType<typeof context>;

const by = <T extends { user_id: string }>(rows: T[], id: string) => rows.filter((r) => r.user_id === id);

/** yyyy-MM-dd → 0 (Sun) … 6 (Sat). */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** "Today" / "Yesterday" / "5 days ago" / "Never". */
export function sinceText(days: number | null): string {
  if (days == null) return "Never active";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** Short, readable feature name for chips ("Food: search" → "Search"). */
export function shortFeature(key: string): string {
  const label = FEATURE_BY_KEY.get(key)?.label ?? key;
  return label.replace(/^Food: /, "").replace(/^Scan: /, "Scan ").replace(" (any method)", "").replace(" (opened)", "");
}

function platformOf(ds: Dataset, id: string): string {
  let latest: Dataset["events"][number] | null = null;
  for (const e of ds.events) if (e.user_id === id && (!latest || e.created_at > latest.created_at)) latest = e;
  if (!latest) return "";
  const p = latest.platform === "android" ? "Android" : latest.platform === "ios" ? "iOS" : latest.platform === "web" ? "Web" : latest.platform || "";
  return [p, latest.app_version ? latest.app_version.replace(/\.0$/, "") : ""].filter(Boolean).join(" ");
}

/** Top `n` features by uses in the last `days` (food_any dropped when a logging method is known). */
function topFeatures(uses: Use[], today: string, days: number, n: number): { key: string; label: string; count: number }[] {
  const c = new Map<string, number>();
  for (const u of uses) if (within(u.day, today, days)) c.set(u.feature, (c.get(u.feature) ?? 0) + 1);
  if ([...c.keys()].some((k) => k.startsWith("food_") && k !== "food_any")) c.delete("food_any");
  return [...c]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, label: shortFeature(key), count }));
}

// ---------------------------------------------------------------------------------------------
// Overview: one card per user
// ---------------------------------------------------------------------------------------------

export type UserCard = {
  id: string;
  label: string;
  name: string;
  initial: string;
  platform: string;
  lastActive: string;
  daysSinceActive: number | null;
  atRisk: boolean;
  days7: number;
  meals7: number;
  /** Feature uses per day, last 7 days, oldest first. */
  spark: number[];
  /** Meals per day with food logged (30 days); null with none. */
  mealsPerLoggedDay: number | null;
  avgKcal: number | null;
  /** Share of food-logged days (30) at or over the protein target; null without a target / data. */
  proteinHit: number | null;
  topFoods: string[];
  topFeatures: { key: string; label: string; count: number }[];
};

export function buildUserCards(ds: Dataset, c: Ctx = context(ds)): UserCard[] {
  const t = ds.today;
  const usesBy = new Map<string, Use[]>();
  for (const u of c.uses) {
    let l = usesBy.get(u.user);
    if (!l) usesBy.set(u.user, (l = []));
    l.push(u);
  }
  const week = lastNDays(t, 7);
  const cards = ds.users.map((u): UserCard => {
    const p = c.profiles.get(u.id);
    const uses = usesBy.get(u.id) ?? [];
    const days = c.active.get(u.id);
    const last = lastActiveDay(days);
    const since = last ? daysAgo(last, t) : null;
    const meals30 = by(ds.meals, u.id).filter((m) => within(m.date, t, 30));
    const meals7 = meals30.filter((m) => within(m.date, t, 7)).length;
    const mealIds = new Set(meals30.map((m) => m.id));
    const items = by(ds.items, u.id).filter((i) => mealIds.has(i.meal_id));
    const perDay = new Map<string, { kcal: number; protein: number }>();
    for (const i of items) {
      const d = perDay.get(i.date) ?? { kcal: 0, protein: 0 };
      d.kcal += i.calories;
      d.protein += i.protein_g;
      perDay.set(i.date, d);
    }
    const logged = [...perDay.values()];
    const target = p?.protein_target_g && p.protein_target_g > 0 ? p.protein_target_g : null;
    const foods = new Map<string, { name: string; n: number }>();
    for (const i of items) {
      const k = foodKey(i.name);
      if (!k) continue;
      const r = foods.get(k) ?? { name: i.name.trim(), n: 0 };
      r.n++;
      foods.set(k, r);
    }
    const mealDays = new Set(meals30.map((m) => m.date)).size;
    const label = userLabel(u.id, p);
    return {
      id: u.id,
      label,
      name: p?.name || "",
      initial: (p?.name || p?.username || u.email || "?").trim().charAt(0).toUpperCase() || "?",
      platform: platformOf(ds, u.id),
      lastActive: sinceText(since),
      daysSinceActive: since,
      atRisk: since == null || since >= RISK_DAYS,
      days7: daysActiveIn(days, t, 7),
      meals7,
      spark: week.map((d) => uses.filter((x) => x.day === d).length),
      mealsPerLoggedDay: mealDays ? round(meals30.length / mealDays, 1) : null,
      avgKcal: logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : null,
      proteinHit: target && logged.length ? round(logged.filter((d) => d.protein >= target).length / logged.length, 3) : null,
      topFoods: [...foods.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 3).map((f) => f.name),
      topFeatures: topFeatures(uses, t, 30, 3),
    };
  });
  // Most active first; at-risk users sink, never-active last.
  return cards.sort((a, b) => b.days7 - a.days7 || b.meals7 - a.meals7 || (a.daysSinceActive ?? 1e9) - (b.daysSinceActive ?? 1e9) || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------------------------
// One user: last 14 days
// ---------------------------------------------------------------------------------------------

export type Day14 = { day: string; weekday: number; meals: number; workouts: number; today: boolean };
export type Days14 = { days: Day14[]; logged: number; meals: number; workouts: number; missed: string[] };

/** Meals (by meal date) and workouts (workouts rows + standalone exercise_log rows) for each of the last 14 days. */
export function lastFourteen(ds: Dataset, id: string): Days14 {
  const t = ds.today;
  const meals = new Map<string, number>();
  for (const m of by(ds.meals, id)) meals.set(m.date, (meals.get(m.date) ?? 0) + 1);
  const train = new Map<string, number>();
  for (const w of by(ds.workouts, id)) train.set(w.date, (train.get(w.date) ?? 0) + 1);
  for (const x of by(ds.exercises, id)) if (x.source !== "workout") train.set(x.date, (train.get(x.date) ?? 0) + 1);
  const days = lastNDays(t, 14).map((day) => ({ day, weekday: weekday(day), meals: meals.get(day) ?? 0, workouts: train.get(day) ?? 0, today: day === t }));
  return {
    days,
    logged: days.filter((d) => d.meals > 0).length,
    meals: days.reduce((a, d) => a + d.meals, 0),
    workouts: days.reduce((a, d) => a + d.workouts, 0),
    missed: days.filter((d) => !d.meals && !d.today).map((d) => d.day),
  };
}

// ---------------------------------------------------------------------------------------------
// One user: what they track, last 30 days vs the 30 before
// ---------------------------------------------------------------------------------------------

export type Period = {
  meals: number;
  mealsPerDay: number;
  daysLogged: number;
  avgKcal: number | null;
  avgProtein: number | null;
  proteinHitDays: number;
  kcalHitDays: number;
  waterEntries: number;
  waterDays: number;
  weighIns: number;
  workouts: number;
};

export type TrackCompare = {
  cur: Period;
  prev: Period;
  /** Anything logged at all in the previous 30 days (else deltas read "new"). */
  hasPrev: boolean;
  kcalTarget: number | null;
  proteinTarget: number | null;
  workoutTarget: number | null;
  /** Last 30 days, oldest first: null = no food logged that day. */
  proteinStrip: (boolean | null)[];
  kcalStrip: (boolean | null)[];
};

/** Calorie target "hit" = within ±10% of it. */
export const KCAL_BAND = 0.1;

export function trackCompare(ds: Dataset, id: string): TrackCompare {
  const t = ds.today;
  const p = ds.profiles.find((x) => x.id === id);
  const kt = p?.calorie_target && p.calorie_target > 0 ? p.calorie_target : null;
  const pt = p?.protein_target_g && p.protein_target_g > 0 ? p.protein_target_g : null;
  const inPrev = (day: string) => within(day, addDays(t, -30), 30);
  const meals = by(ds.meals, id);
  const items = by(ds.items, id);
  const perDay = new Map<string, { kcal: number; protein: number }>();
  for (const i of items) {
    if (!i.date) continue;
    const d = perDay.get(i.date) ?? { kcal: 0, protein: 0 };
    d.kcal += i.calories;
    d.protein += i.protein_g;
    perDay.set(i.date, d);
  }
  const hitP = (d: { protein: number }) => !!pt && d.protein >= pt;
  const hitK = (d: { kcal: number }) => !!kt && Math.abs(d.kcal - kt) <= kt * KCAL_BAND;
  const period = (inside: (day: string) => boolean): Period => {
    const m = meals.filter((x) => inside(x.date));
    const days = [...perDay].filter(([d]) => inside(d)).map(([, v]) => v);
    const water = by(ds.water, id).filter((r) => inside(r.date));
    const workouts = by(ds.workouts, id).filter((r) => inside(r.date)).length + by(ds.exercises, id).filter((r) => r.source !== "workout" && inside(r.date)).length;
    return {
      meals: m.length,
      mealsPerDay: round(m.length / 30, 1),
      daysLogged: days.length,
      avgKcal: days.length ? Math.round(days.reduce((a, d) => a + d.kcal, 0) / days.length) : null,
      avgProtein: days.length ? round(days.reduce((a, d) => a + d.protein, 0) / days.length, 1) : null,
      proteinHitDays: days.filter(hitP).length,
      kcalHitDays: days.filter(hitK).length,
      waterEntries: water.length,
      waterDays: new Set(water.map((r) => r.date)).size,
      weighIns: by(ds.weight, id).filter((r) => inside(r.date)).length,
      workouts,
    };
  };
  const cur = period((d) => within(d, t, 30));
  const prev = period(inPrev);
  const last30 = lastNDays(t, 30);
  return {
    cur,
    prev,
    hasPrev: prev.meals + prev.waterEntries + prev.weighIns + prev.workouts > 0,
    kcalTarget: kt,
    proteinTarget: pt,
    workoutTarget: p?.weekly_workout_target && p.weekly_workout_target > 0 ? p.weekly_workout_target : null,
    proteinStrip: last30.map((d) => (perDay.has(d) ? hitP(perDay.get(d)!) : null)),
    kcalStrip: last30.map((d) => (perDay.has(d) ? hitK(perDay.get(d)!) : null)),
  };
}

// ---------------------------------------------------------------------------------------------
// One user: when they use the app (weekday × IST hour, 30 days)
// ---------------------------------------------------------------------------------------------

/** 7 rows (Mon … Sun) × 24 IST hours of app events + logged rows in the last 30 days. */
export function weekHourGrid(ds: Dataset, id: string, c: Ctx = context(ds)): number[][] {
  const t = ds.today;
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const add = (ts: string) => {
    const day = istDay(ts);
    const h = istHour(ts);
    if (!day || h < 0 || !within(day, t, 30)) return;
    grid[(weekday(day) + 6) % 7][h]++;
  };
  for (const e of ds.events) if (e.user_id === id) add(e.created_at);
  for (const u of c.uses) if (u.user === id && u.source === "table") add(u.at);
  return grid;
}

// ---------------------------------------------------------------------------------------------
// One user: plain-English reads of the feature × week matrix
// ---------------------------------------------------------------------------------------------

export type MatrixRead = "New this week" | "Growing fast" | "Growing" | "Dropping" | "Steady" | "Quiet";

/** Trend word from a feature's last four weekly counts (oldest first). */
export function readWeeks(v: number[]): MatrixRead {
  const w = v.slice(-4);
  while (w.length < 4) w.unshift(0);
  if (!w.some(Boolean)) return "Quiet";
  if (!w[0] && !w[1] && !w[2] && w[3] > 0) return "New this week";
  if (w[3] >= w[0] + 5) return "Growing fast";
  if (w[3] > w[0]) return "Growing";
  if (w[3] < w[0]) return "Dropping";
  return "Steady";
}
