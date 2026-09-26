import type { Profile } from "./types";
import { KCAL_PER_KG, ageYears, effectiveGoal, floorFor, isTeen, maxSafeWeeklyGainKg, maxSafeWeeklyLossKg, plan, teenGainSurplus, todayIso } from "./goals";

/**
 * v2.13 adaptive weekly targets (spec §5), pure so scripts/check-adaptive.ts runs the spec's test
 * vectors and Android's util/Adaptive.kt can port it line for line.
 *
 *   1. A daily weight series for the 21 days ending `asOf`, forward-filling gaps. Days before the
 *      first weigh-in in that window stay empty (no extrapolation backwards). Several weigh-ins on
 *      one day count as their mean.
 *   2. Trend = EWMA, alpha 0.1, seeded with the first weigh-in.
 *   3. slope (kg/day) = least-squares slope of the trend over the last 14 days; × 7 = kg/week.
 *   4. avg_kcal = mean kcal over the days with at least one food log among the last 14.
 *   5. TDEE_est = avg_kcal − slope × 7700.
 *   6. raw = TDEE_est + goal_rate (kg/week, negative for loss) × 7700 / 7.
 *   7. new = clamp(raw, old − 150, old + 150), then clamp to the safety floor / ceiling, then
 *      rounded to the nearest 10.
 *
 * `asOf` is the Sunday before the check-in's Monday, so a half-logged Monday never drags the
 * average down. Needs ≥ 10 of those 14 days with a food log and ≥ 4 weigh-ins in them.
 */

export const ALPHA = 0.1;
export const WEIGHT_DAYS = 21;
export const WINDOW_DAYS = 14;
export const MIN_LOGGED_DAYS = 10;
export const MIN_WEIGH_INS = 4;
/** Most a single check-in moves the target, either way. */
export const MAX_STEP_KCAL = 150;
/** Highest target a check-in will ever suggest (a sanity cap; goals.ts has no ceiling of its own). */
export const ADAPTIVE_CEILING = 5000;

export type WeighIn = { date: string; kg: number };

// ---------------------------------------------------------------- dates (UTC day numbers, no zone drift)

const dayNum = (iso: string) => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const shiftDay = (iso: string, n: number) => isoOf(dayNum(iso) + n);

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const n = dayNum(iso);
  const dow = (new Date(n * 86_400_000).getUTCDay() + 6) % 7; // 0 = Monday
  return isoOf(n - dow);
}

// ---------------------------------------------------------------- steps 1–3

/** Step 1: one value per day for the `days` days ending `asOf` (oldest first); null before the first weigh-in. */
export function dailyWeights(weighIns: WeighIn[], asOf: string, days = WEIGHT_DAYS): (number | null)[] {
  const end = dayNum(asOf);
  const start = end - days + 1;
  const byDay = new Map<number, number[]>();
  for (const w of weighIns) {
    const d = dayNum(w.date);
    if (!(w.kg > 0) || d < start || d > end) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), w.kg]);
  }
  const out: (number | null)[] = [];
  let last: number | null = null;
  for (let d = start; d <= end; d++) {
    const v = byDay.get(d);
    if (v) last = v.reduce((a, b) => a + b, 0) / v.length;
    out.push(last);
  }
  return out;
}

/** Step 2: EWMA seeded with the first value; nulls before it stay null. */
export function ewma(series: (number | null)[], alpha = ALPHA): (number | null)[] {
  let t: number | null = null;
  return series.map((v) => {
    if (v == null) return t;
    t = t == null ? v : t + alpha * (v - t);
    return t;
  });
}

/** Least-squares slope of y against its index, over the non-null points (0 with fewer than 2). */
export function lsSlope(values: (number | null)[]): number {
  const pts = values.map((y, x) => ({ x, y })).filter((p): p is { x: number; y: number } => p.y != null);
  if (pts.length < 2) return 0;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Steps 1–3: the trend's slope in kg/day over the last 14 days of the 21-day series. */
export function trendSlopeKgPerDay(weighIns: WeighIn[], asOf: string): number {
  const trend = ewma(dailyWeights(weighIns, asOf));
  return lsSlope(trend.slice(-WINDOW_DAYS));
}

// ---------------------------------------------------------------- steps 5–7

export type TargetMaths = { tdee: number; raw: number; newTarget: number };

/** Steps 5–7 from the averages alone (the spec's test vectors start here). */
export function adaptiveTarget(input: { avgKcal: number; slopeKgPerDay: number; goalRateKgPerWeek: number; oldTarget: number; floor: number; ceiling?: number }): TargetMaths {
  const tdee = input.avgKcal - input.slopeKgPerDay * KCAL_PER_KG;
  const raw = tdee + (input.goalRateKgPerWeek * KCAL_PER_KG) / 7;
  const stepped = Math.min(input.oldTarget + MAX_STEP_KCAL, Math.max(input.oldTarget - MAX_STEP_KCAL, raw));
  const safe = Math.min(input.ceiling ?? ADAPTIVE_CEILING, Math.max(input.floor, stepped));
  return { tdee, raw, newTarget: Math.round(safe / 10) * 10 };
}

// ---------------------------------------------------------------- the goal rate and bounds from a profile

/**
 * kg/week the target aims for: the goal speed after goals.ts' safe cap (negative for loss, 0 for
 * maintain). Under 18 there's no loss; a teen "gain" is the small EER surplus as a rate.
 */
export function goalRateFor(p: Profile, today: string = todayIso()): number {
  const age = ageYears(p.dob, today);
  const goal = effectiveGoal(p.goal_type, age);
  if (isTeen(age)) {
    if (goal !== "gain") return 0;
    const pl = plan(p, today);
    return pl ? (teenGainSurplus(pl.maintenance) * 7) / KCAL_PER_KG : 0;
  }
  const requested = Math.max(0.1, p.goal_speed_kg_wk || 0.5);
  const kg = p.weight_kg ?? 0;
  if (goal === "lose") return -Math.min(requested, kg ? maxSafeWeeklyLossKg(kg) : 1.0);
  if (goal === "gain") return Math.min(requested, kg ? maxSafeWeeklyGainKg(kg) : 0.5);
  return 0;
}

/**
 * The safety floor a check-in can't go under: goals.ts' floor (85 % of BMR or the sex backstop).
 * Under 18 there's never a deficit, so the floor is the teen's own energy need (EER) when known.
 */
export function adaptiveFloor(p: Profile, today: string = todayIso()): number {
  const base = floorFor(p, today);
  if (!isTeen(ageYears(p.dob, today))) return base;
  const pl = plan(p, today);
  return pl ? Math.max(base, Math.round(pl.maintenance)) : base;
}

// ---------------------------------------------------------------- the check-in

export type CheckinData = {
  /** The last day counted (the Sunday before the check-in). */
  asOf: string;
  weighIns: WeighIn[];
  /** kcal eaten per date, only for dates with at least one food log. */
  dayKcal: Record<string, number>;
};

export type CheckinResult =
  | {
      ok: true;
      asOf: string;
      loggedDays: number;
      weighIns: number;
      avgWeightKg: number;
      trendKgPerWeek: number;
      avgKcal: number;
      tdee: number;
      raw: number;
      oldTarget: number;
      newTarget: number;
      goalRateKgPerWeek: number;
      reason: string;
    }
  | { ok: false; asOf: string; loggedDays: number; weighIns: number; missing: string };

/** Days with a food log and weigh-ins inside the 14 days ending `asOf`. */
export function readiness(data: CheckinData): { loggedDays: number; weighIns: number } {
  const end = dayNum(data.asOf);
  const inWindow = (iso: string) => {
    const d = dayNum(iso);
    return d > end - WINDOW_DAYS && d <= end;
  };
  return {
    loggedDays: Object.keys(data.dayKcal).filter(inWindow).length,
    weighIns: data.weighIns.filter((w) => w.kg > 0 && inWindow(w.date)).length,
  };
}

/** "Log food on 3 more days and weigh in 2 more times" — what's still needed, in plain words. */
export function missingText(loggedDays: number, weighIns: number): string {
  const parts: string[] = [];
  const days = MIN_LOGGED_DAYS - loggedDays;
  const weighs = MIN_WEIGH_INS - weighIns;
  if (days > 0) parts.push(`log food on ${days} more day${days === 1 ? "" : "s"}`);
  if (weighs > 0) parts.push(`weigh in ${weighs} more time${weighs === 1 ? "" : "s"}`);
  if (!parts.length) return "";
  const s = parts.join(" and ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} in the last 2 weeks, and your next check-in can adjust your target.`;
}

const signed = (v: number, digits = 1) => {
  const r = Number(v.toFixed(digits));
  return r === 0 ? "0" : `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(digits).replace(/\.0+$/, "")}`;
};
const kcalText = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * Step 8: "Your weight trend is −0.3 kg/week (goal −0.5) and you ate about 2,180 kcal a day, so
 * your burn is about 2,510. Lowering your target by 110 kcal."
 */
export function reasonText(r: { trendKgPerWeek: number; goalRateKgPerWeek: number; avgKcal: number; tdee: number; oldTarget: number; newTarget: number }): string {
  const burn = Math.round(r.tdee / 10) * 10;
  const delta = r.newTarget - r.oldTarget;
  const action = delta < 0 ? `Lowering your target by ${kcalText(-delta)} kcal.` : delta > 0 ? `Raising your target by ${kcalText(delta)} kcal.` : `Keeping your target at ${kcalText(r.oldTarget)} kcal.`;
  return `Your weight trend is ${signed(r.trendKgPerWeek)} kg/week (goal ${signed(r.goalRateKgPerWeek)}) and you ate about ${kcalText(Math.round(r.avgKcal / 10) * 10)} kcal a day, so your burn is about ${kcalText(burn)}. ${action}`;
}

/** The whole check-in from raw data. */
export function weeklyCheckin(data: CheckinData, s: { goalRateKgPerWeek: number; oldTarget: number; floor: number; ceiling?: number }): CheckinResult {
  const { loggedDays, weighIns } = readiness(data);
  if (loggedDays < MIN_LOGGED_DAYS || weighIns < MIN_WEIGH_INS) return { ok: false, asOf: data.asOf, loggedDays, weighIns, missing: missingText(loggedDays, weighIns) };
  const end = dayNum(data.asOf);
  const kcals = Object.entries(data.dayKcal)
    .filter(([d]) => dayNum(d) > end - WINDOW_DAYS && dayNum(d) <= end)
    .map(([, k]) => Number(k) || 0);
  const avgKcal = kcals.reduce((a, b) => a + b, 0) / kcals.length;
  const slope = trendSlopeKgPerDay(data.weighIns, data.asOf);
  const recent = data.weighIns.filter((w) => w.kg > 0 && dayNum(w.date) > end - WINDOW_DAYS && dayNum(w.date) <= end);
  const avgWeightKg = Math.round((recent.reduce((a, w) => a + w.kg, 0) / recent.length) * 100) / 100;
  const m = adaptiveTarget({ avgKcal, slopeKgPerDay: slope, goalRateKgPerWeek: s.goalRateKgPerWeek, oldTarget: s.oldTarget, floor: s.floor, ceiling: s.ceiling });
  const trendKgPerWeek = Math.round(slope * 7 * 100) / 100;
  const base = { trendKgPerWeek, goalRateKgPerWeek: s.goalRateKgPerWeek, avgKcal, tdee: m.tdee, oldTarget: s.oldTarget, newTarget: m.newTarget };
  return {
    ok: true,
    asOf: data.asOf,
    loggedDays,
    weighIns,
    avgWeightKg,
    avgKcal: Math.round(avgKcal),
    tdee: Math.round(m.tdee),
    raw: Math.round(m.raw),
    trendKgPerWeek,
    goalRateKgPerWeek: s.goalRateKgPerWeek,
    oldTarget: s.oldTarget,
    newTarget: m.newTarget,
    reason: reasonText(base),
  };
}

/** The check-in week for `today`: its Monday, and the Sunday before it (the last day counted). */
export function checkinWeek(today: string): { weekStart: string; asOf: string } {
  const weekStart = mondayOf(today);
  return { weekStart, asOf: shiftDay(weekStart, -1) };
}
