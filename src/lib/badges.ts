import { daysBetween } from "./dates";

/**
 * The twelve badges, in Cal AI's three tiers: consecutive training days, meals logged, and days
 * that landed inside the calorie goal. Names and thresholds match the Android app's util/Badges.kt.
 */

export type BadgeGroup = "STREAK" | "MEALS" | "CALORIES";
export type Badge = { name: string; group: BadgeGroup; need: number };

export const GROUPS: BadgeGroup[] = ["STREAK", "MEALS", "CALORIES"];

export const ALL_BADGES: Badge[] = [
  { name: "Rookie", group: "STREAK", need: 3 },
  { name: "Getting Serious", group: "STREAK", need: 10 },
  { name: "Locked In", group: "STREAK", need: 50 },
  { name: "Triple Threat", group: "STREAK", need: 100 },
  { name: "No Days Off", group: "STREAK", need: 365 },
  { name: "Immortal", group: "STREAK", need: 1000 },
  { name: "Forking Around", group: "MEALS", need: 5 },
  { name: "Mission: Nutrition", group: "MEALS", need: 50 },
  { name: "The Logfather", group: "MEALS", need: 500 },
  { name: "One Hit Wonder", group: "CALORIES", need: 1 },
  { name: "Loyalty III", group: "CALORIES", need: 7 },
  { name: "Bullseye", group: "CALORIES", need: 30 },
];

/** "50 day streak" / "500 meals logged" / "30 days on target". */
export function requirement(b: Badge): string {
  switch (b.group) {
    case "STREAK":
      return b.need === 1 ? "1 day streak" : `${b.need} day streak`;
    case "MEALS":
      return `${b.need} meals logged`;
    case "CALORIES":
      return b.need === 1 ? "1 day on target" : `${b.need} days on target`;
  }
}

export function groupTitle(g: BadgeGroup) {
  return g === "STREAK" ? "Training streak" : g === "MEALS" ? "Meals logged" : "Calorie goal";
}

/** How far along the user is for each tier. */
export type BadgeProgress = { streakDays: number; meals: number; goalDays: number };

export function progressValue(p: BadgeProgress, g: BadgeGroup) {
  return g === "STREAK" ? p.streakDays : g === "MEALS" ? p.meals : p.goalDays;
}
export function earned(p: BadgeProgress, b: Badge) {
  return progressValue(p, b.group) >= b.need;
}
export function earnedCount(p: BadgeProgress) {
  return ALL_BADGES.filter((b) => earned(p, b)).length;
}

/**
 * Longest run of consecutive calendar days present in `dates` (the badge is a personal best,
 * so a broken streak never takes a badge away).
 */
export function longestDayRun(dates: Iterable<string>): number {
  const sorted = Array.from(new Set(dates)).sort();
  if (!sorted.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Days whose logged calories landed within ±10% of the target. */
export function calorieGoalDays(meals: { date: string; items: { calories: number }[] }[], target: number): number {
  if (target <= 0) return 0;
  const byDay = new Map<string, number>();
  for (const m of meals) byDay.set(m.date, (byDay.get(m.date) ?? 0) + m.items.reduce((a, i) => a + Number(i.calories), 0));
  let n = 0;
  for (const kcal of byDay.values()) if (kcal > 0 && Math.abs(kcal - target) <= target * 0.1) n++;
  return n;
}

/** Share-sheet copy for an earned badge. */
export function shareText(b: Badge) {
  return `Just unlocked "${b.name}" in Locked In — ${requirement(b)}.`;
}
