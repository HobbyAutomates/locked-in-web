import SubPage from "@/components/SubPage";
import { HubGroup, HubRow, SLabel } from "@/components/social/kit";
import LiveShareToggle from "@/components/social/LiveShareToggle";
import { getFreezes, getLeaguesFlag, getLiveShare, getMyClients } from "@/lib/social/data";
import { freezeCountText } from "@/lib/social/freezes";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";
import { eventsAround } from "@/lib/social/seasonal";
import { leaguesOn } from "@/lib/social/leagues";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** v2.18 /social: the hub for everything the social stream added (one row on Profile opens it). */
export default async function SocialHub() {
  const [lang, freezes, clients, live, leaguesFlag] = await Promise.all([getLang(), getFreezes(), getMyClients(), getLiveShare(), getLeaguesFlag()]);
  const ev = eventsAround(today());
  return (
    <SubPage title={t("social.title", lang)} back="/profile">
      <SLabel>Streak and squad</SLabel>
      <HubGroup>
        <HubRow icon="shield" title={t("streak.title", lang)} sub={t("streak.sub", lang)} value={freezes.available ? freezeCountText(freezes.tokens) : undefined} href="/streak" />
        <HubRow icon="users" title={t("invite.title", lang)} sub={t("invite.sub", lang)} href="/invite" />
        <HubRow icon="target" title={t("pledges.title", lang)} sub={t("pledges.sub", lang)} href="/pledges" />
        <HubRow icon="award" title={t("events.title", lang)} sub={ev.live[0]?.title ?? t("events.sub", lang)} value={ev.live.length ? "Live" : undefined} href="/events" last={!leaguesOn(leaguesFlag)} />
        {leaguesOn(leaguesFlag) ? <HubRow icon="trophy" title={t("leagues.title", lang)} href="/leagues" last /> : null}
      </HubGroup>
      <LiveShareToggle available={live.available} on={live.on} />
      <SLabel>Stories</SLabel>
      <HubGroup>
        <HubRow icon="spark" title={t("wrapped.title", lang)} sub={t("wrapped.sub", lang)} href="/wrapped/week" />
        <HubRow icon="camera" title={t("story.title", lang)} sub={t("story.sub", lang)} href="/story" last />
      </HubGroup>
      <SLabel>Coach and style</SLabel>
      <HubGroup>
        <HubRow icon="chat" title={t("coach.title", lang)} sub={t("coach.sub", lang)} href="/coach-access" />
        {clients.available && clients.clients.length ? <HubRow icon="users" title={t("clients.title", lang)} value={String(clients.clients.length)} href="/clients" /> : null}
        <HubRow icon="ticket" title={t("packs.title", lang)} sub={t("packs.sub", lang)} href="/packs" tint="#b8913f" last />
      </HubGroup>
      <SLabel>Your data</SLabel>
      <HubGroup>
        <HubRow icon="share" title={t("export.title", lang)} sub={t("export.sub", lang)} href="/profile/export" />
        <HubRow icon="lock" title={t("delete.title", lang)} sub={t("delete.sub", lang)} href="/profile/delete" last />
      </HubGroup>
    </SubPage>
  );
}
