import { getBadgeProgress, getDashboard } from "@/lib/data";
import BadgesScreen from "@/components/BadgesScreen";

export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  const { profile, workouts, meals } = await getDashboard();
  const progress = await getBadgeProgress(profile, workouts, meals);
  return <BadgesScreen progress={progress} />;
}
