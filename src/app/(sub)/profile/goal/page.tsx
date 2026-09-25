import { getProfile, getWeights } from "@/lib/data";
import GoalWeightScreen from "@/components/GoalWeightScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  // v2.10: recent weigh-ins feed the "rapid loss" safety flag.
  const [profile, weights] = await Promise.all([getProfile(), getWeights(60)]);
  return <GoalWeightScreen profile={profile} weights={weights} />;
}
