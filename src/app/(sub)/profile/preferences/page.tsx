import { getProfile } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import PreferencesScreen from "@/components/PreferencesScreen";

export const dynamic = "force-dynamic";

/** v2.4: Preferences as categories — Appearance, Tracking, Reminders, Privacy, Account. */
export default async function PreferencesPage() {
  const [profile, { user }] = await Promise.all([getProfile(), requireUser()]);
  return <PreferencesScreen profile={profile} email={user?.email ?? ""} section={null} />;
}
