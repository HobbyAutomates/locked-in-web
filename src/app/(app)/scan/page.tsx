import { getProfile, getRecentFoods, getScans } from "@/lib/data";
import ScanScreen from "@/components/ScanScreen";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const [history, profile] = await Promise.all([getScans(), getProfile()]);
  // v2.17: "Recent" re-adds past foods and scans in one tap.
  const recent = await getRecentFoods(history).catch(() => []);
  return <ScanScreen history={history} profile={profile} recent={recent} />;
}
