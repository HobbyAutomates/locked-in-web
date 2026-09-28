import SubPage from "@/components/SubPage";
import { SoonCard } from "@/components/social/kit";
import InviteScreen from "@/components/social/InviteScreen";
import { getProfile } from "@/lib/data";
import { getReferral } from "@/lib/social/data";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D2 /invite: my link, who joined with it, and the Pro weeks it earned. */
export default async function InvitePage() {
  const [lang, ref, profile] = await Promise.all([getLang(), getReferral(), getProfile()]);
  return (
    <SubPage title={t("invite.title", lang)} back="/social">
      {ref.available && ref.code ? <InviteScreen code={ref.code} name={profile.name ?? ""} friends={ref.friends} bankedDays={ref.bankedDays} proUntil={ref.proUntil} claimed={ref.claimed} /> : <SoonCard what="Invites" />}
    </SubPage>
  );
}
