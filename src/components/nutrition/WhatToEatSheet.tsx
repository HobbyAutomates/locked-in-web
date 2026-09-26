"use client";

import { useEffect, useState } from "react";
import { ProNote } from "../platform/kit";
import { useRouter } from "next/navigation";
import { saveMeal } from "@/lib/actions";
import { loadWhatToEat, type WhatToEat } from "@/lib/nutrition-actions";
import { dietModeInfo } from "@/lib/dietModes";
import { MEAL_TYPES, mealTypeLabel, type MealType } from "@/lib/mealType";
import type { Suggestion } from "@/lib/whatToEat";
import type { MealItem } from "@/lib/types";
import { track } from "@/lib/track";
import { today } from "@/lib/dates";
import FoodImage, { FoodFallback } from "../FoodImage";
import { LineIcon } from "../lineIcons";
import { Spinner } from "../icons";
import { BottomSheet, ErrorNote, fmt } from "../ui";

/**
 * v2.13 "What should I eat?" (spec §6): today's remaining kcal / protein, the top 5 Indian picks
 * for it (protein per kcal, fits what's left, suits the time of day; diet-mode filtered) and
 * "Your usual". From Home a tap logs the pick into the meal time shown; from the Log screen
 * (`onPick`) it goes onto the plate instead.
 */
export function WhatToEatSheet({ open, onClose, date, onPick }: { open: boolean; onClose: () => void; date?: string; onPick?: (item: MealItem, label: string) => void }) {
  const router = useRouter();
  const [data, setData] = useState<WhatToEat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<MealType | null>(null);
  const [done, setDone] = useState<Record<string, "busy" | "ok">>({});

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadWhatToEat(date)
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setError(r.error);
        setError(null);
        setData(r);
        setType((t) => t ?? r.mealType);
      })
      .catch(() => live && setError("Couldn't load suggestions. Try again in a moment."));
    return () => {
      live = false;
    };
  }, [open, date]);

  const mealType = type ?? data?.mealType ?? "lunch";

  async function pick(s: Suggestion) {
    if (onPick) {
      onPick(s.item, s.label);
      
      onClose();
      return;
    }
    setDone((d) => ({ ...d, [s.id]: "busy" }));
    setError(null);
    try {
      await saveMeal({ date: date ?? today(), raw_text: s.label, items: [s.item], meal_type: mealType });
      track("meal_logged", { method: "search", items: 1, from: s.usual ? "what_to_eat_usual" : "what_to_eat" });
      setDone((d) => ({ ...d, [s.id]: "ok" }));
      router.refresh();
    } catch (e) {
      setDone((d) => {
        const n = { ...d };
        delete n[s.id];
        return n;
      });
      setError(e instanceof Error ? e.message : "Could not log that");
    }
  }

  const hide = data?.hideNumbers === true;
  const sub = data ? (hide ? `${fmt(data.remaining.protein)} g protein left today` : `Left today: ${data.remaining.kcal.toLocaleString("en-IN")} kcal · ${fmt(data.remaining.protein)} g protein`) : "Picks for what's left today";

  return (
    <BottomSheet open={open} title="What should I eat?" subtitle={sub} onClose={onClose}>
      <ProNote className="mb-3" />
      <div className="flex flex-col gap-3 pb-1">
        {!data && !error ? (
          <p className="flex items-center gap-2 py-6 text-[13px] muted">
            <Spinner size={14} /> Finding picks for you…
          </p>
        ) : null}
        <ErrorNote text={error} />
        {data ? (
          <>
            {!onPick ? (
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Log to">
                {MEAL_TYPES.map((t) => (
                  <button key={t.key} type="button" role="radio" aria-checked={mealType === t.key} className="chip press" style={{ height: 34, fontSize: 12.5, padding: "0 4px" }} onClick={() => setType(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="flex items-center gap-1.5 text-[12px] muted">
              <LineIcon name="bowl" size={14} />
              {dietModeInfo(data.mode).label} picks, ranked by protein for the calories and what fits right now.
            </p>
            {data.remaining.kcal <= 0 ? <p className="rounded-2xl px-3.5 py-2.5 text-[13px]" style={{ background: "var(--card2)" }}>You&apos;ve reached today&apos;s calories. If you&apos;re still hungry, these give the most protein for the calories.</p> : null}
            <PickList items={data.suggestions} hide={hide} done={done} onPick={pick} cta={onPick ? "Add" : "Log"} />
            {data.usual.length ? (
              <>
                <p className="mt-1 text-[13px] font-semibold">Your usual</p>
                <PickList items={data.usual} hide={hide} done={done} onPick={pick} cta={onPick ? "Add" : "Log"} />
              </>
            ) : null}
            {!onPick ? <p className="text-[11px] muted">Taps log to {mealTypeLabel(mealType)}. Change the amount any time by tapping the meal.</p> : null}
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function PickList({ items, hide, done, onPick, cta }: { items: Suggestion[]; hide: boolean; done: Record<string, "busy" | "ok">; onPick: (s: Suggestion) => void; cta: string }) {
  if (!items.length) return <p className="text-[13px] muted">Nothing fits right now.</p>;
  return (
    <div className="flex flex-col">
      {items.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3 py-2" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
          <FoodImage name={s.label} kind="preset" src={s.image_url} size={44} fallback={<FoodFallback size={44} category={s.category} />} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold leading-tight" style={{ overflowWrap: "anywhere" }}>
              {s.label}
            </span>
            <span className="num text-[12px] muted">
              {s.portion}
              {hide ? "" : ` · ${s.kcal} kcal`}
              {` · `}
              <span style={{ color: "var(--red)", fontWeight: 600 }}>{fmt(s.protein)} g protein</span>
            </span>
          </span>
          <button
            type="button"
            className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold"
            style={{ background: done[s.id] === "ok" ? "var(--green-bg)" : "var(--card2)", color: done[s.id] === "ok" ? "var(--green-ink)" : "var(--ink)", border: 0 }}
            disabled={!!done[s.id]}
            onClick={() => onPick(s)}
            aria-label={`${cta} ${s.label}, ${s.portion}`}
          >
            {done[s.id] === "busy" ? <Spinner size={13} /> : done[s.id] === "ok" ? <LineIcon name="check" size={15} /> : <LineIcon name="plus" size={15} />}
            {done[s.id] === "ok" ? "Logged" : cta}
          </button>
        </div>
      ))}
    </div>
  );
}
