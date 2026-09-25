"use client";

import { useState } from "react";
import {
  RESTAURANT_MULTIPLIER,
  applyRestaurant,
  canBeRestaurant,
  countText,
  isLiquid,
  isSupplement,
  looseChips,
  nounFor,
  priceItem,
  restaurantOil,
  snapCount,
  toGrams,
  unitForFood,
  unitServing,
  type Quantity,
  type QuantityFood,
} from "@/lib/quantity";
import type { MealItem } from "@/lib/types";
import { BottomSheet, MacroDot, PillButton, Toggle, fmt } from "./ui";

/**
 * v2.5 Quantity sheet — radically simpler.
 * - Count foods (roti, egg, idli, scoop, slice, piece, katori, glass …): ONE big stepper.
 *   Whole numbers for roti / egg / scoop; ½ steps for katori / bowl / glass / cup / tbsp.
 * - Loose foods: a grams (or ml) field + at most three chips.
 * - Restaurant portion lives under a collapsed "More".
 * - Whey / supplements: the stepper and nothing else.
 * v2.8 (B2): counts single pieces through `unitFor`, like Android's Counting.unitFor — a "2 tbsp"
 * preset counts tbsp from 1, "10 almonds" counts almonds from 10 — so one tap logs the same grams
 * on both platforms.
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
  /** `servingLabel` is the one-piece unit the stepper counted in ("1 roti"), or null when entered by weight. */
  onDone: (item: MealItem, q: Quantity, servingLabel?: string | null) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={!!food} title={food ? food.name : title} subtitle={food ? <span className="block truncate">{food.name_hi ? food.name_hi : title}</span> : null} onClose={onClose}>
      {food ? <Body key={food.name + food.food_id} food={food} initial={initial} cta={cta} restaurantStart={restaurant} onDone={onDone} /> : null}
    </BottomSheet>
  );
}

function Body({ food, initial, cta, restaurantStart, onDone }: { food: QuantityFood; initial?: Quantity; cta: string; restaurantStart: boolean; onDone: (item: MealItem, q: Quantity, servingLabel?: string | null) => void }) {
  const supplement = isSupplement(food);
  const liquid = isLiquid(food);
  const gUnit = liquid ? "ml" : "g";

  const cu = unitForFood(food);
  const serving = cu ? unitServing(cu) : null;
  // Count mode prices through a one-piece serving ("1 roti" = 40 g) so the row stores unit=serving, servings=count.
  const counted: QuantityFood | null = cu && serving ? { ...food, servings: [serving], defaultServing: serving.label } : null;
  // Where the sheet opens: the row's current amount when editing (when it lands on a step), else the unit's default count.
  const startGrams = initial ? toGrams(food, initial) : null;
  const openCount: number | null = (() => {
    if (!cu) return null;
    if (startGrams == null) return cu.defaultCount;
    const n = startGrams / cu.grams;
    const snapped = snapCount(cu, n);
    return Math.abs(snapped - n) <= 0.02 * n + 0.01 ? snapped : null;
  })();

  const [mode, setMode] = useState<"count" | "grams">(cu && openCount != null ? "count" : "grams");
  const [count, setCount] = useState(openCount ?? cu?.defaultCount ?? 1);
  const [gramText, setGramText] = useState(() => String(Math.round((startGrams ?? (cu ? cu.grams * cu.defaultCount : 100)) * 10) / 10));
  const [more, setMore] = useState(restaurantStart);
  const allowRestaurant = canBeRestaurant(food) && !supplement;
  const [restaurant, setRestaurant] = useState(restaurantStart && allowRestaurant);
  const oily = restaurantOil(food.name, food.category);

  const counting = mode === "count" && counted !== null && cu !== null;
  const priceFood = counting && counted ? counted : food;
  const q: Quantity = counting ? { unit: "serving", value: count } : { unit: gUnit, value: Number(gramText) || 0 };
  const base = priceItem(priceFood, q);
  const item = restaurant ? applyRestaurant(base, oily) : base;
  const grams = toGrams(priceFood, q);
  const chips = looseChips(food).slice(0, 3);

  function bump(d: number) {
    if (!cu) return;
    setCount((c) => Math.min(Math.max(50, cu.defaultCount * 5), snapCount(cu, c + d * cu.step)));
  }
  function toGramsMode() {
    setGramText(String(Math.round(grams * 10) / 10 || 100));
    setMode("grams");
  }
  function toCountMode() {
    if (!cu) return;
    setCount(snapCount(cu, (Number(gramText) || cu.grams) / cu.grams));
    setMode("count");
  }

  return (
    <div className="flex min-w-0 flex-col">
      {counting && cu ? (
        <>
          <div className="flex items-center gap-3 rounded-[24px] px-3 py-3" style={{ background: "var(--card2)" }}>
            <StepButton label="One less" disabled={count <= cu.step} onClick={() => bump(-1)}>
              <StepGlyph plus={false} />
            </StepButton>
            <div className="min-w-0 flex-1 text-center">
              <p className="num text-[44px] font-extrabold leading-none" aria-live="polite">
                {countText(count)}
              </p>
              <p className="mt-1 truncate text-[15px] font-semibold muted">{cu.label ? `× ${cu.label}` : nounFor(cu.noun, count)}</p>
            </div>
            <StepButton label="One more" onClick={() => bump(1)}>
              <StepGlyph plus />
            </StepButton>
          </div>
          <p className="mt-2.5 text-center text-[14px] muted">
            ≈ {fmt(Math.round(item.grams))} {liquid ? "ml" : "g"} · <span className="font-bold" style={{ color: "var(--ink)" }}>{Math.round(item.calories)} kcal</span>
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              className="numfield num min-w-0 flex-1"
              style={{ width: "auto", height: 52, fontSize: 24 }}
              inputMode="decimal"
              aria-label={`Amount in ${gUnit}`}
              value={gramText}
              autoFocus={!cu}
              onChange={(e) => setGramText(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
            />
            <span className="shrink-0 text-base font-semibold muted">{gUnit}</span>
          </div>
          {!cu ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map((c) => {
                const sel = Math.abs(toGrams(food, c.q) - grams) < 0.5;
                return (
                  <button key={c.label} type="button" aria-pressed={sel} className="chip press" style={{ height: 34, fontSize: 13 }} onClick={() => setGramText(String(c.q.value))}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className="mt-2.5 text-center text-[14px] muted">
            <span className="font-bold" style={{ color: "var(--ink)" }}>{Math.round(item.calories)} kcal</span>
            {restaurant ? ` · ${fmt(Math.round(item.grams))} g restaurant` : ""}
          </p>
        </>
      )}

      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <MacroDot value={`P ${fmt(item.protein_g)}g`} color="var(--red)" />
        <MacroDot value={`C ${fmt(item.carbs_g)}g`} color="var(--orange)" />
        <MacroDot value={`F ${fmt(item.fat_g)}g`} color="var(--blue)" />
      </div>

      {!supplement && (cu || allowRestaurant) ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {cu ? (
            counting ? (
              <button type="button" className="hit press text-[13px] font-semibold underline underline-offset-2 muted" onClick={toGramsMode}>
                Enter {gUnit === "ml" ? "ml" : "grams"} instead
              </button>
            ) : (
              <button type="button" className="hit press text-[13px] font-semibold underline underline-offset-2 muted" onClick={toCountMode}>
                Count in {cu.label ? "servings" : nounFor(cu.noun, 2)} instead
              </button>
            )
          ) : null}
          {allowRestaurant ? (
            <button type="button" aria-expanded={more} className="hit press text-[13px] font-semibold muted" onClick={() => setMore((m) => !m)}>
              More {more ? "▴" : "▾"}
            </button>
          ) : null}
        </div>
      ) : null}

      {more && allowRestaurant ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5" style={{ border: "1.5px solid var(--hair)" }}>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold">Restaurant portion</span>
            <span className="text-[11px] muted">
              ×{RESTAURANT_MULTIPLIER}
              {oily ? " + 1 tsp oil" : ""}
            </span>
          </span>
          <Toggle on={restaurant} onChange={setRestaurant} label="Restaurant portion" />
        </div>
      ) : null}

      <div className="mt-4">
        <PillButton disabled={!(grams > 0)} onClick={() => onDone(item, q, counting && serving && !restaurant ? serving.label : null)}>
          {cta} · {Math.round(item.calories)} kcal
        </PillButton>
      </div>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press grid h-14 w-14 shrink-0 place-items-center rounded-full text-[28px] font-bold leading-none"
      style={{ background: "var(--card)", color: "var(--ink)", boxShadow: "var(--shadow)", opacity: disabled ? 0.35 : 1 }}
    >
      {children}
    </button>
  );
}

function StepGlyph({ plus }: { plus: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
      {plus ? <path d="M12 5v14" /> : null}
    </svg>
  );
}
