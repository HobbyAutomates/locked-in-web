import { normalizeCode } from "@/lib/social/referrals";
import InviteLanding from "@/components/social/InviteLanding";

export const dynamic = "force-dynamic";

/**
 * v2.18 D2 invite link: …/r/<CODE>. Public. Saves the code on this device and sends the friend to
 * sign-up; once they're signed in, the tab layout (SocialBoot) claims it once and both get a week
 * of Pro. Signed-in visitors go straight to Home, which claims it the same way.
 */
export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteLanding code={normalizeCode(code)} />;
}
