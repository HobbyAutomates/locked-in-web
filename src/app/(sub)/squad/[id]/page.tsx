import { redirect } from "next/navigation";
import { getChallenges, getJoinRequests, getLeaderboard, getProfile, getSentNudges, getSquad, getSquadPosts } from "@/lib/data";
import { today } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import SquadRoom from "@/components/SquadRoom";
import { CHAT_KINDS, FEED_KINDS } from "@/lib/squadPosts";

export const dynamic = "force-dynamic";

export default async function SquadRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/squad");
  const [{ user }, squad] = await Promise.all([requireUser(), getSquad(id)]);
  // Not a member (RLS hides the row): back to the hub.
  if (!squad || !user) redirect("/squad");
  const [chat, feed, leaderboard, challenges, sent, profile, requests] = await Promise.all([
    getSquadPosts(id, CHAT_KINDS),
    getSquadPosts(id, FEED_KINDS),
    getLeaderboard(id),
    getChallenges(id),
    getSentNudges(),
    getProfile(),
    squad.owner_id === user.id ? getJoinRequests(id) : Promise.resolve([]),
  ]);
  const tab = sp.tab === "feed" || sp.tab === "leaderboard" || sp.tab === "challenges" ? sp.tab : "chat";
  return (
    <SquadRoom
      me={user.id}
      today={today()}
      squad={squad}
      chat={chat}
      feed={feed}
      leaderboard={leaderboard}
      challenges={challenges}
      proteinGoal={profile.protein_target_g ?? null}
      sentNudges={sent}
      shareStats={profile.share_stats}
      pendingRequests={requests.length}
      initialTab={tab}
    />
  );
}
