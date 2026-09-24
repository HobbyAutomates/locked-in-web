"use client";

import { useState } from "react";
import {
  RESTAURANT_MULTIPLIER,
  applyRestaurant,
  canBeRestaurant,
  countStep,
  countText,
  defaultServingOf,
  isLiquid,
  isSupplement,
  looseChips,
  nounFor,
  priceItem,
  restaurantOil,
  servingNoun,
  toGrams,
  type Quantity,
  type QuantityFood,
} from "@/lib/quantity";
import type { MealItem } from "@/lib/types";
import { BottomSheet, MacroDot, PillButton, Toggle, fmt } from "./ui";

/**
 * v2.5 Quantity sheet — radically simpler.
 * - Count foods (roti, egg, idli, scoop, slice, piece, katori, glass …): ONE big stepper, starting at 1.
 *   Whole numbers for roti / egg / scoop; ½ steps for katori / bowl / glass / cup.
 * - Loose foods: a grams (or ml) field + at most three chips.
 * - Restaurant portion and other serving sizes live under a collapsed "More".
 * - Whey / supplements: the stepper and nothing else.
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
  /** `servingLabel` is the unit the stepper counted in (it can change under "More"). */
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

  // The unit the stepper counts in — the food's default serving, switchable under "More".
  const [servingLabel, setServingLabel] = useState<string | null>(defaultServingOf(food)?.label ?? null);
  const f: QuantityFood = { ...food, defaultServing: servingLabel };
  const serving = defaultServingOf(f);
  const step = countStep(f);

  const [mode, setMode] = useState<"count" | "grams">(step && (!initial || initial.unit === "serving") ? "count" : "grams");
  const [count, setCount] = useState(initial?.unit === "serving" && initial.value > 0 ? initial.value : 1);
  const [gramText, setGramText] = useState(() => {
    if (initial && initial.unit !== "serving") return String(Math.round(initial.unit === "kg" ? initial.value * 1000 : initial.value));
    return String(Math.round(serving && !step ? serving.grams : 100));
  });
  const [more, setMore] = useState(restaurantStart);
  const allowRestaurant = canBeRestaurant(food) && !supplement;
  const [restaurant, setRestaurant] = useState(restaurantStart && allowRestaurant);
  const oily = restaurantOil(food.name, food.category);

  const counting = mode === "count" && !!step;
  const q: Quantity = counting ? { unit: "serving", value: count } : { unit: gUnit, value: Number(gramText) || 0 };
  const base = priceItem(f, q);
  const item = restaurant ? applyRestaurant(base, oily) : base;
  const grams = toGrams(f, q);
  const noun = servingNoun(serving?.label);
  // Other single-unit sizes the stepper can count in ("1 bowl" for dal), shown under More.
  const altServings = f.servings.filter((s) => s.label !== servingLabel && s.grams > 0 && /^(1\s|1-)/.test(s.label) && countStep({ ...food, defaultServing: s.label }));
  const chips = looseChips(food).slice(0, 3);

  function bump(d: number) {
    if (!step) return;
    setCount((c) => Math.min(50, Math.max(step, Math.round((c + d * step) / step) * step)));
  }
  function toGramsMode() {
    setGramText(String(Math.round(grams) || 100));
    setMode("grams");
  }
  function toCountMode() {
    if (!step || !serving) return;
    const n = Math.max(step, Math.round((Number(gramText) || 0) / serving.grams / step) * step);
    setCount(n || 1);
    setMode("count");
  }

  return (
    <div className="flex min-w-0 flex-col">
      {counting ? (
        <>
          <div className="flex items-center gap-3 rounded-[24px] px-3 py-3" style={{ background: "var(--card2)" }}>
            <StepButton label={`One ${noun} less`} disabled={count <= step!} onClick={() => bump(-1)}>
              <StepGlyph plus={false} />
            </StepButton>
            <div className="min-w-0 flex-1 text-center">
              <p className="num text-[44px] font-extrabold leading-none" aria-live="polite">
                {countText(count)}
              </p>
              <p className="mt-1 truncate text-[15px] font-semibold muted">{nounFor(noun, count)}</p>
            </div>
            <StepButton label={`One ${noun} more`} disabled={count >= 50} onClick={() => bump(1)}>
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
              autoFocus={!step}
              onChange={(e) => setGramText(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
            />
            <span className="shrink-0 text-base font-semibold muted">{gUnit}</span>
          </div>
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

      {!supplement ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {counting ? (
            <button type="button" className="hit press text-[13px] font-semibold underline underline-offset-2 muted" onClick={toGramsMode}>
              Enter {gUnit === "ml" ? "ml" : "grams"} instead
            </button>
          ) : step ? (
            <button type="button" className="hit press text-[13px] font-semibold underline underline-offset-2 muted" onClick={toCountMode}>
              Count in {nounFor(noun, 2)} instead
            </button>
          ) : null}
          {allowRestaurant || (counting && altServings.length) ? (
            <button type="button" aria-expanded={more} className="hit press text-[13px] font-semibold muted" onClick={() => setMore((m) => !m)}>
              More {more ? "▴" : "▾"}
            </button>
          ) : null}
        </div>
      ) : null}

      {more && !supplement ? (
        <div className="mt-2 flex flex-col gap-2">
          {counting && altServings.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] muted">Count in</span>
              {[serving, ...altServings].filter(Boolean).map((s) => (
                <button
                  key={s!.label}
                  type="button"
                  aria-pressed={s!.label === servingLabel}
                  className="chip press"
                  style={{ height: 30, fontSize: 12 }}
                  onClick={() => {
                    setServingLabel(s!.label);
                    setCount(1);
                  }}
                >
                  {servingNoun(s!.label)} · {fmt(s!.grams)} g
                </button>
              ))}
            </div>
          ) : null}
          {allowRestaurant ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5" style={{ border: "1.5px solid var(--hair)" }}>
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
        </div>
      ) : null}

      <div className="mt-4">
        <PillButton disabled={!(grams > 0)} onClick={() => onDone(item, q, servingLabel)}>
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
