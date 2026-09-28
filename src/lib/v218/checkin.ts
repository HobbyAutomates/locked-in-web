/**
 * v2.18 B4 + B8: the 5-second daily check-in (sleep, stress, mood) and the recovery score it feeds.
 * Pure; scripts/check-v218-coach.ts runs fixtures and Android's util/DailyCheckin.kt ports it 1:1.
 *
 * The check-in only ever nudges a day's calorie target UP (a smaller deficit after a bad night or a
 * stressful day), never down, and by at most MAX_DAY_BUMP. Training advice and the coach's tone
 * follow the same inputs.
 */

export type Checkin = {
  date: string;
  /** Hours slept (0–14), null = skipped. */
  sleep_hours: number | null;
  /** 1 (awful) … 5 (great), null = skipped. */
  sleep_quality: number | null;
  /** 1 (calm) … 5 (very stressed). */
  stress: number | null;
  /** 1 (low) … 5 (great). */
  mood: number | null;
  /** Health Connect resting heart rate (Android), bpm. */
  resting_hr?: number | null;
};

export const MAX_DAY_BUMP = 150;
export const SLEEP_CHOICES = [5, 6, 7, 8, 9];
export const SCALE = [1, 2, 3, 4, 5];
export const STRESS_LABELS = ["Calm", "Okay", "Some", "High", "Maxed"];
export const MOOD_LABELS = ["Low", "Meh", "Okay", "Good", "Great"];
export const QUALITY_LABELS = ["Awful", "Poor", "Okay", "Good", "Great"];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const scale = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return v == null || v === "" || !Number.isFinite(n) ? null : clamp(n, 1, 5);
};

/** Cleans a check-in from a form / the database. Null when nothing at all was answered. */
export function cleanCheckin(raw: Record<string, unknown>, date: string): Checkin | null {
  const h = raw.sleep_hours == null || raw.sleep_hours === "" ? null : Number(raw.sleep_hours);
  const hr = raw.resting_hr == null || raw.resting_hr === "" ? null : Math.round(Number(raw.resting_hr));
  const c: Checkin = {
    date,
    sleep_hours: h == null || !Number.isFinite(h) ? null : Math.round(clamp(h, 0, 14) * 2) / 2,
    sleep_quality: scale(raw.sleep_quality),
    stress: scale(raw.stress),
    mood: scale(raw.mood),
    resting_hr: hr == null || !Number.isFinite(hr) || hr < 30 || hr > 130 ? null : hr,
  };
  return c.sleep_hours == null && c.sleep_quality == null && c.stress == null && c.mood == null ? null : c;
}

export const poorSleep = (c: Checkin) => (c.sleep_hours != null && c.sleep_hours < 6) || (c.sleep_quality != null && c.sleep_quality <= 2);
export const goodSleep = (c: Checkin) => (c.sleep_hours == null || c.sleep_hours >= 7) && (c.sleep_quality == null || c.sleep_quality >= 4) && (c.sleep_hours != null || c.sleep_quality != null);
export const highStress = (c: Checkin) => c.stress != null && c.stress >= 4;
export const lowMood = (c: Checkin) => c.mood != null && c.mood <= 2;

export type Tone = "gentle" | "as_chosen" | "push";

export type DayAdjust = {
  /** kcal added to today's target (0…MAX_DAY_BUMP). */
  kcal: number;
  /** One line of training advice for today. */
  training: string;
  /** How the coach should sound today. */
  tone: Tone;
  /** Short reasons, shown under the card ("Short sleep"). */
  reasons: string[];
  /** One sentence for Home. */
  summary: string;
};

/**
 * What today's check-in changes. `goal` is the profile goal; `teen` accounts never have a deficit,
 * so the bump is 0 for them (their target is already maintenance or a surplus).
 */
export function checkinAdjust(c: Checkin | null, goal: string, teen = false): DayAdjust {
  if (!c) return { kcal: 0, training: "Train as planned.", tone: "as_chosen", reasons: [], summary: "" };
  const reasons: string[] = [];
  let kcal = 0;
  const cutting = goal === "lose" && !teen;
  if (poorSleep(c)) {
    reasons.push("Short or poor sleep");
    if (cutting) kcal += 100;
  }
  if (highStress(c)) {
    reasons.push("High stress");
    if (cutting) kcal += 75;
  }
  if (lowMood(c)) reasons.push("Low mood");
  kcal = Math.min(MAX_DAY_BUMP, kcal);

  let training: string;
  let tone: Tone = "as_chosen";
  if (poorSleep(c) && highStress(c)) {
    training = "Recovery day: a 20–30 min walk or mobility. Skip heavy sets today.";
    tone = "gentle";
  } else if (poorSleep(c)) {
    training = "Train, but keep it moderate: same weights, fewer sets, no PR attempts.";
    tone = "gentle";
  } else if (highStress(c)) {
    training = "Movement helps stress: an easy session or a brisk walk. Don't chase numbers today.";
    tone = "gentle";
  } else if (goodSleep(c) && (c.stress == null || c.stress <= 2) && (c.mood == null || c.mood >= 3)) {
    training = "You're fresh: a good day to push a little harder or try a new best.";
    tone = "push";
  } else training = "Train as planned.";
  if (lowMood(c)) tone = "gentle";

  const summary = kcal > 0 ? `+${kcal} kcal buffer today (${reasons.join(", ").toLowerCase()}). ${training}` : reasons.length ? `${reasons.join(", ")}. ${training}` : training;
  return { kcal, training, tone, reasons, summary };
}

/** The coach's tone line for the system prompt ("" when nothing changes). */
export function toneLine(a: DayAdjust): string {
  if (a.tone === "gentle") return `TODAY'S CHECK-IN: ${a.reasons.join(", ").toLowerCase() || "a rough day"}. Be gentler than usual today: acknowledge it, keep asks small, no pressure. Training advice: ${a.training}`;
  if (a.tone === "push") return `TODAY'S CHECK-IN: slept well, low stress. They can handle a slightly bigger ask today. Training advice: ${a.training}`;
  return "";
}

// ---------------------------------------------------------------- B8 recovery

export type RecoveryBand = "push" | "normal" | "deload";

export type Recovery = { score: number; band: RecoveryBand; label: string; advice: string; source: "checkin" | "health_connect" | "mixed" };

const hoursScore = (h: number) => (h >= 8 ? 100 : h >= 7 ? 85 + (h - 7) * 15 : h >= 6 ? 65 + (h - 6) * 20 : h >= 5 ? 40 + (h - 5) * 25 : Math.max(10, 40 - (5 - h) * 15));
const q = (v: number) => 20 * v; // 1..5 → 20..100
const inv = (v: number) => 20 * (6 - v); // stress 1 → 100, 5 → 20

/** Resting heart rate vs the person's own baseline: at or below = 100, +10 bpm or more = 30. */
export function hrScore(rhr: number, baseline: number): number {
  const d = rhr - baseline;
  if (d <= 0) return 100;
  if (d >= 10) return 30;
  return Math.round(100 - d * 7);
}

/**
 * 0–100 from last night's sleep, stress, mood and (Android) resting heart rate, less a little for
 * 3+ training days in a row. ≥ 75 push, 50–74 normal, < 50 deload. Null when there's nothing to go on.
 */
export function recoveryScore(input: { sleepHours?: number | null; sleepQuality?: number | null; stress?: number | null; mood?: number | null; restingHr?: number | null; baselineHr?: number | null; trainedDaysInRow?: number; hcSleep?: boolean }): Recovery | null {
  const parts: [number, number][] = [];
  const sleep: number[] = [];
  if (input.sleepHours != null) sleep.push(hoursScore(input.sleepHours));
  if (input.sleepQuality != null) sleep.push(q(input.sleepQuality));
  if (sleep.length) parts.push([sleep.reduce((a, b) => a + b, 0) / sleep.length, 45]);
  if (input.stress != null) parts.push([inv(input.stress), 25]);
  if (input.mood != null) parts.push([q(input.mood), 15]);
  const hr = input.restingHr != null && input.baselineHr != null && input.baselineHr > 0;
  if (hr) parts.push([hrScore(input.restingHr!, input.baselineHr!), 15]);
  if (!parts.length) return null;
  const w = parts.reduce((a, [, x]) => a + x, 0);
  let score = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
  if ((input.trainedDaysInRow ?? 0) >= 3) score -= 10;
  score = Math.round(clamp(score, 0, 100));
  const band: RecoveryBand = score >= 75 ? "push" : score >= 50 ? "normal" : "deload";
  const fromCheckin = input.stress != null || input.mood != null || (input.sleepQuality != null && !input.hcSleep);
  const fromHc = hr || !!input.hcSleep;
  return {
    score,
    band,
    label: band === "push" ? "Push" : band === "normal" ? "Normal" : "Deload",
    advice:
      band === "push"
        ? "Recovered well. Go for a top set or an extra round today."
        : band === "normal"
          ? "Train as planned and stop 1–2 reps short of failure."
          : "Take it easy: lighter weights (about 60 %), a walk, or mobility. Tomorrow you'll be better for it.",
    source: fromHc && fromCheckin ? "mixed" : fromHc ? "health_connect" : "checkin",
  };
}

/** Consecutive days trained up to and including yesterday (today's session doesn't count yet). */
export function trainedInRow(trainedDates: Iterable<string>, today: string): number {
  const set = new Set(trainedDates);
  let n = 0;
  let d = new Date(`${today}T00:00:00Z`).getTime() - 86_400_000;
  while (set.has(new Date(d).toISOString().slice(0, 10))) {
    n++;
    d -= 86_400_000;
  }
  return n;
}
