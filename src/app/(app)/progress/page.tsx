import { getBadgeProgress, getDashboard, getExercises, getProgressPhotos, getWeights } from "@/lib/data";
import { addDays } from "@/lib/dates";
import { activityDayStreak, thisWeekCount, trainingDates, workoutWeekStreak } from "@/lib/streaks";
import ProgressScreen from "@/components/ProgressScreen";
import { getMeasurements } from "@/lib/platform-data";
import { latestWaist } from "@/lib/body";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { today, profile, workouts, meals } = await getDashboard();
  const [weights, badges, photos, exercises, body] = await Promise.all([
    getWeights(),
    getBadgeProgress(profile, workouts, meals),
    getProgressPhotos().catch(() => []),
    getExercises(addDays(today, -180), today),
    getMeasurements().catch(() => ({ available: false, list: [] })),
  ]);
  const dates = trainingDates(workouts, exercises);
  return (
    <ProgressScreen
      // v2.13: waist ÷ height on the BMI card uses the latest body measurement, else the saved profile waist.
      profile={{ ...profile, waist_cm: latestWaist(body.list, profile.waist_cm) }}
      measurements={body.available ? body.list : null}
      workouts={workouts}
      meals={meals}
      exercises={exercises}
      weights={weights}
      photos={photos}
      badges={badges}
      weekStreak={workoutWeekStreak(dates, profile.weekly_workout_target)}
      dayStreak={activityDayStreak(
        workouts.map((w) => w.date),
        exercises.map((e) => e.date),
        meals.map((m) => m.date),
      )}
      thisWeek={thisWeekCount(dates)}
    />
  );
}
