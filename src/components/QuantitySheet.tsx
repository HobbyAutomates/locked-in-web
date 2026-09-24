"use client";

import { useMemo, useState } from "react";
import { RESTAURANT_MULTIPLIER, UNITS, applyRestaurant, canBeRestaurant, priceItem, quickChips, restaurantOil, servingGrams, toGrams, type Quantity, type QuantityFood, type QuantityUnit } from "@/lib/quantity";
import type { MealItem } from "@/lib/types";
import { BottomSheet, MacroDot, PillButton, Toggle, fmt } from "./ui";

/**
 * The shared Quantity sheet: g · ml · kg · serving, a number, a 0.5-step servings stepper when a
 * serving size is known, quick chips, and a live kcal / P / C / F preview. Used by the plate rows
 * on Add food and the scan report's "Log 1 serving".
 */
export default function QuantitySheet({
  food,
  initial,
  title = "How much?",
  cta = "Add",
  restaurant = false,
  onDone,
  onClose,
}: {
  food: QuantityFood | null;
  initial?: Quantity;
  title?: string;
  cta?: string;
  /** Open with "Restaurant portion" already on. */
  restaurant?: boolean;
  onDone: (item: MealItem, q: Quantity) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={!!food}
      title={food ? food.name : title}
      subtitle={food ? <>{title}{food.name_hi ? ` · ${food.name_hi}` : ""}</> : null}
      onClose={onClose}
    >
      {food ? <Body key={food.name + food.food_id} food={food} initial={initial} cta={cta} restaurantStart={restaurant} onDone={onDone} /> : null}
    </BottomSheet>
  );
}

function Body({ food, initial, cta, restaurantStart, onDone }: { food: QuantityFood; initial?: Quantity; cta: string; restaurantStart: boolean; onDone: (item: MealItem, q: Quantity) => void }) {
  const sg = servingGrams(food);
  const startQ: Quantity = initial ?? (sg ? { unit: "serving", value: 1 } : { unit: "g", value: 100 });
  const [unit, setUnit] = useState<QuantityUnit>(startQ.unit);
  const [text, setText] = useState(String(startQ.value));
  const value = Number(text) || 0;
  const q: Quantity = useMemo(() => ({ unit, value }), [unit, value]);
  const allowRestaurant = canBeRestaurant(food);
  const [restaurant, setRestaurant] = useState(restaurantStart && allowRestaurant);
  const oily = restaurantOil(food.name, food.category);
  // "Restaurant portion": ×1.4 the amount and, for dal / sabzi / protein dishes, a hidden teaspoon of oil.
  const item = useMemo(() => {
    const base = priceItem(food, q);
    return restaurant ? applyRestaurant(base, oily) : base;
  }, [food, q, restaurant, oily]);
  const grams = toGrams(food, q);
  const chips = useMemo(() => quickChips(food), [food]);
  const servingLabel = (food.servings.find((s) => s.label === food.defaultServing) ?? food.servings[0])?.label;

  function pick(next: Quantity) {
    setUnit(next.unit);
    setText(String(next.value));
  }
  function step(d: number) {
    const cur = unit === "serving" ? value : sg ? grams / sg : 1;
    const next = Math.max(0.5, Math.round((cur + d) * 2) / 2);
    pick({ unit: "serving", value: next });
  }

  return (
    <>
      {sg ? (
        <p className="text-xs muted">
          1 {servingLabel?.replace(/^1\s+/, "")} = {fmt(sg)} g
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Unit">
        {UNITS.filter((u) => u !== "serving" || sg).map((u) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} className="chip press" style={{ height: 36 }} onClick={() => pick({ unit: u, value: u === "serving" ? Math.max(0.5, Math.round(((sg ? grams / sg : 1) || 1) * 2) / 2) : u === "kg" ? Math.round(grams / 10) / 100 : Math.round(grams) })}>
            {u === "serving" ? (servingLabel ? servingLabel.replace(/^1\s+/, "") : "serving") : u}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {unit === "serving" && sg ? (
          <button type="button" aria-label="Half a serving less" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-bold" style={{ background: "var(--card2)" }} onClick={() => step(-0.5)}>
            −
          </button>
        ) : null}
        <input
          className="numfield num min-w-0 flex-1"
          style={{ width: "auto", height: 44, fontSize: 22 }}
          inputMode="decimal"
          aria-label={`Amount in ${unit}`}
          value={text}
          autoFocus={!sg}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <span className="w-14 shrink-0 text-sm font-semibold muted">{unit === "serving" ? (value === 1 ? "serving" : "servings") : unit}</span>
        {unit === "serving" && sg ? (
          <button type="button" aria-label="Half a serving more" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-bold" style={{ background: "var(--card2)" }} onClick={() => step(0.5)}>
            +
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const sel = c.q.unit === unit && Math.abs(c.q.value - value) < 1e-6;
          return (
            <button key={c.label} type="button" aria-pressed={sel} className="chip press" style={{ height: 32, fontSize: 12 }} onClick={() => pick(c.q)}>
              {c.label}
            </button>
          );
        })}
      </div>

      {allowRestaurant ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5" style={{ border: "1.5px solid var(--hair)" }}>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold">Restaurant portion</span>
            <span className="text-[11px] muted">
              ×{RESTAURANT_MULTIPLIER} the amount{oily ? " + 1 tsp hidden oil" : ""} — outside kitchens serve bigger and oilier
            </span>
          </span>
          <Toggle on={restaurant} onChange={setRestaurant} label="Restaurant portion" />
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }}>
        <div>
          <p className="num text-[22px] font-extrabold leading-tight">{Math.round(item.calories)} kcal</p>
          <p className="text-xs muted">{fmt(Math.round(item.grams * 10) / 10)} g total{restaurant ? " · restaurant" : ""}</p>
        </div>
        <div className="flex gap-2.5">
          <MacroDot value={`${fmt(item.protein_g)}g`} color="var(--red)" />
          <MacroDot value={`${fmt(item.carbs_g)}g`} color="var(--orange)" />
          <MacroDot value={`${fmt(item.fat_g)}g`} color="var(--blue)" />
        </div>
      </div>

      <div className="mt-4">
        <PillButton disabled={!(grams > 0)} onClick={() => onDone(item, q)}>
          {cta} · {Math.round(item.calories)} kcal
        </PillButton>
      </div>
    </>
  );
}
