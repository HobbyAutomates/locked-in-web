import CoachHub from "@/components/v218/CoachHub";
import { getProfile } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach hub · Locked In" };

/** v2.18 coach hub: check-in, weekly review, plateau, why the target changed, consistency, festival and cycle. */
export default async function CoachHubPage() {
  const profile = await getProfile().catch(() => null);
  return <CoachHub gender={profile?.gender ?? null} />;
}
