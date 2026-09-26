import { getRecentLiftWorkouts } from "@/lib/data";
import { getPro } from "@/lib/platform-data";
import ExerciseStats from "@/components/platform/ExerciseStats";

export const dynamic = "force-dynamic";

/** v2.13 /train/exercise?name=Bench%20press — PR chart, estimated 1RM, muscles. */
export default async function ExercisePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  const clean = (name ?? "").trim().slice(0, 60) || "Exercise";
  const [pro, lifts] = await Promise.all([getPro(), getRecentLiftWorkouts(400).catch(() => [])]);
  return <ExerciseStats name={clean} lifts={lifts} pro={pro.pro} />;
}
