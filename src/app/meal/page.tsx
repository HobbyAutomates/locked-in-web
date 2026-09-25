import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getFoodUsage, getMeal, getPresets } from "@/lib/data";
import { listSavedMeals } from "@/lib/actions";
import { today as todayIso } from "@/lib/dates";
import { isMealType } from "@/lib/mealType";
import MealScreen from "@/components/MealScreen";

export const dynamic = "force-dynamic";

/** Where Back (and Save) return to: only in-app pages Home and Calendar link from. */
function backPath(b: string | undefined): string {
  return b === "/calendar" ? "/calendar" : "/";
}

/**
 * v2.8: add food for a meal type (Home's per-section "+ Add": `?type=lunch&date=…`) and the meal
 * editor (tapping a logged meal: `?id=…`). Both are the one Add-food screen (MealForm).
 */
export default async function MealPage({ searchParams }: { searchParams: Promise<{ id?: string; type?: string; date?: string; back?: string }> }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const t = todayIso();
  const back = backPath(sp.back);
  const [existing, savedMeals, presets, usage] = await Promise.all([
    sp.id ? getMeal(sp.id) : Promise.resolve(null),
    listSavedMeals().catch(() => []),
    getPresets().catch(() => []),
    getFoodUsage().catch(() => ({})),
  ]);
  if (sp.id && !existing) redirect(back);
  const date = existing?.date ?? (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= t ? sp.date : t);
  return <MealScreen date={date} mealType={isMealType(sp.type) ? sp.type : null} existing={existing} back={back} savedMeals={savedMeals} presets={presets} usage={usage} />;
}
