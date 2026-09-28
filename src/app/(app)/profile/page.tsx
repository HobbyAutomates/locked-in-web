import { getBadgeProgress, getDashboard, getMySquads, getV216Profile, getV217Profile, getWeights } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/emails";
import { activityDayStreak } from "@/lib/streaks";
import { bestDayRun } from "@/lib/progressStats";
import { totalsFor } from "@/lib/totals";
import ProfileScreen from "@/components/ProfileScreen";
import { memberPlate } from "@/lib/memberPlate";
import { getPro } from "@/lib/platform-data";
import { priceText } from "@/lib/pro";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [{ today, profile, workouts, meals, exercises }, { user }] = await Promise.all([getDashboard(), requireUser()]);
  const [weights, badges, squads, pro, v216, v217] = await Promise.all([getWeights(), getBadgeProgress(profile, workouts, meals), getMySquads().catch(() => []), getPro(), getV216Profile(), getV217Profile().catch(() => ({ memberNo: null, isFounder: null, createdAt: null }))]);
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
      cover={{ available: v216.available, preset: v216.coverPreset }}
      plate={memberPlate(v217.isFounder, v217.memberNo)}
      proLabel={pro.plan === "beta" && pro.pro ? "Beta" : pro.pro ? "Pro" : priceText(pro.config)}
    />
  );
}
