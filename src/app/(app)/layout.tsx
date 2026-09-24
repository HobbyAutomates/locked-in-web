import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import { ONBOARD_SKIP_COOKIE, needsOnboarding } from "@/lib/onboarding";
import BottomNav from "@/components/BottomNav";
import WaterReminderClock from "@/components/WaterReminderClock";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-[480px] items-center px-4 py-10">
        <div className="card">
          <h1 className="mb-2 text-2xl font-extrabold">Add your Supabase keys</h1>
          <p className="text-sm muted">
            Fill <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, run the SQL in{" "}
            <code>supabase/</code>, then restart the dev server.
          </p>
        </div>
      </main>
    );
  }
  const { user } = await requireUser();
  if (!user) redirect("/login");
  // First run: until the body details are in (or "Skip for now" was tapped), every tab lands on onboarding.
  const [profile, jar] = await Promise.all([getProfile(), cookies()]);
  if (needsOnboarding(profile) && jar.get(ONBOARD_SKIP_COOKIE)?.value !== "1") redirect("/onboarding");
  return (
    <>
      <main
        className="mx-auto w-full max-w-[480px] px-4"
        style={{ paddingTop: "calc(12px + env(safe-area-inset-top, 0px))", paddingBottom: 118 }}
      >
        {children}
      </main>
      <BottomNav />
      <WaterReminderClock from={profile.water_reminder_from} to={profile.water_reminder_to} every={profile.water_reminder_every_min} />
    </>
  );
}
