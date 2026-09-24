import { getBadgeProgress, getDashboard, getExercises, getProgressPhotos, getWeights } from "@/lib/data";
import { addDays } from "@/lib/dates";
import { thisWeekCount, trainingDates, workoutWeekStreak } from "@/lib/streaks";
import ProgressScreen from "@/components/ProgressScreen";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { today, profile, workouts, meals } = await getDashboard();
  const [weights, badges, photos, exercises] = await Promise.all([
    getWeights(),
    getBadgeProgress(profile, workouts, meals),
    getProgressPhotos().catch(() => []),
    getExercises(addDays(today, -180), today),
  ]);
  const dates = trainingDates(workouts, exercises);
  return (
    <ProgressScreen
      profile={profile}
      workouts={workouts}
      meals={meals}
      exercises={exercises}
      weights={weights}
      photos={photos}
      badges={badges}
      weekStreak={workoutWeekStreak(dates, profile.weekly_workout_target)}
      thisWeek={thisWeekCount(dates)}
    />
  );
}
