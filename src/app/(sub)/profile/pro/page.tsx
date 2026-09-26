import { getPro } from "@/lib/platform-data";
import ProScreen from "@/components/platform/ProScreen";

export const dynamic = "force-dynamic";

/** v2.13 Profile → Locked In Pro. */
export default async function ProPage() {
  return <ProScreen state={await getPro()} />;
}
