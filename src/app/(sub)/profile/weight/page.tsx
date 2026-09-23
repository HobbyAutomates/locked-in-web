import { getProfile, getWeights } from "@/lib/data";
import WeightHistoryScreen from "@/components/WeightHistoryScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [profile, weights] = await Promise.all([getProfile(), getWeights()]);
  return <WeightHistoryScreen profile={profile} weights={weights} />;
}
