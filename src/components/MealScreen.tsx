"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";
import MealForm from "./MealForm";
import type { MealType } from "@/lib/mealType";
import type { FoodPreset, Meal, SavedMeal } from "@/lib/types";

/** v2.8: the Add-food screen on its own page — a meal type's "+ Add", or a logged meal opened for editing. */
export default function MealScreen({
  date,
  mealType,
  existing,
  back,
  savedMeals,
  presets,
  usage,
}: {
  date: string;
  mealType: MealType | null;
  existing: Meal | null;
  back: string;
  savedMeals: SavedMeal[];
  presets: FoodPreset[];
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const close = () => router.push(back);
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-3 px-4 py-2">
        <button type="button" onClick={close} aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-bold">{existing ? "Edit meal" : "Add food"}</h1>
        <span className="w-10" />
      </div>
      <MealForm key={existing?.id ?? `${date}:${mealType ?? ""}`} date={date} mealType={mealType} existing={existing} savedMeals={savedMeals} presets={presets} usage={usage} onClose={close} />
    </div>
  );
}
