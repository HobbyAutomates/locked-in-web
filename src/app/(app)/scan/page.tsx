import { getProfile, getScans } from "@/lib/data";
import ScanScreen from "@/components/ScanScreen";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const [history, profile] = await Promise.all([getScans(), getProfile()]);
  return <ScanScreen history={history} profile={profile} />;
}
