import { getDashboard } from "@/lib/data";
import { thisWeekCount, workoutWeekStreak } from "@/lib/streaks";
import HomeScreen from "@/components/HomeScreen";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ celebrate?: string }> }) {
  const [{ today, profile, workouts, meals }, sp] = await Promise.all([getDashboard(), searchParams]);
  const workoutDates = workouts.map((w) => w.date);
  return (
    <HomeScreen
      today={today}
      profile={profile}
      workouts={workouts}
      meals={meals}
      weekStreak={workoutWeekStreak(workoutDates, profile.weekly_workout_target)}
      thisWeek={thisWeekCount(workoutDates)}
      celebrate={sp.celebrate === "1"}
    />
  );
}
