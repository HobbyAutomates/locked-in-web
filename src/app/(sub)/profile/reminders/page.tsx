import { getProfile } from "@/lib/data";
import RemindersScreen from "@/components/RemindersScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  return <RemindersScreen profile={profile} />;
}
