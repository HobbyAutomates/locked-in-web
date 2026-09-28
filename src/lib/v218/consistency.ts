/**
 * v2.18 B11 consistency score: 0–100 over the last 14 days from logging, protein, training and
 * sleep. Pure; Android util/Consistency.kt. Sleep only counts when the person has used the daily
 * check-in (its weight is shared out over the other three otherwise), so skipping check-ins never
 * drags the score down.
 */

export const WINDOW = 14;

export type DayFacts = { date: string; logged: boolean; protein: number; trained: boolean; sleepHours: number | null; sleepQuality: number | null };

export type Consistency = {
  score: number;
  label: string;
  parts: { key: "logging" | "protein" | "training" | "sleep"; label: string; pct: number; weight: number }[];
  /** The weakest part, for "to raise it:" copy. */
  weakest: string;
  tip: string;
};

const WEIGHTS = { logging: 35, protein: 25, training: 25, sleep: 15 } as const;

export function consistencyLabel(score: number): string {
  return score >= 80 ? "Locked in" : score >= 60 ? "Building" : score >= 40 ? "Wobbly" : "Restarting";
}

/**
 * `days` = the last 14 days (any order); protein hits count at ≥ 90 % of the target; training is
 * sessions against the weekly target (scaled to 2 weeks, capped at 100 %).
 */
export function consistencyScore(days: DayFacts[], targets: { protein: number; workoutsPerWeek: number }): Consistency {
  const d = days.slice(-WINDOW);
  const n = Math.max(1, d.length);
  const logging = d.filter((x) => x.logged).length / n;
  const proteinHits = d.filter((x) => x.logged && targets.protein > 0 && x.protein >= targets.protein * 0.9).length / n;
  const goal = Math.max(1, targets.workoutsPerWeek) * (n / 7);
  const training = Math.min(1, d.filter((x) => x.trained).length / goal);
  const sleepDays = d.filter((x) => x.sleepHours != null || x.sleepQuality != null);
  const sleepGood = sleepDays.filter((x) => (x.sleepHours == null || x.sleepHours >= 7) && (x.sleepQuality == null || x.sleepQuality >= 3)).length;
  const hasSleep = sleepDays.length >= 3;
  const sleep = hasSleep ? sleepGood / sleepDays.length : 0;
  const parts: Consistency["parts"] = [
    { key: "logging", label: "Logging", pct: Math.round(logging * 100), weight: WEIGHTS.logging },
    { key: "protein", label: "Protein", pct: Math.round(proteinHits * 100), weight: WEIGHTS.protein },
    { key: "training", label: "Training", pct: Math.round(training * 100), weight: WEIGHTS.training },
  ];
  if (hasSleep) parts.push({ key: "sleep", label: "Sleep", pct: Math.round(sleep * 100), weight: WEIGHTS.sleep });
  const w = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round(parts.reduce((a, p) => a + p.pct * p.weight, 0) / w);
  const weakest = [...parts].sort((a, b) => a.pct - b.pct || b.weight - a.weight)[0];
  const tips: Record<string, string> = {
    logging: "Log at least one meal every day, even a rough one.",
    protein: `Hit ${targets.protein} g protein on more days: add curd, eggs, paneer or dal to one meal.`,
    training: `Train ${targets.workoutsPerWeek}× a week; even a 20-minute home session counts.`,
    sleep: "Aim for 7+ hours: same bedtime, phone away 30 minutes before.",
  };
  return { score, label: consistencyLabel(score), parts, weakest: weakest.label, tip: tips[weakest.key] };
}
