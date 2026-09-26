import { getProfile } from "@/lib/data";
import { getRecipes } from "@/lib/nutrition-data";
import RecipesScreen from "@/components/nutrition/RecipesScreen";

export const dynamic = "force-dynamic";

/** v2.13 Log → Recipes (spec §8). */
export default async function RecipesPage() {
  const [{ available, recipes }, profile] = await Promise.all([getRecipes(), getProfile()]);
  return <RecipesScreen available={available} recipes={recipes} hideNumbers={profile.hide_numbers === true} />;
}
