"use client";

import Link from "next/link";
import { formatTime } from "@/lib/display";
import { groupMeals, type MealType } from "@/lib/mealType";
import { itemQtyLabel } from "@/lib/quantity";
import type { Meal } from "@/lib/types";
import { Bowl, ChevronRight, Plus } from "./icons";
import FoodImage, { FoodFallback } from "./FoodImage";
import { Hair, Rise, fmt } from "./ui";

type ShownMeal = Meal & { photo_url?: string | null };

/**
 * v2.8: a day's meals in four sections — Breakfast · Lunch · Dinner · Snacks — each with its kcal
 * and protein, its meals (tap one to edit it) and a small "+ Add" that opens Add food with that type
 * picked. An empty section is one slim row. Home and Calendar both use it.
 */
export default function MealSections({ meals, date, back = "/", rise = 6 }: { meals: ShownMeal[]; date: string; back?: "/" | "/calendar"; rise?: number }) {
  const sections = groupMeals(meals);
  const addHref = (t: MealType) => `/meal?type=${t}&date=${date}${back === "/" ? "" : `&back=${encodeURIComponent(back)}`}`;
  return (
    <>
      {sections.map((s) =>
        s.meals.length === 0 ? (
          <Rise key={s.type} index={rise}>
            <div className="card flex items-center justify-between gap-3" style={{ padding: "4px 6px 4px 16px", minHeight: 48 }}>
              <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold muted">
                <span aria-hidden="true">{s.emoji}</span>
                {s.label}
              </span>
              <AddLink href={addHref(s.type)} label={s.label} />
            </div>
          </Rise>
        ) : (
          <Rise key={s.type} index={rise}>
            <section className="card" style={{ padding: 0 }} aria-label={`${s.label}: ${s.kcal} kcal, ${fmt(s.protein)} g protein`}>
              <div className="flex items-center gap-2" style={{ padding: "8px 6px 4px 16px", minHeight: 48 }}>
                <span aria-hidden="true" className="text-[16px]">
                  {s.emoji}
                </span>
                <span className="text-[16px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
                  {s.label}
                </span>
                <span className="num min-w-0 flex-1 truncate text-[13px] muted">
                  {s.kcal} kcal · {fmt(s.protein)} g protein
                </span>
                <AddLink href={addHref(s.type)} label={s.label} />
              </div>
              {s.meals.map((m) => (
                <div key={m.id}>
                  <div className="px-3">
                    <Hair />
                  </div>
                  <MealLine meal={m} href={`/meal?id=${m.id}${back === "/" ? "" : `&back=${encodeURIComponent(back)}`}`} />
                </div>
              ))}
            </section>
          </Rise>
        ),
      )}
    </>
  );
}

function AddLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={`Add to ${label}`} className="chip press shrink-0 gap-1 whitespace-nowrap" style={{ height: 34, padding: "0 12px", fontSize: 13, fontWeight: 700 }}>
      <Plus size={14} />
      Add
    </Link>
  );
}

/** One logged meal: picture, what was in it (with amounts), kcal, time. The whole row opens the editor. */
function MealLine({ meal, href }: { meal: ShownMeal; href: string }) {
  const calories = meal.items.reduce((a, i) => a + Number(i.calories), 0);
  const protein = meal.items.reduce((a, i) => a + Number(i.protein_g), 0);
  const title = meal.items.map((i) => i.name).join(", ") || meal.raw_text || "Meal";
  const detail = meal.items.length === 1 ? itemQtyLabel(meal.items[0]) : `${meal.items.length} items`;
  // The biggest item stands for the meal in its picture.
  const lead = [...meal.items].sort((a, b) => Number(b.calories) - Number(a.calories))[0];
  return (
    <Link href={href} className="press flex min-h-[60px] w-full items-center gap-3 text-left" style={{ padding: "8px 12px", color: "var(--ink)" }} aria-label={`${title}, ${Math.round(calories)} kcal. Edit`}>
      {meal.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL
        <img src={meal.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-[12px] object-cover" />
      ) : lead ? (
        <FoodImage name={lead.name} kind={lead.source === "scan" ? "product" : "generic"} src={lead.image_url} size={40} fallback={<FoodFallback size={40} product={lead.source === "scan"} />} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-[12px]" style={{ width: 40, height: 40, background: "var(--orange-bg)", color: "var(--orange)" }}>
          <Bowl size={22} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <span className="truncate text-xs muted">
          {detail} · {fmt(Math.round(protein * 10) / 10)} g protein
          {formatTime(meal.created_at) ? ` · ${formatTime(meal.created_at)}` : ""}
        </span>
      </span>
      <span className="num shrink-0 text-[14px] font-bold">{Math.round(calories)} kcal</span>
      <span className="shrink-0" style={{ color: "var(--muted)", display: "inline-flex" }}>
        <ChevronRight size={18} />
      </span>
    </Link>
  );
}
