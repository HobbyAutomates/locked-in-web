import { getDashboard } from "@/lib/data";
import { trainingDates, workoutWeekStreak } from "@/lib/streaks";
import CalendarScreen from "@/components/CalendarScreen";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { profile, workouts, meals, exercises } = await getDashboard();
  return (
    <CalendarScreen
      workouts={workouts}
      meals={meals}
      weekStreak={workoutWeekStreak(trainingDates(workouts, exercises), profile.weekly_workout_target)}
    />
  );
}
