import { getRecentLiftWorkouts, getWorkouts } from "@/lib/data";
import { getPro, getRoutines } from "@/lib/platform-data";
import { addDays, today as todayIso } from "@/lib/dates";
import TrainScreen from "@/components/platform/TrainScreen";

export const dynamic = "force-dynamic";

/** v2.13 Training: routines, planner, muscle map, PR charts. */
export default async function TrainPage() {
  const t = todayIso();
  const [pro, { available, routines }, workouts, lifts] = await Promise.all([getPro(), getRoutines(), getWorkouts(addDays(t, -14), t).catch(() => []), getRecentLiftWorkouts(300).catch(() => [])]);
  return <TrainScreen pro={pro.pro} available={available} routines={routines} workouts={workouts} lifts={lifts} today={t} />;
}
