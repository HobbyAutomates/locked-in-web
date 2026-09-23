import ScanScreen from "@/components/ScanScreen";
import { getScans } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const history = await getScans(30).catch(() => []);
  return <ScanScreen history={history} />;
}
