import { getBadgeProgress, getDashboard, getMySquads, getWeights } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/emails";
import { activityDayStreak } from "@/lib/streaks";
import { bestDayRun } from "@/lib/progressStats";
import { totalsFor } from "@/lib/totals";
import ProfileScreen from "@/components/ProfileScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [{ today, profile, workouts, meals, exercises }, { user }] = await Promise.all([getDashboard(), requireUser()]);
  const [weights, badges, squads] = await Promise.all([getWeights(), getBadgeProgress(profile, workouts, meals), getMySquads().catch(() => [])]);
  const activity = [workouts.map((w) => w.date), exercises.map((e) => e.date), meals.map((m) => m.date)];
  const streak = activityDayStreak(...activity);
  return (
    <ProfileScreen
      profile={profile}
      email={user?.email ?? ""}
      userId={user?.id ?? ""}
      joined={user?.created_at ?? null}
      squadName={squads[0]?.name ?? null}
      streak={streak}
      bestStreak={bestDayRun(streak, ...activity)}
      proteinToday={totalsFor(meals, today).protein}
      weights={weights}
      badges={badges}
      isAdmin={isAdminEmail(user?.email)}
    />
  );
}
