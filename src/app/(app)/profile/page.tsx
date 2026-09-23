import { getProfile } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import ProfileScreen from "@/components/ProfileScreen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [profile, { user }] = await Promise.all([getProfile(), requireUser()]);
  return <ProfileScreen profile={profile} email={user?.email ?? ""} />;
}
