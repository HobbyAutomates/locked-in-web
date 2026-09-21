import { getDashboard, totalsFor } from "@/lib/data";
import { longDate } from "@/lib/dates";
import { mealDayStreak, thisWeekCount, workoutWeekStreak } from "@/lib/streaks";
import Ring from "@/components/Ring";
import VoiceMealBox from "@/components/VoiceMealBox";
import TodayWorkout from "@/components/TodayWorkout";
import MealList from "@/components/MealList";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { today, profile, workouts, meals } = await getDashboard();
  const totals = totalsFor(meals, today);
  const workoutDates = workouts.map((w) => w.date);
  const mealDates = Array.from(new Set(meals.map((m) => m.date)));
  const weekStreak = workoutWeekStreak(workoutDates, profile.weekly_workout_target);
  const week = thisWeekCount(workoutDates);
  const mealStreak = mealDayStreak(mealDates);
  const todaysWorkouts = workouts.filter((w) => w.date === today);
  const todaysMeals = meals.filter((m) => m.date === today);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="label">{longDate(today)}</p>
        <h1 className="text-4xl font-extrabold">Today</h1>
      </header>

      <div className="flex gap-2 flex-wrap">
        <span className="chip" aria-pressed="false">🔥 {weekStreak} week{weekStreak === 1 ? "" : "s"} on target</span>
        <span className="chip" aria-pressed="false">🏋️ {week}/{profile.weekly_workout_target} this week</span>
        <span className="chip" aria-pressed="false">🍽️ {mealStreak} day{mealStreak === 1 ? "" : "s"} logged</span>
      </div>

      <section className="card flex justify-around">
        <Ring value={totals.protein} target={profile.protein_target_g} label="Protein" unit="g" color="var(--accent)" />
        <Ring value={totals.calories} target={profile.calorie_target} label="Calories" unit="kcal" color="var(--ok)" />
      </section>

      <VoiceMealBox date={today} />
      <MealList meals={todaysMeals} />
      <TodayWorkout date={today} todays={todaysWorkouts} last={workouts[0] ?? null} />
    </div>
  );
}
