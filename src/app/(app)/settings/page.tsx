import { getProfile } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import SettingsScreen from "@/components/SettingsScreen";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [profile, { user }] = await Promise.all([getProfile(), requireUser()]);
  return <SettingsScreen profile={profile} email={user?.email ?? ""} />;
}
