import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import OnboardingFlow from "@/components/OnboardingFlow";

export const dynamic = "force-dynamic";

/** First-run flow (also reachable any time from Profile). Lives outside (app) so there is no tab bar. */
export default async function OnboardingPage() {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  return <OnboardingFlow profile={profile} />;
}
