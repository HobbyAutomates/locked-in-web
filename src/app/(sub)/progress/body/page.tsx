import { getMeasurements } from "@/lib/platform-data";
import BodyScreen from "@/components/platform/BodyScreen";

export const dynamic = "force-dynamic";

/** v2.13 Progress → Body measurements. */
export default async function BodyPage() {
  const { available, list } = await getMeasurements();
  return <BodyScreen available={available} list={list} />;
}
