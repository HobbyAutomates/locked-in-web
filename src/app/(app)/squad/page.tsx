import { redirect } from "next/navigation";
import { getMySquads, getProfile, getPublicSquads, getUnreadCounts } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import SquadScreen from "@/components/SquadScreen";

export const dynamic = "force-dynamic";

export default async function SquadPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const sp = await searchParams;
  // v2.6: a squad has its own page now; old ?g= links land there.
  if (sp.g && /^[0-9a-f-]{36}$/i.test(sp.g)) redirect(`/squad/${sp.g}`);
  const [{ user }, squads, profile, publicSquads, unread] = await Promise.all([requireUser(), getMySquads(), getProfile(), getPublicSquads(), getUnreadCounts()]);
  return <SquadScreen me={user?.id ?? ""} squads={squads} publicSquads={publicSquads} unread={unread} profile={{ name: profile.name || (user?.email ?? "").split("@")[0], username: profile.username, avatar_path: profile.avatar_path }} />;
}
