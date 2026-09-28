import SubPage from "@/components/SubPage";
import { SoonCard } from "@/components/social/kit";
import FreezeScreen from "@/components/social/FreezeScreen";
import { getDashboard } from "@/lib/data";
import { getFreezes, getSquadMates } from "@/lib/social/data";
import { activityDayStreak } from "@/lib/streaks";
import { earnHint } from "@/lib/social/freezes";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D5 /streak: freeze tokens, how to earn one, the days they covered, gifting. */
export default async function StreakPage() {
  const [lang, freezes, mates, { today, workouts, meals, exercises }] = await Promise.all([getLang(), getFreezes(), getSquadMates(), getDashboard()]);
  if (!freezes.available)
    return (
      <SubPage title={t("streak.title", lang)} back="/social">
        <SoonCard what="Streak freezes" />
      </SubPage>
    );
  const active = [...workouts.map((w) => w.date), ...exercises.map((e) => e.date), ...meals.map((m) => m.date)];
  const streak = activityDayStreak(active, freezes.usedDays);
  return (
    <SubPage title={t("streak.title", lang)} back="/social">
      <FreezeScreen tokens={freezes.tokens} usedDays={freezes.usedDays} hint={earnHint(freezes.tokens, active, today)} streak={streak} mates={mates} lastGiftTo={freezes.lastGiftTo} />
    </SubPage>
  );
}
