import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getPresets, getProfile, getWorkout } from "@/lib/data";
import { listSavedMeals } from "@/lib/actions";
import { today as todayIso } from "@/lib/dates";
import LogScreen from "@/components/LogScreen";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mode?: string; workout?: string }>;
}) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const [profile, existing, savedMeals, presets] = await Promise.all([
    getProfile(),
    sp.workout ? getWorkout(sp.workout) : Promise.resolve(null),
    listSavedMeals().catch(() => []),
    getPresets().catch(() => []),
  ]);
  return (
      <LogScreen
        existing={existing}
        date={existing?.date ?? sp.date ?? todayIso()}
        startOnMeal={sp.mode === "meal"}
        startOnExercise={sp.mode === "exercise"}
        savedMeals={savedMeals}
        presets={presets}
        profile={profile}
      />
  );
}
