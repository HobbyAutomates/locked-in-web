import { notFound } from "next/navigation";
import { getDashboard, getWeights } from "@/lib/data";
import { getPro, getSquadRank } from "@/lib/platform-data";
import { activityDayStreak } from "@/lib/streaks";
import { buildRecap, recapPeriod, type RecapKind } from "@/lib/recap";
import RecapPlayer from "@/components/platform/RecapPlayer";
import SubPage from "@/components/SubPage";
import { ProLocked } from "@/components/platform/kit";

export const dynamic = "force-dynamic";

/** v2.13 /recap/weekly and /recap/monthly — the story player (spec §13). */
export default async function RecapPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "weekly" && kind !== "monthly") notFound();
  const [{ today, profile, workouts, meals, exercises }, weights, squad, pro] = await Promise.all([getDashboard(), getWeights(), getSquadRank().catch(() => null), getPro()]);
  if (!pro.pro)
    return (
      <SubPage title="Recap" back="/progress">
        <ProLocked feature="Weekly and monthly recap" />
      </SubPage>
    );
  const period = recapPeriod(kind as RecapKind, today);
  const recap = buildRecap(period, {
    meals,
    workouts,
    exercises,
    weights,
    proteinTarget: profile.protein_target_g,
    weeklyTarget: profile.weekly_workout_target,
    streak: activityDayStreak(
      workouts.map((w) => w.date),
      exercises.map((e) => e.date),
      meals.map((m) => m.date),
    ),
    squad,
  });
  return <RecapPlayer recap={recap} units={profile.units} />;
}
