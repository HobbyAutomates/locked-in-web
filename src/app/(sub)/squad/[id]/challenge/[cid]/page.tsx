import { redirect } from "next/navigation";
import { getChallenge, getChallengeBoard, getSquad } from "@/lib/data";
import { today } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import ChallengeDetail from "@/components/ChallengeDetail";

export const dynamic = "force-dynamic";

/** v2.7: one squad challenge's ranked board. Members only; anything else goes back to the squad. */
export default async function ChallengePage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(id)) redirect("/squad");
  if (!uuid.test(cid)) redirect(`/squad/${id}?tab=challenges`);
  const [{ user }, squad] = await Promise.all([requireUser(), getSquad(id)]);
  if (!squad || !user) redirect("/squad");
  const [challenge, board] = await Promise.all([getChallenge(id, cid), getChallengeBoard(cid)]);
  if (!challenge) redirect(`/squad/${id}?tab=challenges`);
  return <ChallengeDetail me={user.id} today={today()} squad={squad} challenge={challenge} board={board} />;
}
