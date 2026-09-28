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
import { applyCorrection, rescalePer100, rescalePerUnit } from "@/lib/perUnit";
import { userSourceInfo } from "@/lib/sourceInfo";
import { logEvent, nums, postCorrection, putOverride, type AccuracyContext } from "@/lib/accuracyClient";
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
 * v2.15: quick 1 · 2 · 3 chips under the stepper; "Calories per roti" (count foods) or "Calories per
 * 100 g" (loose foods) — editing it rescales the item (macros follow unless typed) and is remembered
 * for this food; and "Correct the numbers" (My calories + optional macros, source, note), which
 * replaces the numbers, marks the item "Your numbers" and files a beta correction.
 */
export default function QuantitySheet({
  food,
  initial,
  title = "How much?",
  cta = "Add",
  restaurant = false,
  accuracy,
  onDone,
  onClose,
}: {
  food: QuantityFood | null;
  initial?: Quantity;
  title?: string;
  cta?: string;
  /** Open with "Restaurant portion" already on. */
  restaurant?: boolean;
  /** v2.15: where the item came from, for "Correct the numbers" (defaults to a manual entry). */
  accuracy?: AccuracyContext;
  /** `servingLabel` is the one-piece unit the stepper counted in ("1 roti"), or null when entered by weight. */
  onDone: (item: MealItem, q: Quantity, servingLabel?: string | null) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={!!food} title={food ? food.name : title} subtitle={food ? <span className="block truncate">{food.name_hi ? food.name_hi : title}</span> : null} onClose={onClose}>
      {food ? <Body key={food.name + food.food_id} food={food} initial={initial} cta={cta} restaurantStart={restaurant} accuracy={accuracy ?? { inputKind: "manual" }} onDone={onDone} /> : null}
    </BottomSheet>
  );
}

/** A typed number, or null when empty / not a number. */
function parseNum(t: string): number | null {
  if (!t.trim()) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const cleanNum = (v: string) => v.replace(/[^\d.]/g, "").slice(0, 7);

function Body({ food, initial, cta, restaurantStart, accuracy, onDone }: { food: QuantityFood; initial?: Quantity; cta: string; restaurantStart: boolean; accuracy: AccuracyContext; onDone: (item: MealItem, q: Quantity, servingLabel?: string | null) => void }) {
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
  // v2.15: per-unit / per-100 g calories and "Correct the numbers". "" = not edited.
  const [unitText, setUnitText] = useState("");
  const [per100Text, setPer100Text] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [my, setMy] = useState({ kcal: "", p: "", c: "", f: "", source: "", note: "" });
  const [before] = useState(() => priceItem(food, initial ?? { unit: gUnit, value: 100 }));

  const counting = mode === "count" && counted !== null && cu !== null;
  const priceFood = counting && counted ? counted : food;
  const q: Quantity = counting ? { unit: "serving", value: count } : { unit: gUnit, value: Number(gramText) || 0 };
  const base = priceItem(priceFood, q);
  const priced = restaurant ? applyRestaurant(base, oily) : base;
  const grams = toGrams(priceFood, q);
  // Per-unit ("Calories per roti") only for a plain noun unit, not a "1 × 5-6 pieces" label.
  const unitWord = counting && cu && !cu.label ? cu.noun : null;
  const unitKcal = counting ? parseNum(unitText) : null;
  const per100 = !counting ? parseNum(per100Text) : null;
  const shaped: MealItem = counting && unitKcal != null ? rescalePerUnit(priced, count, unitKcal) : per100 != null && priced.grams > 0 ? rescalePer100(priced, per100) : priced;
  const myKcal = fixOpen ? parseNum(my.kcal) : null;
  const item: MealItem = myKcal != null ? { ...applyCorrection(shaped, { calories: myKcal, protein_g: parseNum(my.p), carbs_g: parseNum(my.c), fat_g: parseNum(my.f) }), source_info: userSourceInfo(my.source) } : shaped;
  const derivedUnit = counting && count > 0 ? Math.round(priced.calories / count) : null;
  const derived100 = priced.grams > 0 ? Math.round((priced.calories / priced.grams) * 100) : null;
  const fixBlocked = fixOpen && myKcal == null;

  function perOne(v: number | null): number | null {
    return v != null && count > 0 ? Math.round((v / count) * 10) / 10 : null;
  }
  function done() {
    const servingLabel = counting && serving && !restaurant ? serving.label : null;
    if (myKcal != null) {
      postCorrection(accuracy, shaped, { calories: myKcal, protein_g: parseNum(my.p), carbs_g: parseNum(my.c), fat_g: parseNum(my.f) }, { unit: unitWord, count: counting ? count : null, source: my.source.trim(), note: my.note.trim() });
      // A corrected count food is remembered per unit ("my roti is 95 kcal").
      if (unitWord && count > 0) putOverride(food.name, unitWord, myKcal / count, { protein_g: perOne(parseNum(my.p)), carbs_g: perOne(parseNum(my.c)), fat_g: perOne(parseNum(my.f)) });
      if (my.note.trim()) logEvent("note", { item_name: food.name, payload: { where: "correction", text: my.note.trim() } });
    } else if (unitWord && unitKcal != null) putOverride(food.name, unitWord, unitKcal);
    else if (!counting && per100 != null) putOverride(food.name, "100g", per100);
    logEvent("edit", {
      meal_id: accuracy.mealId ?? null,
      item_name: food.name,
      payload: { before: nums(before), after: nums(item), field: myKcal != null ? "correct" : unitKcal != null ? "per_unit" : per100 != null ? "per_100g" : counting ? "count" : "grams", input_kind: accuracy.inputKind },
    });
    onDone(item, q, servingLabel);
  }
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
          <div className="mt-2.5 flex justify-center gap-2" role="group" aria-label="Quick count">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={count === n} className="chip press num" style={{ height: 38, minWidth: 52, fontSize: 16, fontWeight: 800 }} onClick={() => setCount(snapCount(cu, n))}>
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-center text-[14px] muted">
            ≈ {fmt(Math.round(item.grams))} {liquid ? "ml" : "g"} · <span className="font-bold" style={{ color: "var(--ink)" }}>{Math.round(item.calories)} kcal</span>
          </p>
          {unitWord ? (
            <KcalField
              label={`Calories per ${unitWord}`}
              value={unitText}
              placeholder={derivedUnit}
              onChange={setUnitText}
              hint={unitKcal != null ? `${countText(count)} × ${Math.round(unitKcal)} = ${Math.round(shaped.calories)} kcal · remembered for next time` : null}
            />
          ) : null}
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
          <KcalField
            label="Calories per 100 g"
            value={per100Text}
            placeholder={derived100}
            onChange={setPer100Text}
            hint={per100 != null ? `${fmt(Math.round(grams))} g at ${Math.round(per100)} per 100 g = ${Math.round(shaped.calories)} kcal · remembered for next time` : null}
          />
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

      {!fixOpen ? (
        <button type="button" className="hit press mt-3 self-center text-[13px] font-semibold underline underline-offset-2" style={{ color: "var(--ink)" }} onClick={() => setFixOpen(true)}>
          Correct the numbers
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl px-3.5 py-3" style={{ border: "1.5px solid var(--hair)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold">Correct the numbers</span>
            <button type="button" className="hit press text-[12px] font-semibold muted" onClick={() => setFixOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="text-[12px] muted">Checked it somewhere else? Enter the real numbers for this whole amount. They replace ours and help us fix the estimate.</p>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[13px] font-semibold">My calories</span>
            <input className="numfield num min-w-0 flex-1" style={{ width: "auto", height: 42, fontSize: 18 }} inputMode="decimal" autoFocus aria-label="My calories" placeholder={String(Math.round(shaped.calories))} value={my.kcal} onChange={(e) => setMy({ ...my, kcal: cleanNum(e.target.value) })} />
            <span className="text-[13px] muted">kcal</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["p", "Protein", shaped.protein_g],
                ["c", "Carbs", shaped.carbs_g],
                ["f", "Fat", shaped.fat_g],
              ] as const
            ).map(([k, label, ph]) => (
              <label key={k} className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-semibold muted">{label} g</span>
                <input className="numfield num w-full" style={{ height: 38, fontSize: 15 }} inputMode="decimal" aria-label={`My ${label.toLowerCase()} in grams`} placeholder={fmt(ph)} value={my[k]} onChange={(e) => setMy({ ...my, [k]: cleanNum(e.target.value) })} />
              </label>
            ))}
          </div>
          <input className="field" aria-label="Source" maxLength={300} placeholder="Source (optional): Pintola pack, HealthifyMe, a link" value={my.source} onChange={(e) => setMy({ ...my, source: e.target.value })} />
          <input className="field" aria-label="Note" maxLength={1000} placeholder="Note (optional)" value={my.note} onChange={(e) => setMy({ ...my, note: e.target.value })} />
        </div>
      )}

      <div className="mt-4">
        <PillButton disabled={!(grams > 0) || fixBlocked} onClick={done}>
          {fixBlocked ? "Enter your calories" : `${cta} · ${Math.round(item.calories)} kcal`}
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

/** "Calories per roti" / "Calories per 100 g": empty shows the current value as a placeholder. */
function KcalField({ label, value, placeholder, onChange, hint }: { label: string; value: string; placeholder: number | null; onChange: (v: string) => void; hint: string | null }) {
  return (
    <div className="mt-3">
      <label className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[14px] font-semibold">{label}</span>
        <input className="numfield num" style={{ width: 92, height: 42, fontSize: 18 }} inputMode="decimal" aria-label={label} placeholder={placeholder != null ? String(placeholder) : ""} value={value} onChange={(e) => onChange(cleanNum(e.target.value))} />
        <span className="text-[13px] muted">kcal</span>
      </label>
      {hint ? <p className="mt-1 text-right text-[11px] muted">{hint}</p> : null}
    </div>
  );
}
