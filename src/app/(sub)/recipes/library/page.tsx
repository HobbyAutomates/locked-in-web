import { getProfile } from "@/lib/data";
import HomeRecipesScreen from "@/components/food/HomeRecipesScreen";

export const dynamic = "force-dynamic";

/** v2.18 A2: the "Ghar ka khana" home recipe library (no database needed to browse or log). */
export default async function HomeRecipesPage() {
  const profile = await getProfile();
  return <HomeRecipesScreen hideNumbers={profile.hide_numbers === true} />;
}
