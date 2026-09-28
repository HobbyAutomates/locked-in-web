/**
 * v2.18 D5 streak freeze tokens (schema_v44 streak_freezes / freeze_events, RPCs freeze_sync and
 * freeze_gift). Pure: the server is the source of truth, these mirror its rules so the apps can
 * show the state, explain it and test it. Android: util/Freezes.kt (same names, same results).
 *
 * Rules
 *   - Earn 1 per perfect week: Monday-Sunday (IST) with something logged on all 7 days. Only the
 *     last two completed weeks are looked at on each sync; max 3 tokens (a week earned at 3 is
 *     spent, not banked).
 *   - Auto-use: the run of empty days ending yesterday. If the tokens cover the whole run (and the
 *     day before it was active or frozen), every day in it is frozen. A run longer than the tokens
 *     (or than 3) means the streak is gone and nothing is spent. Today never counts as missed.
 *   - A frozen day counts as active for the day streak (both apps + the server's day_streak).
 *   - Gift: one of mine to a squadmate with room (< 3), once per person per 7 days.
 */
import { addDays, daysBetween, weekStart } from "../dates";

export const MAX_FREEZES = 3;
export const EARN_LOOKBACK_WEEKS = 2;
export const GIFT_COOLDOWN_DAYS = 7;

export type FreezeState = { tokens: number; usedDays: string[] };

export const clampTokens = (n: unknown) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(MAX_FREEZES, v)) : 0;
};

const toSet = (d: Iterable<string>) => (d instanceof Set ? (d as Set<string>) : new Set(d));

/** Week starts (Mondays) of the last `lookback` COMPLETED weeks where all 7 days were active. Newest first. */
export function perfectWeeks(active: Iterable<string>, today: string, lookback = EARN_LOOKBACK_WEEKS): string[] {
  const set = toSet(active);
  const out: string[] = [];
  const thisMonday = weekStart(today);
  for (let k = 1; k <= lookback; k++) {
    const ws = addDays(thisMonday, -7 * k);
    let ok = true;
    for (let i = 0; i < 7; i++) if (!set.has(addDays(ws, i))) ok = false;
    if (ok) out.push(ws);
  }
  return out;
}

/**
 * The days the next sync would freeze: the empty run ending yesterday, when `tokens` cover it and
 * the day before it is active or frozen. `firstDay` = the first day anything was ever logged (no
 * freezing before someone started). Newest first.
 */
export function planFreezeUse(active: Iterable<string>, frozen: Iterable<string>, tokens: number, today: string, firstDay: string | null): string[] {
  if (!firstDay) return [];
  const a = toSet(active);
  const f = toSet(frozen);
  const gap: string[] = [];
  let d = addDays(today, -1);
  while (gap.length < MAX_FREEZES + 1 && d > firstDay && !a.has(d) && !f.has(d)) {
    gap.push(d);
    d = addDays(d, -1);
  }
  if (!gap.length || gap.length > clampTokens(tokens)) return [];
  if (!a.has(d) && !f.has(d)) return [];
  return gap;
}

/** What one freeze_sync does, given what the server has already recorded. */
export function simulateSync(
  input: { tokens: number; earnedWeeks: string[]; usedDays: string[]; active: Iterable<string>; firstDay: string | null },
  today: string,
): { tokens: number; earnedNow: string[]; usedNow: string[]; earnedWeeks: string[]; usedDays: string[] } {
  const active = toSet(input.active);
  let tokens = clampTokens(input.tokens);
  const recorded = new Set(input.earnedWeeks);
  const earnedNow: string[] = [];
  const earnedWeeks = [...input.earnedWeeks];
  for (const ws of perfectWeeks(active, today)) {
    if (recorded.has(ws)) continue;
    earnedWeeks.push(ws);
    if (tokens < MAX_FREEZES) {
      tokens++;
      earnedNow.push(ws);
    }
  }
  const usedNow = planFreezeUse(active, input.usedDays, tokens, today, input.firstDay);
  tokens -= usedNow.length;
  return { tokens, earnedNow, usedNow, earnedWeeks, usedDays: [...usedNow, ...input.usedDays] };
}

/** Streak input: active days plus frozen days (spread the result into activityDayStreak). */
export function withFrozen(activeLists: string[][], frozen: string[]): string[][] {
  return frozen.length ? [...activeLists, frozen] : activeLists;
}

export type GiftBlock = "none" | "full" | "cooldown" | "self";
export type GiftCheck = { ok: true } | { ok: false; reason: GiftBlock };

export function canGift(my: number, theirs: number | null, lastGiftAt: string | null, now: Date = new Date(), self = false): GiftCheck {
  if (self) return { ok: false, reason: "self" };
  if (clampTokens(my) < 1) return { ok: false, reason: "none" };
  if (theirs != null && clampTokens(theirs) >= MAX_FREEZES) return { ok: false, reason: "full" };
  if (lastGiftAt) {
    const t = Date.parse(lastGiftAt);
    if (Number.isFinite(t) && now.getTime() - t < GIFT_COOLDOWN_DAYS * 864e5) return { ok: false, reason: "cooldown" };
  }
  return { ok: true };
}

export const GIFT_REASON_TEXT: Record<GiftBlock, string> = {
  none: "You have no freezes to gift",
  full: "They already have 3 freezes",
  cooldown: "You gifted them one this week",
  self: "Pick a squadmate",
};

/** "2 freezes" / "1 freeze" / "No freezes". */
export function freezeCountText(n: number): string {
  const c = clampTokens(n);
  return c === 0 ? "No freezes" : `${c} ${c === 1 ? "freeze" : "freezes"}`;
}

/**
 * One line under the tokens: how to earn the next one, given which days of THIS week (Mon..today)
 * are active.
 */
export function earnHint(tokens: number, active: Iterable<string>, today: string): string {
  if (clampTokens(tokens) >= MAX_FREEZES) return "You're at the max of 3. Use one, then earn it back.";
  const set = toSet(active);
  const ws = weekStart(today);
  const dayIdx = daysBetween(ws, today); // 0 = Monday
  let missed = false;
  for (let i = 0; i < dayIdx; i++) if (!set.has(addDays(ws, i))) missed = true;
  if (missed) return "Log all 7 days of a week (Mon to Sun) to earn one.";
  const left = 7 - dayIdx - (set.has(today) ? 1 : 0);
  if (left === 0) return "Perfect week in the bag. Your freeze lands on Monday.";
  return `Log every day to Sunday (${left} to go) to earn one.`;
}

/** Rows of freeze_events → the used days, earned weeks and when I last gifted each person. */
export function parseFreezeEvents(rows: { kind?: unknown; ref?: unknown; other_user?: unknown; created_at?: unknown }[]): {
  usedDays: string[];
  earnedWeeks: string[];
  lastGiftTo: Record<string, string>;
} {
  const usedDays: string[] = [];
  const earnedWeeks: string[] = [];
  const lastGiftTo: Record<string, string> = {};
  const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  for (const r of rows) {
    if (r.kind === "use" && isDay(r.ref)) usedDays.push(r.ref);
    else if (r.kind === "earn" && isDay(r.ref)) earnedWeeks.push(r.ref);
    else if (r.kind === "gift_out" && typeof r.other_user === "string" && typeof r.created_at === "string") {
      if (!lastGiftTo[r.other_user] || lastGiftTo[r.other_user] < r.created_at) lastGiftTo[r.other_user] = r.created_at;
    }
  }
  usedDays.sort().reverse();
  earnedWeeks.sort().reverse();
  return { usedDays, earnedWeeks, lastGiftTo };
}

/** Local key: the last day this device ran freeze_sync (once a day is plenty). */
export const FREEZE_SYNC_KEY = "li-freeze-sync";
