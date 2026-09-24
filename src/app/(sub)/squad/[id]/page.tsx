import { redirect } from "next/navigation";
import { getJoinRequests, getLeaderboard, getProfile, getSentNudges, getSquad, getSquadPosts } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import SquadRoom from "@/components/SquadRoom";
import { CHAT_KINDS, FEED_KINDS } from "@/lib/squadPosts";
import { closeBattleDay } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function SquadRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/squad");
  const [{ user }, squad] = await Promise.all([requireUser(), getSquad(id)]);
  // Not a member (RLS hides the row): back to the hub.
  if (!squad || !user) redirect("/squad");
  const todayIso = today();
  const yesterdayIso = addDays(todayIso, -1);
  const [chat, feed, leaderboard, sent, profile, requests, crown] = await Promise.all([
    getSquadPosts(id, CHAT_KINDS),
    getSquadPosts(id, FEED_KINDS),
    getLeaderboard(id),
    getSentNudges(),
    getProfile(),
    squad.owner_id === user.id ? getJoinRequests(id) : Promise.resolve([]),
    // Closing yesterday's battle (idempotent) on every load is the spec's "no cron" design: the
    // first read after a day closes inserts the win + crown post; every later read is a no-op.
    squad.battle_enabled ? closeBattleDay(id, yesterdayIso) : Promise.resolve(null),
  ]);
  const tab = sp.tab === "feed" || sp.tab === "leaderboard" || sp.tab === "battle" ? sp.tab : "chat";
  return (
    <SquadRoom
      me={user.id}
      today={todayIso}
      squad={squad}
      chat={chat}
      feed={feed}
      leaderboard={leaderboard}
      sentNudges={sent}
      shareStats={profile.share_stats}
      pendingRequests={requests.length}
      initialTab={tab}
      crown={crown}
      yesterday={yesterdayIso}
    />
  );
}
