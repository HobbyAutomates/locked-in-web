import { getDashboard } from "@/lib/data";
import { workoutWeekStreak } from "@/lib/streaks";
import CalendarScreen from "@/components/CalendarScreen";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { profile, workouts, meals } = await getDashboard();
  return (
    <CalendarScreen
      workouts={workouts}
      meals={meals}
      weekStreak={workoutWeekStreak(workouts.map((w) => w.date), profile.weekly_workout_target)}
    />
  );
}
