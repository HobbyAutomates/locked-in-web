"use client";

import { useState } from "react";
import { MEAL_TYPES, mealTypeLabel, type MealType } from "@/lib/mealType";
import { priceItem, type Quantity, type QuantityFood } from "@/lib/quantity";
import type { RecentFood } from "@/lib/recents";
import type { MealItem } from "@/lib/types";
import { MealTypeIcon, Spinner } from "../icons";
import FoodImage, { FoodFallback } from "../FoodImage";
import { LineIcon } from "../lineIcons";
import { PillButton, fmt } from "../ui";

/**
 * v2.17 logging from a scan into a chosen meal. The label / barcode result gets a "Log it" card
 * (which meal, how much, one button); photo results get the same meal chips; Scan and Add food get
 * a "Recent" row whose "+" re-adds a past food at its last amount.
 */

/** Breakfast · Lunch · Dinner · Snacks, one row. The default is the hour rule, like Home. */
export function MealSlotChips({ value, onChange, compact = false }: { value: MealType; onChange: (t: MealType) => void; compact?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Which meal">
      {MEAL_TYPES.map((t) => (
        <button
          key={t.key}
          type="button"
          role="radio"
          aria-checked={value === t.key}
          className="chip press flex-col"
          style={{ height: compact ? 40 : 50, padding: "0 4px", gap: 1, fontSize: 12, lineHeight: 1.15 }}
          onClick={() => onChange(t.key)}
        >
          {compact ? null : <MealTypeIcon type={t.key} size={17} />}
          <span className="max-w-full truncate">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A quantity as an initial amount for the Quantity sheet (the item's own unit and count). */
export function quantityOf(item: MealItem): Quantity {
  const n = Number(item.servings);
  if (item.unit === "serving" && n > 0) return { unit: "serving", value: n };
  if (item.unit === "ml") return { unit: "ml", value: Number(item.grams) || 0 };
  return { unit: "g", value: Math.round((Number(item.grams) || 0) * 10) / 10 };
}

/**
 * The label / barcode result's "Log it": meal chips (the hour rule picks), then servings (½ steps)
 * or grams, the calories for that amount, and "Log to Lunch". "Adjust" opens the full Quantity sheet
 * (counts, per-100 g calories, "Correct the numbers").
 */
export function LogItCard({ food, slot, onSlot, busy, onLog, onAdjust }: { food: QuantityFood; slot: MealType; onSlot: (t: MealType) => void; busy: boolean; onLog: (item: MealItem) => void; onAdjust: () => void }) {
  const serving = food.servings[0] ?? null;
  const [mode, setMode] = useState<"serving" | "g">(serving ? "serving" : "g");
  const [count, setCount] = useState(1);
  const [gramText, setGramText] = useState(String(serving ? Math.round(serving.grams) : 100));
  const grams = Number(gramText) || 0;
  const q: Quantity = mode === "serving" ? { unit: "serving", value: count } : { unit: "g", value: grams };
  const item = priceItem(food, q);
  const valid = mode === "serving" ? count > 0 : grams > 0;
  const step = (d: number) => setCount((c) => Math.max(0.5, Math.min(20, Math.round((c + d) * 2) / 2)));
  return (
    <section aria-label="Log it" className="flex flex-col gap-3 rounded-[22px] p-4" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[17px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
          Log it
        </p>
        <button type="button" className="hit press text-[13px] font-semibold" style={{ background: "none", border: 0, color: "var(--accent)" }} onClick={onAdjust}>
          Adjust
        </button>
      </div>
      <MealSlotChips value={slot} onChange={onSlot} />
      <div className="flex items-center gap-2">
        {serving ? (
          <div role="tablist" aria-label="Amount in" className="grid shrink-0 grid-cols-2 gap-1 rounded-[12px] p-1" style={{ background: "var(--track)" }}>
            {(["serving", "g"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className="press h-8 rounded-[9px] px-2.5 text-[12.5px]" style={{ border: 0, background: mode === m ? "var(--card)" : "transparent", color: mode === m ? "var(--ink)" : "var(--muted)", fontWeight: mode === m ? 700 : 600 }} onClick={() => setMode(m)}>
                {m === "serving" ? "Servings" : "Grams"}
              </button>
            ))}
          </div>
        ) : null}
        {mode === "serving" ? (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <button type="button" aria-label="Less" className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-[20px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => step(-0.5)}>
              −
            </button>
            <span className="num flex min-w-[52px] flex-col items-center leading-tight" aria-live="polite">
              <span className="text-[17px] font-bold">{fmt(count)}</span>
              <span className="text-[11px] font-semibold muted">× {Math.round(serving?.grams ?? 100)} g</span>
            </span>
            <button type="button" aria-label="More" className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-[20px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => step(0.5)}>
              +
            </button>
          </div>
        ) : (
          <label className="flex flex-1 items-center justify-end gap-2">
            <input inputMode="decimal" aria-label="Grams" value={gramText} className="num h-10 w-[96px] rounded-xl px-3 text-right text-[16px] font-semibold outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onChange={(e) => setGramText(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
            <span className="text-[14px] font-semibold muted">g</span>
          </label>
        )}
      </div>
      <PillButton disabled={busy || !valid} onClick={() => onLog(item)}>
        {busy ? <Spinner size={18} /> : `Log to ${mealTypeLabel(slot)} · ${Math.round(item.calories)} kcal`}
      </PillButton>
    </section>
  );
}

/**
 * "Recent": past foods and scans, newest first. The picture / name opens "adjust first" (onAdjust);
 * "+" re-adds it at the last amount (onAdd). `state` marks rows being added / just added.
 */
export function RecentRow({ items, onAdd, onAdjust, state = {}, hint }: { items: RecentFood[]; onAdd: (r: RecentFood) => void; onAdjust: (r: RecentFood) => void; state?: Record<string, "busy" | "ok">; hint?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <section aria-label="Recent" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <p className="text-[13px] font-semibold muted">Recent</p>
        {hint ? <span className="text-[12px] muted">{hint}</span> : null}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollSnapType: "x proximity" }}>
        {items.map((r) => {
          const st = state[r.key];
          return (
            <div key={r.key} className="relative flex w-[150px] shrink-0 flex-col rounded-[18px] p-2.5" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)", scrollSnapAlign: "start" }}>
              <button type="button" className="press flex min-w-0 flex-col items-start gap-2 text-left" style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }} onClick={() => onAdjust(r)} aria-label={`${r.name}, ${r.qty}, ${r.kcal} kcal. Adjust the amount first`}>
                <FoodImage name={r.name} src={r.image} kind={r.kind === "food" ? "generic" : "product"} size={40} radius={12} fallback={<FoodFallback size={40} product={r.kind !== "food"} />} />
                <span className="line-clamp-2 min-h-[34px] pr-1 text-[13px] font-semibold leading-[17px]">{r.name}</span>
                <span className="num text-[11.5px] muted">
                  {r.qty} · {r.kcal} kcal
                </span>
              </button>
              <button
                type="button"
                aria-label={st === "ok" ? `${r.name} added` : `Add ${r.name}, ${r.qty}`}
                disabled={st === "busy"}
                className="press absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full"
                style={{ background: st === "ok" ? "var(--green)" : "var(--ember)", color: "#fff", border: 0, boxShadow: "0 6px 14px rgba(255,91,31,.28)" }}
                onClick={() => onAdd(r)}
              >
                {st === "busy" ? <Spinner size={15} /> : st === "ok" ? <LineIcon name="check" size={16} stroke={2.4} /> : <LineIcon name="plus" size={17} stroke={2.4} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
