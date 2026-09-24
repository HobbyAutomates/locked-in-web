import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, today } from "./dates";
import { workoutWeekStreak } from "./streaks";
import { checkChallengeCompletions } from "./challenges";

/**
 * The per-user daily rollup the squad board reads (`bandlog.daily_stats`), recomputed from the
 * source tables. The web has no Health Connect, so `burned` is the exercise log alone; the Android
 * app writes the same row with Health Connect's active calories folded in (deduplicated as Home does).
 */
export type DailyStatRow = {
  user_id: string;
  date: string;
  trained: boolean;
  protein_g: number;
  calories: number;
  burned: number;
  meals: number;
  week_streak: number;
  updated_at: string;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/** Recompute and upsert `daily_stats` for each of `dates` (defaults to today). Returns the rows written. */
export async function recomputeRollup(supabase: AnyClient, userId: string, dates: string[] = [today()]): Promise<DailyStatRow[]> {
  const days = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (!days.length) return [];
  const t = today();
  const lo = days.reduce((a, b) => (a < b ? a : b));
  const hi = days.reduce((a, b) => (a > b ? a : b));
  const [prof, workouts, meals, burns] = await Promise.all([
    supabase.from("profiles").select("weekly_workout_target").eq("id", userId).maybeSingle(),
    supabase.from("workouts").select("date").eq("user_id", userId).gte("date", addDays(t, -130)).lte("date", t),
    supabase.from("meals").select("date, meal_items(calories, protein_g)").eq("user_id", userId).gte("date", lo).lte("date", hi),
    supabase.from("exercise_log").select("date, kcal").eq("user_id", userId).gte("date", lo).lte("date", hi),
  ]);
  const target = Number(prof.data?.weekly_workout_target ?? 3) || 3;
  const workoutDates = ((workouts.data ?? []) as { date: string }[]).map((w) => w.date);
  const streak = workoutWeekStreak(workoutDates, target);
  const trained = new Set(workoutDates);
  type MealRow = { date: string; meal_items: { calories: number | string; protein_g: number | string }[] | null };
  const mealRows = (meals.data ?? []) as MealRow[];
  const burnRows = (burns.data ?? []) as { date: string; kcal: number | string }[];
  const now = new Date().toISOString();
  const rows: DailyStatRow[] = days.map((date) => {
    const dayMeals = mealRows.filter((m) => m.date === date);
    const items = dayMeals.flatMap((m) => m.meal_items ?? []);
    return {
      user_id: userId,
      date,
      trained: trained.has(date),
      protein_g: r1(items.reduce((a, i) => a + Number(i.protein_g || 0), 0)),
      calories: r1(items.reduce((a, i) => a + Number(i.calories || 0), 0)),
      burned: r1(burnRows.filter((b) => b.date === date).reduce((a, b) => a + Number(b.kcal || 0), 0)),
      meals: dayMeals.length,
      week_streak: streak,
      updated_at: now,
    };
  });
  const { error } = await supabase.from("daily_stats").upsert(rows, { onConflict: "user_id,date" });
  if (error) throw new Error(error.message);
  return rows;
}

/** Best-effort wrapper for the server actions: a failed rollup never fails the save that triggered it. */
export async function rollupQuietly(supabase: AnyClient, userId: string, dates: string[]) {
  try {
    await recomputeRollup(supabase, userId, [...dates, today()]);
  } catch {
    // The squad board just shows the previous numbers until the next save or refresh.
    return;
  }
  // v2.7: fresh daily_stats may have just finished a squad challenge. Never throws.
  await checkChallengeCompletions(supabase, userId);
}
