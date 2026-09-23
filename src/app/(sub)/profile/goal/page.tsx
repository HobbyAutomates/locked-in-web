import { getProfile } from "@/lib/data";
import GoalWeightScreen from "@/components/GoalWeightScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  return <GoalWeightScreen profile={profile} />;
}
