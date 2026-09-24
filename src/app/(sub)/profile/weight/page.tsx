import { getProfile, getWeights } from "@/lib/data";
import WeightHistoryScreen from "@/components/WeightHistoryScreen";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const [profile, weights, sp] = await Promise.all([getProfile(), getWeights(), searchParams]);
  return <WeightHistoryScreen profile={profile} weights={weights} openLog={sp.log === "1"} />;
}
