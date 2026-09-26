import { getMicrosData } from "@/lib/nutrition-data";
import MicrosScreen from "@/components/nutrition/MicrosScreen";

export const dynamic = "force-dynamic";

/** v2.13 micronutrient dashboard (spec §9). Works without schema_v36 (the diet mode is just balanced). */
export default async function MicrosPage() {
  const { today, profile, settings, meals } = await getMicrosData();
  return <MicrosScreen today={today} profile={profile} settings={settings} meals={meals} />;
}
