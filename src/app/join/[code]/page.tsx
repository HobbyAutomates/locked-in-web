import { redirect } from "next/navigation";
import { getSquadByCode } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import JoinSquadScreen from "@/components/JoinSquadScreen";

export const dynamic = "force-dynamic";

/** v2.6 invite link: https://…/join/<code> — sign in first if needed, then join (or ask to). */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) redirect("/");
  const { user } = await requireUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  const invite = code.length === 6 ? await getSquadByCode(code) : null;
  if (invite?.joined) redirect(`/squad/${invite.id}`);
  return <JoinSquadScreen invite={invite} />;
}
