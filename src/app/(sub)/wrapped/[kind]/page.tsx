import { notFound } from "next/navigation";
import SubPage from "@/components/SubPage";
import WrappedScreen from "@/components/social/WrappedScreen";
import { getDashboard, getExercises, getMeals, getWeights, getWorkouts } from "@/lib/data";
import { getSquadRank } from "@/lib/platform-data";
import { getFrozenDays } from "@/lib/social/data";
import { activityDayStreak } from "@/lib/streaks";
import { buildRecap } from "@/lib/recap";
import { parseWrappedKind, wrappedPeriod, wrappedSlides } from "@/lib/social/wrapped";
import { addDays } from "@/lib/dates";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D1 /wrapped/week|month|year: story cards (9:16) for Instagram, one tap to share. */
export default async function WrappedPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = await params;
  const kind = parseWrappedKind(raw);
  if (!kind) notFound();
  const [lang, dash, frozen] = await Promise.all([getLang(), getDashboard(), getFrozenDays()]);
  const period = wrappedPeriod(kind, dash.today);
  // The year needs more than the dashboard's 120 days; lifts look back a further year for PRs.
  const long = kind === "year";
  const [meals, workouts, exercises, weights, squad] = await Promise.all([
    long ? getMeals(period.from, period.to) : Promise.resolve(dash.meals),
    long ? getWorkouts(addDays(period.from, -365), period.to) : Promise.resolve(dash.workouts),
    long ? getExercises(period.from, period.to) : Promise.resolve(dash.exercises),
    getWeights(),
    getSquadRank().catch(() => null),
  ]);
  const recap = buildRecap(period, {
    meals,
    workouts,
    exercises,
    weights,
    proteinTarget: dash.profile.protein_target_g,
    weeklyTarget: dash.profile.weekly_workout_target,
    streak: activityDayStreak(
      dash.workouts.map((w) => w.date),
      dash.exercises.map((e) => e.date),
      dash.meals.map((m) => m.date),
      frozen,
    ),
    squad,
  });
  return (
    <SubPage title={t("wrapped.title", lang)} back="/social">
      <WrappedScreen kind={kind} period={period.label} periodFrom={period.from} slides={wrappedSlides(recap, kind, dash.profile.name)} />
    </SubPage>
  );
}
