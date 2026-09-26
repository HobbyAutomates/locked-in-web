import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data";
import OnboardingV2 from "@/components/onboarding/OnboardingV2";

export const dynamic = "force-dynamic";

export const metadata = { title: "Get started · Locked In" };

/**
 * v2.14 onboarding (value first). Signed out: the whole 17-screen flow, the account is created on
 * the last screen. Signed in: the same flow for an incomplete profile (it saves straight away), or
 * `?tune=1` for existing users' "Tune your plan" (training, obstacles, coach style only).
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ tune?: string }> }) {
  const [{ user }, sp] = await Promise.all([requireUser(), searchParams]);
  const profile = user ? await getProfile() : null;
  return <OnboardingV2 signedIn={!!user} tune={!!user && sp.tune === "1"} firstName={profile?.name ?? ""} />;
}
