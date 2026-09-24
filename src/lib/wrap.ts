import { addDays, daysBetween, today, weekStart } from "./dates";
import type { ExerciseEntry, Meal, Profile, Workout, Wrap } from "./types";

/**
 * The 9 pm daily wrap, computed server-side for the web Home (Android's util/Wrap.kt does the same
 * sums on the phone for its 21:00 notification). Shown from 21:00 to 04:00 IST; after midnight it
 * still wraps the day that just ended.
 */

const ZONE = "Asia/Kolkata";

/** The hour (0–23) in IST right now. */
export function istHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" }).format(now)) % 24;
}

/** True between 21:00 and 04:00 IST — the window the Wrap card is shown in. */
export function wrapWindow(now = new Date()): boolean {
  const h = istHour(now);
  return h >= 21 || h < 4;
}

/** The day the wrap is about: today, or yesterday when it is past midnight. */
export function wrapDate(now = new Date()): string {
  return istHour(now) < 4 ? addDays(today(), -1) : today();
}

/** Muscle groups for "tomorrow: legs & core", in tie-break order. */
export const WRAP_GROUPS: { label: string; muscles: string[] }[] = [
  { label: "legs", muscles: ["Glutes", "Quads", "Hamstrings", "Calves"] },
  { label: "core", muscles: ["Core"] },
  { label: "back", muscles: ["Back"] },
  { label: "chest", muscles: ["Chest"] },
  { label: "shoulders", muscles: ["Shoulders"] },
  { label: "arms", muscles: ["Biceps", "Triceps", "Forearms"] },
];

/** The two most-rested muscle groups as of `date` ("legs & core"), or "full body" with no history. */
export function tomorrowSuggestion(workouts: Pick<Workout, "date" | "muscles">[], date: string): string {
  const past = workouts.filter((w) => w.date <= date);
  const rest = WRAP_GROUPS.map((g, i) => {
    const last = past.filter((w) => w.muscles.some((m) => g.muscles.includes(m))).reduce<string | null>((a, w) => (a == null || w.date > a ? w.date : a), null);
    return { label: g.label, days: last ? daysBetween(last, date) : Number.POSITIVE_INFINITY, i };
  });
  if (rest.every((r) => r.days === Number.POSITIVE_INFINITY)) return "full body";
  const top = [...rest].sort((a, b) => b.days - a.days || a.i - b.i).slice(0, 2);
  return top.map((r) => r.label).join(" & ");
}

const n0 = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Everything on the Wrap card for `date`. `burned` is the day's burn (exercise log on the web). */
export function computeWrap(profile: Profile, workouts: Workout[], meals: Meal[], exercises: ExerciseEntry[], date = wrapDate()): Wrap {
  const dayMeals = meals.filter((m) => m.date === date);
  const items = dayMeals.flatMap((m) => m.items);
  const protein = items.reduce((a, i) => a + Number(i.protein_g), 0);
  const calories = items.reduce((a, i) => a + Number(i.calories), 0);
  const burned = exercises.filter((e) => e.date === date).reduce((a, e) => a + Number(e.kcal), 0);
  const ws = weekStart(date);
  const sessions = new Set(workouts.filter((w) => w.date >= ws && w.date <= date).map((w) => w.date)).size;
  const best = dayMeals
    .map((m) => ({ name: m.items.map((i) => i.name).slice(0, 3).join(", ") || m.raw_text || "Meal", protein: m.items.reduce((a, i) => a + Number(i.protein_g), 0) }))
    .sort((a, b) => b.protein - a.protein)[0];
  const target = profile.protein_target_g;
  const hit = protein >= target && target > 0;
  const tomorrow = tomorrowSuggestion(workouts, date);
  const proteinPart = hit ? `${Math.round(protein)} g protein ✓` : `${Math.round(protein)} g protein (${Math.max(0, Math.round(target - protein))} g short)`;
  const line = `${date === today() ? "Today" : "Yesterday"}: ${proteinPart} · ${n0(calories)} kcal · ${sessions}/${profile.weekly_workout_target} sessions — tomorrow: ${tomorrow}`;
  return {
    date,
    protein: Math.round(protein),
    proteinTarget: target,
    proteinHit: hit,
    calories: Math.round(calories),
    calorieBudget: Math.round(profile.calorie_target + burned),
    burned: Math.round(burned),
    sessions,
    sessionTarget: profile.weekly_workout_target,
    tomorrow,
    bestMeal: best && best.protein > 0 ? { name: best.name, protein: Math.round(best.protein) } : null,
    line,
  };
}
