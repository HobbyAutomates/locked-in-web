import { redirect } from "next/navigation";
import { getRecentLiftWorkouts } from "@/lib/data";
import { getPro, getRoutine } from "@/lib/platform-data";
import { today as todayIso } from "@/lib/dates";
import LiveWorkout from "@/components/platform/LiveWorkout";
import SubPage from "@/components/SubPage";
import { ProLocked } from "@/components/platform/kit";

export const dynamic = "force-dynamic";

/** v2.13 /train/session?routine=<id>&day=<index> — live workout mode, pre-filled from the routine. */
export default async function SessionPage({ searchParams }: { searchParams: Promise<{ routine?: string; day?: string }> }) {
  const sp = await searchParams;
  const [pro, routine, history] = await Promise.all([getPro(), sp.routine ? getRoutine(sp.routine) : Promise.resolve(null), getRecentLiftWorkouts(300).catch(() => [])]);
  const idx = Math.max(0, Math.round(Number(sp.day) || 0));
  const day = routine?.days[idx];
  if (!routine || !day || !day.exercises.length) redirect("/train");
  if (!pro.pro)
    return (
      <SubPage title="Workout" back="/train">
        <ProLocked feature="Live workout mode" />
      </SubPage>
    );
  return <LiveWorkout routineId={routine.id} routineName={routine.name} dayIndex={idx} day={day} history={history} today={todayIso()} />;
}
