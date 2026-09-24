import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getExercises, getFoodUsage, getLatestWorkout, getPresets, getProfile, getWorkout } from "@/lib/data";
import { listSavedMeals } from "@/lib/actions";
import { addDays, today as todayIso } from "@/lib/dates";
import LogScreen from "@/components/LogScreen";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mode?: string; workout?: string; prefill?: string }>;
}) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const [profile, existing, savedMeals, presets, usage, last, recentExercises] = await Promise.all([
    getProfile(),
    sp.workout ? getWorkout(sp.workout) : Promise.resolve(null),
    listSavedMeals().catch(() => []),
    getPresets().catch(() => []),
    getFoodUsage().catch(() => ({})),
    sp.workout ? Promise.resolve(null) : getLatestWorkout().catch(() => null),
    getExercises(addDays(todayIso(), -60), todayIso()).catch(() => []),
  ]);
  return (
    <LogScreen
      existing={existing}
      last={last}
      date={existing?.date ?? sp.date ?? todayIso()}
      startOnMeal={sp.mode === "meal" || sp.prefill === "1"}
      startOnExercise={sp.mode === "exercise"}
      savedMeals={savedMeals}
      presets={presets}
      usage={usage}
      profile={profile}
      recentExercises={recentExercises}
      prefill={sp.prefill === "1"}
    />
  );
}
