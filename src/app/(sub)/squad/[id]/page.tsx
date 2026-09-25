import { redirect } from "next/navigation";
import { getChallenges, getJoinRequests, getLeaderboard, getProfile, getReadStatus, getSentNudges, getSquad, getSquadPosts, getUnreadCounts } from "@/lib/data";
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
  const [chat, feed, leaderboard, challenges, sent, profile, requests, crown, reads, unread] = await Promise.all([
    getSquadPosts(id, CHAT_KINDS),
    getSquadPosts(id, FEED_KINDS),
    getLeaderboard(id),
    getChallenges(id),
    getSentNudges(),
    getProfile(),
    squad.owner_id === user.id ? getJoinRequests(id) : Promise.resolve([]),
    // Closing yesterday's battle (idempotent) on every load is the spec's "no cron" design: the
    // first read after a day closes inserts the win + crown post; every later read is a no-op.
    squad.battle_enabled ? closeBattleDay(id, yesterdayIso) : Promise.resolve(null),
    // v2.11 (schema_v35): read receipts + the Chat tab's unread badge; null / {} before v35.
    getReadStatus(id),
    getUnreadCounts(),
  ]);
  const deepLinkTab =
    sp.tab === "feed" || sp.tab === "leaderboard" || sp.tab === "challenges" || sp.tab === "chat" || (sp.tab === "battle" && squad.battle_enabled) ? sp.tab : null;
  // v2.8: with no deep link (a notification, a shared "?tab=" link) or remembered tab, a squad
  // opens on Challenges when one is running, otherwise the Leaderboard.
  const defaultTab = challenges.some((c) => c.status === "active") ? "challenges" : "leaderboard";
  return (
    <SquadRoom
      me={user.id}
      today={todayIso}
      squad={squad}
      chat={chat}
      feed={feed}
      leaderboard={leaderboard}
      challenges={challenges}
      proteinGoal={profile.protein_target_g ?? null}
      sentNudges={sent}
      shareStats={profile.share_stats}
      pendingRequests={requests.length}
      initialTab={deepLinkTab ?? defaultTab}
      hasDeepLinkTab={deepLinkTab != null}
      crown={crown}
      reads={reads}
      chatUnread={unread[id] ?? 0}
      yesterday={yesterdayIso}
    />
  );
}
