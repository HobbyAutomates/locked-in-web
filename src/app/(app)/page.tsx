import { getDashboard, getMyNudges } from "@/lib/data";
import { activityDayStreak, thisWeekCount, workoutWeekStreak } from "@/lib/streaks";
import { computeWrap, wrapWindow } from "@/lib/wrap";
import HomeScreen from "@/components/HomeScreen";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ celebrate?: string }> }) {
  const [{ today, profile, workouts, meals, exercises }, nudges, sp] = await Promise.all([getDashboard(), getMyNudges(), searchParams]);
  const workoutDates = workouts.map((w) => w.date);
  // The 9 pm wrap: only between 21:00 and 04:00 IST, computed here so the card renders with the page.
  const wrap = wrapWindow() ? computeWrap(profile, workouts, meals, exercises) : null;
  return (
    <HomeScreen
      today={today}
      profile={profile}
      workouts={workouts}
      meals={meals}
      exercises={exercises}
      weekStreak={workoutWeekStreak(workoutDates, profile.weekly_workout_target)}
      dayStreak={activityDayStreak(workoutDates, exercises.map((e) => e.date), meals.map((m) => m.date))}
      thisWeek={thisWeekCount(workoutDates)}
      celebrate={sp.celebrate === "1"}
      wrap={wrap}
      nudges={nudges}
    />
  );
}
