import SubPage from "@/components/SubPage";
import { SoonCard } from "@/components/social/kit";
import CoachAccessScreen from "@/components/social/CoachAccessScreen";
import { getMyCoachNotes, getMyCoaches } from "@/lib/social/data";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D4 /coach-access: give a trainer or dietitian read access, see their notes, revoke. */
export default async function CoachAccessPage() {
  const [lang, coaches, notes] = await Promise.all([getLang(), getMyCoaches(), getMyCoachNotes()]);
  return (
    <SubPage title={t("coach.title", lang)} back="/social">
      {coaches.available ? <CoachAccessScreen coaches={coaches.coaches} notes={notes} /> : <SoonCard what="Coach access" />}
    </SubPage>
  );
}
