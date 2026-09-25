import { addDays, daysBetween, weekStart } from "../../dates";

/** IST day/hour helpers for the insights layer. Pure; no imports beyond src/lib/dates. */

export { addDays, daysBetween, weekStart };

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" });

/** The app's day (IST) for a timestamp; "" for a missing/invalid one. */
export function istDay(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : DAY.format(d);
}

/** IST hour 0–23, or -1 for a missing/invalid timestamp. */
export function istHour(ts: string | null | undefined): number {
  if (!ts) return -1;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return -1;
  const h = Number(HOUR.formatToParts(d).find((p) => p.type === "hour")?.value);
  return Number.isFinite(h) ? h % 24 : -1;
}

/** `n` IST days ending at `today`, oldest first. */
export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** True when `day` is one of the `n` days ending at `today` (inclusive). */
export function within(day: string, today: string, n: number): boolean {
  return !!day && day <= today && day > addDays(today, -n);
}

/** Days from `day` to `today` (0 = today). */
export function daysAgo(day: string, today: string): number {
  return daysBetween(day, today);
}

/** Mondays of the last `n` weeks ending with the week containing `today`, oldest first. */
export function lastNWeeks(today: string, n: number): string[] {
  const cur = weekStart(today);
  return Array.from({ length: n }, (_, i) => addDays(cur, (i - n + 1) * 7));
}

/** A synthetic noon-IST timestamp for rows that only have a date. */
export function noonOf(day: string): string {
  return `${day}T12:00:00+05:30`;
}

export const pct = (a: number, b: number): number | null => (b > 0 ? a / b : null);
export const round = (v: number, dp = 1): number => Math.round(v * 10 ** dp) / 10 ** dp;
