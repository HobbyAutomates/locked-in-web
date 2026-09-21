import { getDashboard } from "@/lib/data";
import { thisWeekCount, workoutWeekStreak } from "@/lib/streaks";
import ProgressScreen from "@/components/ProgressScreen";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { profile, workouts, meals } = await getDashboard();
  const dates = workouts.map((w) => w.date);
  return (
    <ProgressScreen
      profile={profile}
      workouts={workouts}
      meals={meals}
      weekStreak={workoutWeekStreak(dates, profile.weekly_workout_target)}
      thisWeek={thisWeekCount(dates)}
    />
  );
}
