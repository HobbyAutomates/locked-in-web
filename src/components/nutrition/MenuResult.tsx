"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMeal } from "@/lib/actions";
import { today } from "@/lib/dates";
import { dietModeInfo } from "@/lib/dietModes";
import { MEAL_TYPES, defaultMealType, mealTypeLabel, type MealType } from "@/lib/mealType";
import { dishMealItem, midKcal, midProtein, type MenuDish, type MenuScanResult } from "@/lib/menuScan";
import { track } from "@/lib/track";
import { LineIcon } from "../lineIcons";
import { Spinner } from "../icons";
import { MRise } from "../motion";
import { ErrorNote, fmt } from "../ui";
import { PCard, Pill, type Tone } from "./kit";

const CONF_TONE: Record<MenuDish["confidence"], Tone> = { high: "good", medium: "warn", low: "flat" };
const CONFLICT_WORD: Record<string, string> = { meat: "meat", fish: "fish", egg: "egg", dairy: "dairy", honey: "honey", roots: "onion, garlic or roots" };

/**
 * v2.13 restaurant menu result (spec §10): the best pick for what's left today and the diet mode,
 * then every dish with its kcal / protein range per portion and a confidence, each one tap to log
 * (a restaurant-portion AI estimate at the middle of the range).
 */
export default function MenuResult({ result, hideNumbers = false }: { result: MenuScanResult; hideNumbers?: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<MealType>(() => defaultMealType());
  const [done, setDone] = useState<Record<number, "busy" | "ok">>({});
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const dishes = result.dishes ?? [];
  const best = result.best_pick_index != null ? dishes[result.best_pick_index] : null;
  const order = dishes
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i !== result.best_pick_index)
    .sort((a, b) => Number(b.d.fits_diet) - Number(a.d.fits_diet) || b.d.score - a.d.score);
  const shown = all ? order : order.slice(0, 8);

  async function log(i: number) {
    const d = dishes[i];
    setDone((s) => ({ ...s, [i]: "busy" }));
    setError(null);
    try {
      await saveMeal({ date: today(), raw_text: `${d.name}${result.restaurant ? ` at ${result.restaurant}` : ""} (menu scan)`, items: [dishMealItem(d)], meal_type: type });
      track("meal_logged", { method: "photo", items: 1, from: "menu_scan" });
      setDone((s) => ({ ...s, [i]: "ok" }));
      router.refresh();
    } catch (e) {
      setDone((s) => {
        const n = { ...s };
        delete n[i];
        return n;
      });
      setError(e instanceof Error ? e.message : "Could not log that");
    }
  }

  if (!dishes.length) {
    return (
      <MRise>
        <PCard label="Menu">
          <p className="text-[15px] font-semibold">No dishes found</p>
          <p className="text-[13px] muted">{result.note || "Try a straighter, closer photo of the menu."}</p>
        </PCard>
      </MRise>
    );
  }

  return (
    <>
      <MRise>
        <PCard label="Menu">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold muted">{result.restaurant ? "Menu at" : "Menu"}</p>
              <p className="text-[20px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>
                {result.restaurant ?? `${dishes.length} dishes`}
              </p>
            </div>
            <Pill tone="flat">{dietModeInfo(result.diet_mode).label}</Pill>
          </div>
          <p className="num text-[13px] muted">
            Left today: {hideNumbers ? "" : `${result.remaining.kcal.toLocaleString("en-IN")} kcal · `}
            {fmt(result.remaining.protein)} g protein
          </p>
          {result.note ? <p className="text-[12px] leading-4 muted">{result.note}</p> : null}
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Log to">
            {MEAL_TYPES.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={type === t.key} className="chip press" style={{ height: 34, fontSize: 12.5, padding: "0 4px" }} onClick={() => setType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </PCard>
      </MRise>

      {best ? (
        <MRise delay={140}>
          <PCard label="Best pick" style={{ boxShadow: "0 0 0 1.5px var(--accent), var(--shadow-sm)" }}>
            <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase" style={{ color: "var(--accent)", letterSpacing: ".06em" }}>
              <LineIcon name="spark" size={14} />
              Best pick for you
            </p>
            <DishRow d={best} hide={hideNumbers} state={done[result.best_pick_index as number]} onLog={() => void log(result.best_pick_index as number)} big />
            <p className="text-[12px] leading-4 muted">The most protein for the calories that fits what&apos;s left today{result.diet_mode !== "balanced" ? ` and your ${dietModeInfo(result.diet_mode).label.toLowerCase()} diet` : ""}.</p>
          </PCard>
        </MRise>
      ) : (
        <p className="px-1 text-[13px] muted">Nothing here fits your {dietModeInfo(result.diet_mode).label.toLowerCase()} diet. Everything is still listed.</p>
      )}

      <ErrorNote text={error} />

      <MRise delay={280}>
        <PCard label="All dishes" padding={14}>
          <p className="px-1 text-[13px] font-semibold muted">All dishes · per portion</p>
          <div className="flex flex-col">
            {shown.map(({ d, i }, k) => (
              <div key={`${d.name}-${i}`} style={{ borderTop: k ? "1px solid var(--hair)" : "none" }}>
                <DishRow d={d} hide={hideNumbers} state={done[i]} onLog={() => void log(i)} />
              </div>
            ))}
          </div>
          {order.length > shown.length ? (
            <button type="button" className="press self-center text-[13px] font-semibold underline" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => setAll(true)}>
              Show all {order.length}
            </button>
          ) : null}
          <p className="px-1 text-[11px] leading-4 muted">Estimates for a typical restaurant portion, oil included. Logging uses the middle of each range under {mealTypeLabel(type)}; open the meal to change it.</p>
        </PCard>
      </MRise>
    </>
  );
}

function DishRow({ d, hide, state, onLog, big = false }: { d: MenuDish; hide: boolean; state?: "busy" | "ok"; onLog: () => void; big?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ opacity: d.fits_diet ? 1 : 0.62 }}>
      <button type="button" className="press flex min-w-0 flex-1 flex-col text-left" style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`${big ? "text-[18px]" : "text-[15px]"} font-semibold leading-tight`} style={{ overflowWrap: "anywhere" }}>
          {d.name}
        </span>
        <span className="num mt-0.5 text-[12px] muted">
          {d.portion}
          {d.price ? ` · ${d.price}` : ""}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {!hide ? (
            <span className="num text-[13px] font-semibold">
              {d.kcal_low}–{d.kcal_high} kcal
            </span>
          ) : null}
          <span className="num text-[13px] font-semibold" style={{ color: "var(--red)" }}>
            {fmt(d.protein_low)}–{fmt(d.protein_high)} g protein
          </span>
          <Pill tone={CONF_TONE[d.confidence]}>{d.confidence} confidence</Pill>
        </span>
        {!d.fits_diet ? <span className="mt-1 text-[12px] font-semibold" style={{ color: "var(--orange-ink)" }}>Has {d.diet_conflicts.map((c) => CONFLICT_WORD[c] ?? c).join(", ")}</span> : null}
        {open ? (
          <span className="mt-1.5 flex flex-col gap-0.5 text-[12px] leading-4 muted">
            {d.description ? <span>{d.description}</span> : null}
            {d.why ? <span>Why this confidence: {d.why}</span> : null}
            <span className="num">
              About {midKcal(d)} kcal · {fmt(midProtein(d))} g protein · {d.carbs_g} g carbs · {d.fat_g} g fat{d.grams ? ` · ~${d.grams} g` : ""}
            </span>
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold"
        style={{ background: state === "ok" ? "var(--green-bg)" : big ? "var(--accent)" : "var(--card2)", color: state === "ok" ? "var(--green-ink)" : big ? "var(--accent-ink)" : "var(--ink)", border: 0 }}
        disabled={!!state}
        onClick={onLog}
        aria-label={`Log ${d.name}`}
      >
        {state === "busy" ? <Spinner size={13} /> : state === "ok" ? <LineIcon name="check" size={15} /> : <LineIcon name="plus" size={15} />}
        {state === "ok" ? "Logged" : "Log"}
      </button>
    </div>
  );
}
