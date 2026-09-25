import { getProfile, getWeights } from "@/lib/data";
import NutritionGoalsScreen from "@/components/NutritionGoalsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  // v2.10: recent weigh-ins feed the "rapid loss" safety flag.
  const [profile, weights] = await Promise.all([getProfile(), getWeights(60)]);
  return <NutritionGoalsScreen profile={profile} weights={weights} />;
}
