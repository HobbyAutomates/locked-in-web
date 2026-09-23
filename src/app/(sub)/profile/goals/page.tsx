import { getProfile } from "@/lib/data";
import NutritionGoalsScreen from "@/components/NutritionGoalsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const profile = await getProfile();
  return <NutritionGoalsScreen profile={profile} />;
}
