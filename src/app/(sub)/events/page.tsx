import SubPage from "@/components/SubPage";
import EventsScreen from "@/components/social/EventsScreen";
import { getDashboard } from "@/lib/data";
import { getEventBadges } from "@/lib/social/data";
import { trainingDates } from "@/lib/streaks";
import { totalsFor } from "@/lib/totals";
import { PROTEIN_HIT } from "@/lib/recap";
import { eventById, eventProgress, eventsAround } from "@/lib/social/seasonal";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D9 /events: the seasonal challenges running now or soon, and the limited jewels earned. */
export default async function EventsPage() {
  const [lang, dash, badges] = await Promise.all([getLang(), getDashboard(), getEventBadges()]);
  const logDays = [...new Set(dash.meals.map((m) => m.date))];
  const target = dash.profile.protein_target_g;
  const stepsByDay: Record<string, number> = {};
  for (const e of dash.exercises) if (e.steps) stepsByDay[e.date] = (stepsByDay[e.date] ?? 0) + Number(e.steps);
  const data = { proteinDays: logDays.filter((d) => target > 0 && totalsFor(dash.meals, d).protein >= target * PROTEIN_HIT), stepsByDay, logDays, trainDays: trainingDates(dash.workouts, dash.exercises) };
  const around = eventsAround(dash.today);
  const earnedIds = new Set(badges.earned.map((b) => b.event_id));
  const rows = [...around.live, ...around.soon].map((e) => ({ event: e, progress: eventProgress(e, data), earned: earnedIds.has(e.id), live: around.live.includes(e) }));
  const earned = badges.earned.map((b) => eventById(b.event_id)).filter((e): e is NonNullable<typeof e> => !!e);
  return (
    <SubPage title={t("events.title", lang)} back="/social">
      <EventsScreen today={dash.today} rows={rows} earned={earned} available={badges.available} />
    </SubPage>
  );
}
