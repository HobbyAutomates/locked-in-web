import { getDashboard, getMyNudges, getWater } from "@/lib/data";
import { getFasting, getNutritionSettings, getWeeklyCheckin } from "@/lib/nutrition-data";
import { addDays, today as todayIso } from "@/lib/dates";
import { ageYears, isTeen } from "@/lib/goals";
import { activityDayStreak, thisWeekCount, trainingDates, workoutWeekStreak } from "@/lib/streaks";
import { computeWrap, wrapWindow } from "@/lib/wrap";
import HomeScreen from "@/components/HomeScreen";
import { createClient } from "@/lib/supabase/server";

/** v2.14 (schema_v37) Home extras in their own query, so a database without v37 still renders Home. */
async function getV214Home(): Promise<{ onboardedV2: boolean | null; milestonesSeen: string[] | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("onboarded_v2, milestones_seen").maybeSingle();
  if (error || !data) return { onboardedV2: null, milestonesSeen: null };
  const d = data as { onboarded_v2?: boolean | null; milestones_seen?: string[] | null };
  return { onboardedV2: d.onboarded_v2 ?? null, milestonesSeen: d.milestones_seen ?? [] };
}

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ celebrate?: string }> }) {
  const t = todayIso();
  const [{ today, profile, workouts, meals, exercises }, nudges, sp, water, settings, v214] = await Promise.all([getDashboard(), getMyNudges(), searchParams, getWater(addDays(t, -7), t), getNutritionSettings(), getV214Home()]);
  // v2.13: the Monday check-in (computed once a week when adaptive targets are on) and a running fast.
  const teen = isTeen(ageYears(profile.dob));
  const [checkin, fasting] = await Promise.all([getWeeklyCheckin(profile, settings, meals), teen || !settings.available ? Promise.resolve(null) : getFasting()]);
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
      checkin={checkin.row}
      fast={fasting?.active ?? null}
      onboardedV2={v214.onboardedV2}
      milestonesSeen={v214.milestonesSeen}
    />
  );
}
