import type { ActiveDays, EventRow, Use } from "./types";
import { addDays, istDay, istHour, lastNDays, pct, within } from "./time";

/**
 * Who was active when. A user is "active" on an IST day if they sent any app event (including
 * app_open / screen_view / error_shown) or created any logged row that day.
 */
export function activeDays(uses: Use[], events: Pick<EventRow, "user_id" | "created_at">[]): ActiveDays {
  const m: ActiveDays = new Map();
  const touch = (user: string, day: string) => {
    if (!user || !day) return;
    let s = m.get(user);
    if (!s) m.set(user, (s = new Set()));
    s.add(day);
  };
  for (const u of uses) touch(u.user, u.day);
  for (const e of events) touch(e.user_id, istDay(e.created_at));
  return m;
}

/** Users active at least once in the `n` days ending today. */
export function activeUsersIn(active: ActiveDays, today: string, n: number): string[] {
  const out: string[] = [];
  for (const [user, days] of active) for (const d of days) if (within(d, today, n)) { out.push(user); break; }
  return out;
}

export function daysActiveIn(days: Set<string> | undefined, today: string, n: number): number {
  if (!days) return 0;
  let c = 0;
  for (const d of days) if (within(d, today, n)) c++;
  return c;
}

/** Consecutive active days ending today, or ending yesterday when today has nothing yet. */
export function currentStreak(days: Set<string> | undefined, today: string): number {
  if (!days?.size) return 0;
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function lastActiveDay(days: Set<string> | undefined): string | null {
  if (!days?.size) return null;
  let best = "";
  for (const d of days) if (d > best) best = d;
  return best || null;
}

export type StickinessPoint = { day: string; dau: number; wau: number; ratio: number | null };
export type Stickiness = {
  /** Average DAU over the last 7 days. */
  dauAvg7: number;
  wau: number;
  mau: number;
  /** dauAvg7 / WAU: 1/7 ≈ 0.14 means active one day a week, 1 means every day. */
  dauWau: number | null;
  /** dauAvg7 / MAU (30 days). */
  dauMau: number | null;
  series: StickinessPoint[];
};

/** DAU/WAU stickiness, plus a daily series (DAU and trailing-7-day WAU) over `span` days. */
export function stickiness(active: ActiveDays, today: string, span = 30): Stickiness {
  const byDay = new Map<string, Set<string>>();
  for (const [user, days] of active) for (const d of days) {
    let s = byDay.get(d);
    if (!s) byDay.set(d, (s = new Set()));
    s.add(user);
  }
  const usersIn = (end: string, n: number) => {
    const set = new Set<string>();
    for (let i = 0; i < n; i++) byDay.get(addDays(end, -i))?.forEach((u) => set.add(u));
    return set.size;
  };
  const series = lastNDays(today, span).map((day) => {
    const dau = byDay.get(day)?.size ?? 0;
    const wau = usersIn(day, 7);
    return { day, dau, wau, ratio: wau ? Math.round((dau / wau) * 1000) / 1000 : null };
  });
  const last7 = lastNDays(today, 7).map((d) => byDay.get(d)?.size ?? 0);
  const dauAvg7 = Math.round((last7.reduce((a, b) => a + b, 0) / 7) * 100) / 100;
  const wau = usersIn(today, 7);
  const mau = usersIn(today, 30);
  return { dauAvg7, wau, mau, dauWau: pct(dauAvg7, wau), dauMau: pct(dauAvg7, mau), series };
}

/** 24 buckets (IST hour) of how many timestamps fall in each. */
export function hourHistogram(timestamps: string[]): number[] {
  const h = Array.from({ length: 24 }, () => 0);
  for (const t of timestamps) {
    const x = istHour(t);
    if (x >= 0) h[x]++;
  }
  return h;
}

/** The busiest contiguous 3-hour window, e.g. "19:00–22:00"; null with no data. */
export function peakWindow(hist: number[]): string | null {
  if (!hist.some((v) => v > 0)) return null;
  let best = 0;
  let at = 0;
  for (let i = 0; i < 24; i++) {
    const v = hist[i] + hist[(i + 1) % 24] + hist[(i + 2) % 24];
    if (v > best) {
      best = v;
      at = i;
    }
  }
  const hh = (n: number) => `${String(n % 24).padStart(2, "0")}:00`;
  return `${hh(at)}–${hh(at + 3)}`;
}

/** app_open counts: sessions, the days they fell on, and sessions per such day. */
export function sessionsPerDay(appOpens: string[]): { sessions: number; days: number; perDay: number | null } {
  const days = new Set(appOpens.map(istDay).filter(Boolean));
  return { sessions: appOpens.length, days: days.size, perDay: days.size ? Math.round((appOpens.length / days.size) * 10) / 10 : null };
}
