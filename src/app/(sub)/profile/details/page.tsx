import { getProfile } from "@/lib/data";
import PersonalDetailsScreen from "@/components/PersonalDetailsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  return <PersonalDetailsScreen profile={profile} />;
}
