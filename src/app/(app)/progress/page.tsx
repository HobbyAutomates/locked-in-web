import { getBadgeProgress, getDashboard, getWeights } from "@/lib/data";
import { thisWeekCount, workoutWeekStreak } from "@/lib/streaks";
import ProgressScreen from "@/components/ProgressScreen";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { profile, workouts, meals, exercises } = await getDashboard();
  const [weights, badges] = await Promise.all([getWeights(10), getBadgeProgress(profile, workouts, meals)]);
  const dates = workouts.map((w) => w.date);
  return (
    <ProgressScreen
      profile={profile}
      workouts={workouts}
      meals={meals}
      exercises={exercises}
      weights={weights}
      badges={badges}
      weekStreak={workoutWeekStreak(dates, profile.weekly_workout_target)}
      thisWeek={thisWeekCount(dates)}
    />
  );
}
