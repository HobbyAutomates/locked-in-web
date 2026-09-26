import { getPro, getRoutine, getRoutines } from "@/lib/platform-data";
import RoutineEditor from "@/components/platform/RoutineEditor";

export const dynamic = "force-dynamic";

/** v2.13 /train/routine (new) and /train/routine?id=<uuid> (edit). */
export default async function RoutinePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const [pro, list, routine] = await Promise.all([getPro(), getRoutines(), id ? getRoutine(id) : Promise.resolve(null)]);
  return <RoutineEditor routine={routine} available={list.available} pro={pro.pro} />;
}
