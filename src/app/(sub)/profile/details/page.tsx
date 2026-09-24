import { getProfile } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import PersonalDetailsScreen from "@/components/PersonalDetailsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [profile, { user }] = await Promise.all([getProfile(), requireUser()]);
  return <PersonalDetailsScreen profile={profile} email={user?.email ?? ""} />;
}
