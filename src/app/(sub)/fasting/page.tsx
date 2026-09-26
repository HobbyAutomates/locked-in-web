import { getProfile, getWeights } from "@/lib/data";
import { getFasting, getNutritionSettings } from "@/lib/nutrition-data";
import { ageYears, edFlags, screenInput } from "@/lib/goals";
import { DEFAULT_FAST_HOURS, fastingAccess } from "@/lib/fasting";
import FastingScreen from "@/components/nutrition/FastingScreen";

export const dynamic = "force-dynamic";

/** v2.13 fasting timer (spec §7). Hidden under 18 and when the eating-disorder safety screen flags. */
export default async function FastingPage() {
  const [profile, weights, settings, fasting] = await Promise.all([getProfile(), getWeights(60), getNutritionSettings(), getFasting()]);
  const flags = edFlags(screenInput(profile, { weights: weights.map((w) => ({ date: w.date, kg: w.weight_kg })) }));
  const access = fastingAccess(ageYears(profile.dob), flags);
  return (
    <FastingScreen
      access={access}
      flags={flags}
      available={fasting.available && settings.available}
      active={access.ok ? fasting.active : null}
      history={access.ok ? fasting.history : []}
      defaultHours={settings.fasting_hours ?? DEFAULT_FAST_HOURS}
    />
  );
}
