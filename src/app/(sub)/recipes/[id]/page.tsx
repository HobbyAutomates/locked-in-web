import { redirect } from "next/navigation";
import { getRecipe } from "@/lib/nutrition-data";
import RecipeEditor from "@/components/nutrition/RecipeEditor";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { available, recipe } = await getRecipe(id);
  if (available && !recipe) redirect("/recipes");
  return <RecipeEditor key={recipe?.updated_at ?? id} available={available} recipe={recipe} />;
}
