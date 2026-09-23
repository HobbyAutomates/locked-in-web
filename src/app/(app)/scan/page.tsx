import { getProfile, getScans } from "@/lib/data";
import ScanScreen from "@/components/ScanScreen";

export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const [history, profile, sp] = await Promise.all([getScans(), getProfile(), searchParams]);
  const mode = sp.mode === "photo" || sp.mode === "barcode" ? sp.mode : "label";
  return <ScanScreen history={history} profile={profile} initialMode={mode} />;
}
