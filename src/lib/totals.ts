import { addDays } from "./dates";
import type { ExerciseEntry, Meal, Profile } from "./types";

/** Day totals across every meal logged on `date`. Pure, so client components can use it too. */
export function totalsFor(meals: Meal[], date: string) {
  const items = meals.filter((m) => m.date === date).flatMap((m) => m.items);
  return items.reduce(
    (a, i) => ({
      calories: a.calories + Number(i.calories),
      protein: a.protein + Number(i.protein_g),
      carbs: a.carbs + Number(i.carbs_g),
      fat: a.fat + Number(i.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Most a day can carry over into the next with "Rollover calories". */
export const ROLLOVER_CAP = 200;

const burnedOn = (exercises: ExerciseEntry[], date: string) => exercises.filter((e) => e.date === date).reduce((a, e) => a + Number(e.kcal || 0), 0);

/**
 * v2.3 calorie budget for `date`, honouring the two Preferences toggles:
 * - add_burned_to_goal: that day's exercise burn is added to the goal;
 * - rollover_calories: whatever was left of yesterday's goal (only if yesterday had meals logged)
 *   carries over, capped at 200 kcal. Yesterday's own goal includes its burn when that toggle is on.
 */
export function calorieBudget(profile: Pick<Profile, "calorie_target" | "add_burned_to_goal" | "rollover_calories">, meals: Meal[], exercises: ExerciseEntry[], date: string) {
  const base = profile.calorie_target;
  const burned = profile.add_burned_to_goal ? burnedOn(exercises, date) : 0;
  let rollover = 0;
  if (profile.rollover_calories) {
    const y = addDays(date, -1);
    if (meals.some((m) => m.date === y)) {
      const yGoal = base + (profile.add_burned_to_goal ? burnedOn(exercises, y) : 0);
      rollover = Math.min(ROLLOVER_CAP, Math.max(0, yGoal - totalsFor(meals, y).calories));
    }
  }
  return { base, burned, rollover: Math.round(rollover), budget: Math.round(base + burned + rollover) };
}
