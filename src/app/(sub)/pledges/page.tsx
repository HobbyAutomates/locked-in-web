import SubPage from "@/components/SubPage";
import { SoonCard } from "@/components/social/kit";
import PledgesScreen from "@/components/social/PledgesScreen";
import { getDashboard } from "@/lib/data";
import { getMyPledges, getSquadPledges, getSquadsLite } from "@/lib/social/data";
import { trainingDates } from "@/lib/streaks";
import { totalsFor } from "@/lib/totals";
import { PROTEIN_HIT } from "@/lib/recap";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D8 /pledges: my pledges (with progress from my logs) and a squad's pledges (?squad=<id>). */
export default async function PledgesPage({ searchParams }: { searchParams: Promise<{ squad?: string }> }) {
  const sp = await searchParams;
  const [lang, mine, lite, dash] = await Promise.all([getLang(), getMyPledges(), getSquadsLite(), getDashboard()]);
  if (!mine.available)
    return (
      <SubPage title={t("pledges.title", lang)} back="/social">
        <SoonCard what="Pledges" />
      </SubPage>
    );
  const squadId = sp.squad && lite.squads.some((s) => s.id === sp.squad) ? sp.squad : (lite.squads[0]?.id ?? null);
  const squadPledges = squadId ? await getSquadPledges(squadId) : [];
  const logDays = [...new Set(dash.meals.map((m) => m.date))];
  const trainDays = [...new Set(trainingDates(dash.workouts, dash.exercises))];
  const target = dash.profile.protein_target_g;
  const proteinDays = logDays.filter((d) => target > 0 && totalsFor(dash.meals, d).protein >= target * PROTEIN_HIT);
  return (
    <SubPage title={t("pledges.title", lang)} back="/social">
      <PledgesScreen today={dash.today} me={lite.me ?? ""} mine={mine.mine} squads={lite.squads.map((s) => ({ id: s.id, name: s.name }))} squadId={squadId} squadPledges={squadPledges} days={{ log_days: logDays, train_days: trainDays, protein_days: proteinDays }} />
    </SubPage>
  );
}
