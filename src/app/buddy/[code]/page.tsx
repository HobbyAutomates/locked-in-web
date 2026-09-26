import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { buddyInviteInfo } from "@/lib/v214Actions";
import SubPage from "@/components/SubPage";
import BuddyScreen from "@/components/BuddyScreen";

export const dynamic = "force-dynamic";

/** v2.14 buddy invite link: https://…/buddy/<code> — sign in (or get started) first, then accept. */
export default async function BuddyInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) redirect("/");
  const { user } = await requireUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/buddy/${code}`)}`);
  const info = code.length === 6 ? await buddyInviteInfo(code) : null;
  return (
    <main className="min-h-full" style={{ background: "var(--bg)" }}>
      <SubPage title="Buddy streak" back="/">
        <BuddyScreen code={code.length === 6 ? code : null} inviter={info?.ok ? info.name : null} />
      </SubPage>
    </main>
  );
}
