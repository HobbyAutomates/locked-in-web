import { getMySquads, getProfile, getSentNudges, getSquadBoard } from "@/lib/data";
import { today } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import SquadScreen from "@/components/SquadScreen";

export const dynamic = "force-dynamic";

export default async function SquadPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const [{ user }, squads, profile, sent, sp] = await Promise.all([requireUser(), getMySquads(), getProfile(), getSentNudges(), searchParams]);
  const selected = squads.find((s) => s.id === sp.g) ?? squads[0] ?? null;
  const board = selected ? await getSquadBoard(selected.id) : [];
  return <SquadScreen me={user?.id ?? ""} today={today()} squads={squads} selectedId={selected?.id ?? null} board={board} sentNudges={sent} shareStats={profile.share_stats} />;
}
