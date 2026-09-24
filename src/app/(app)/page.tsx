import { getDashboard, getMyNudges, getWater } from "@/lib/data";
import { addDays, today as todayIso } from "@/lib/dates";
import { activityDayStreak, thisWeekCount, trainingDates, workoutWeekStreak } from "@/lib/streaks";
import { computeWrap, wrapWindow } from "@/lib/wrap";
import HomeScreen from "@/components/HomeScreen";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ celebrate?: string }> }) {
  const t = todayIso();
  const [{ today, profile, workouts, meals, exercises }, nudges, sp, water] = await Promise.all([getDashboard(), getMyNudges(), searchParams, getWater(addDays(t, -7), t)]);
  const workoutDates = workouts.map((w) => w.date);
  // v2.5: cardio / sport / yoga on the exercise log count toward the week streak too.
  const trainedDates = trainingDates(workouts, exercises);
  // The 9 pm wrap: only between 21:00 and 04:00 IST, computed here so the card renders with the page.
  const wrap = wrapWindow() ? computeWrap(profile, workouts, meals, exercises) : null;
  return (
    <HomeScreen
      today={today}
      profile={profile}
      workouts={workouts}
      meals={meals}
      exercises={exercises}
      weekStreak={workoutWeekStreak(trainedDates, profile.weekly_workout_target)}
      dayStreak={activityDayStreak(workoutDates, exercises.map((e) => e.date), meals.map((m) => m.date))}
      thisWeek={thisWeekCount(trainedDates)}
      celebrate={sp.celebrate === "1"}
      wrap={wrap}
      nudges={nudges}
      water={water}
    />
  );
}
