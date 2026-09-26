import { getProfile, getWeights } from "@/lib/data";
import { getNutritionSettings, getWeeklyCheckin } from "@/lib/nutrition-data";
import NutritionGoalsScreen from "@/components/NutritionGoalsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  // v2.10: recent weigh-ins feed the "rapid loss" safety flag. v2.13: diet mode + weekly check-in.
  const [profile, weights, settings] = await Promise.all([getProfile(), getWeights(60), getNutritionSettings()]);
  const checkin = await getWeeklyCheckin(profile, settings);
  return <NutritionGoalsScreen profile={profile} weights={weights} settings={settings} checkin={checkin} />;
}
