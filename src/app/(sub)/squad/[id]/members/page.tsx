import { redirect } from "next/navigation";
import { getJoinRequests, getMyAutoPost, getSquad, getSquadMembers } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import SquadMembers from "@/components/SquadMembers";

export const dynamic = "force-dynamic";

export default async function SquadMembersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/squad");
  const [{ user }, squad] = await Promise.all([requireUser(), getSquad(id)]);
  if (!squad || !user) redirect("/squad");
  const [members, requests, autoPost] = await Promise.all([getSquadMembers(id), squad.owner_id === user.id ? getJoinRequests(id) : Promise.resolve([]), getMyAutoPost(id, user.id)]);
  return <SquadMembers me={user.id} squad={squad} members={members} requests={requests} justCreated={sp.new === "1"} autoPost={autoPost} />;
}
