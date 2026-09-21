import type { Meal } from "./types";

/** Day totals across every meal logged on `date`. Pure, so client components can use it too. */
export function totalsFor(meals: Meal[], date: string) {
  const items = meals.filter((m) => m.date === date).flatMap((m) => m.items);
  return items.reduce(
    (a, i) => ({
      calories: a.calories + Number(i.calories),
      protein: a.protein + Number(i.protein_g),
      carbs: a.carbs + Number(i.carbs_g),
      fat: a.fat + Number(i.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
