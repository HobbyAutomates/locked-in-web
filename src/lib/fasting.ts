import { isTeen, type EdFlag } from "./goals";

/**
 * v2.13 fasting timer (spec §7), pure. Protocols, stages and the "who can use it" rule. The wording
 * is soft on purpose: these are rough, commonly cited windows, not medical claims.
 * Android: util/Fasting.kt.
 */

export type Protocol = { key: string; label: string; fastHours: number; eatHours: number };

export const PROTOCOLS: Protocol[] = [
  { key: "12:12", label: "12:12", fastHours: 12, eatHours: 12 },
  { key: "14:10", label: "14:10", fastHours: 14, eatHours: 10 },
  { key: "16:8", label: "16:8", fastHours: 16, eatHours: 8 },
  { key: "18:6", label: "18:6", fastHours: 18, eatHours: 6 },
  { key: "20:4", label: "20:4", fastHours: 20, eatHours: 4 },
];

export const DEFAULT_FAST_HOURS = 16;
export const MIN_FAST_HOURS = 1;
export const MAX_FAST_HOURS = 72;

/** Target hours clamped to 1–72, to the nearest half hour. */
export function clampHours(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_FAST_HOURS;
  return Math.min(MAX_FAST_HOURS, Math.max(MIN_FAST_HOURS, Math.round(h * 2) / 2));
}

export type Stage = { key: "fed" | "fat_burning" | "ketosis"; label: string; from: number; note: string };

export const STAGES: Stage[] = [
  { key: "fed", label: "Fed", from: 0, note: "Your body is still using your last meal." },
  { key: "fat_burning", label: "Fat-burning", from: 12, note: "Around 12 hours in, many people start leaning more on stored fat." },
  { key: "ketosis", label: "Ketosis", from: 18, note: "From about 18 hours, ketone levels tend to rise. It varies a lot between people." },
];

export function stageAt(hours: number): Stage {
  let s = STAGES[0];
  for (const x of STAGES) if (hours >= x.from) s = x;
  return s;
}

/** Hours between two instants (ms), never negative. */
export function hoursBetween(startMs: number, endMs: number): number {
  return Math.max(0, (endMs - startMs) / 3_600_000);
}

/** "15:42:08" for an elapsed number of milliseconds. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** "16 h" / "16.5 h" / "45 min". */
export function durationText(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const r = Math.round(hours * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} h`;
}

export type FastingAccess = { ok: true } | { ok: false; reason: "teen" | "safety"; title: string; body: string };

/**
 * Hidden under 18 and for anyone the app's eating-disorder safety screen flags (goals.edFlags).
 * Pass the flags already computed for the profile.
 */
export function fastingAccess(age: number | null | undefined, flags: EdFlag[] = []): FastingAccess {
  if (isTeen(age)) return { ok: false, reason: "teen", title: "Not available under 18", body: "Your body is still growing, so Locked In doesn't offer fasting timers under 18. Regular meals fuel growing, training and school." };
  if (flags.length) return { ok: false, reason: "safety", title: "Not available right now", body: "Fasting isn't a good fit when food or weight feels heavy. Regular meals are the kinder plan for now. If food has been on your mind a lot, talking to someone can really help." };
  return { ok: true };
}

