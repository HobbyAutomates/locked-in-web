import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getExercises, getFoodUsage, getPresets, getProfile, getRecentLiftWorkouts, getWorkout, getWorkouts } from "@/lib/data";
import { getExercise } from "@/lib/activityActions";
import { listSavedMeals } from "@/lib/actions";
import { addDays, today as todayIso } from "@/lib/dates";
import LogScreen from "@/components/LogScreen";

export const dynamic = "force-dynamic";

/**
 * /log — Food · Activity. `?mode=meal` opens Food; `?workout=<id>` / `?exercise=<id>` open that
 * row's editor (v2.8); `?mode=exercise` is the pre-2.8 link and opens Activity.
 */
export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mode?: string; workout?: string; exercise?: string; prefill?: string }>;
}) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const editingExercise = sp.exercise ? await getExercise(sp.exercise).catch(() => null) : null;
  // A workout's auto-burn row edits through its workout.
  if (editingExercise?.source === "workout" && editingExercise.note) redirect(`/log?workout=${encodeURIComponent(editingExercise.note)}`);
  const t = todayIso();
  const [profile, existing, savedMeals, presets, usage, recentWorkouts, recentExercises, liftHistory] = await Promise.all([
    getProfile(),
    sp.workout ? getWorkout(sp.workout) : Promise.resolve(null),
    listSavedMeals().catch(() => []),
    getPresets().catch(() => []),
    getFoodUsage().catch(() => ({})),
    getWorkouts(addDays(t, -120), t).catch(() => []),
    getExercises(addDays(t, -60), t).catch(() => []),
    getRecentLiftWorkouts().catch(() => []),
  ]);
  return (
    <LogScreen
      existing={existing}
      editingExercise={editingExercise}
      date={existing?.date ?? editingExercise?.date ?? sp.date ?? t}
      startOnMeal={sp.mode === "meal" || sp.prefill === "1"}
      savedMeals={savedMeals}
      presets={presets}
      usage={usage}
      profile={profile}
      recentExercises={recentExercises}
      recentWorkouts={recentWorkouts}
      liftHistory={liftHistory}
      prefill={sp.prefill === "1"}
    />
  );
}
