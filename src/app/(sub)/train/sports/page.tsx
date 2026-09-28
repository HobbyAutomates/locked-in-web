import SportsLog from "@/components/v218/SportsLog";
import { getProfile } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sports & steps · Locked In" };

/** v2.18 C3 sports presets and steps, MET-priced into the exercise log. */
export default async function SportsPage() {
  const p = await getProfile().catch(() => null);
  return <SportsLog weightKg={p?.weight_kg ?? null} heightCm={p?.height_cm ?? null} hideNumbers={p?.hide_numbers === true} />;
}
