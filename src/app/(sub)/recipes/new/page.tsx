import { getRecipes } from "@/lib/nutrition-data";
import RecipeEditor from "@/components/nutrition/RecipeEditor";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  // One cheap read tells the editor whether schema_v36 (the recipes table) is there yet.
  const { available } = await getRecipes();
  return <RecipeEditor available={available} recipe={null} />;
}
