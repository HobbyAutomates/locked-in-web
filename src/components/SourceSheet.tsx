"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/lib/image";
import { per100Note, sourceInfoFor, type SourceInfo } from "@/lib/sourceInfo";
import { ORIGIN_LABEL, confidenceWhy, gramRange, gramRangeText, levelOf, originOf } from "@/lib/itemInfo";
import { isRecipeItem } from "@/lib/recipes";
import type { FoodVariant } from "@/lib/variants";
import { Spinner } from "./icons";
import { BottomSheet, fmt } from "./ui";

/** What the ⓘ sheet needs from a row — a MealItem or a PlateItem both fit. */
export type SourceItem = {
  name: string;
  food_id: string | null;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  confidence: number | string | null;
  variants?: FoodVariant[];
  source_info?: SourceInfo | null;
  /** v2.13: "recipe" marks a serving logged from Recipes; restaurant rows carry cooked_in. */
  unit?: string | null;
  cooked_in?: string | null;
  /** v2.13: the model's own gram range (plate photos). */
  grams_low?: number | null;
  grams_high?: number | null;
};

const RECIPE_INFO: SourceInfo = { kind: "custom", label: "Your recipe", detail: "Worked out from the ingredients and servings you set in Recipes.", links: [] };
const LEVEL_TONE = { High: { bg: "var(--green-bg)", ink: "var(--green-ink)" }, Medium: { bg: "var(--orange-bg)", ink: "var(--orange-ink)" }, Low: { bg: "var(--danger-bg)", ink: "var(--danger)" } } as const;

type Looked = { source_info: SourceInfo | null; variants?: FoodVariant[] };

/** v2.9: provenance + variants for rows that came without them (the meal editor, a search pick). */
export async function lookUpSources(items: SourceItem[]): Promise<Looked[]> {
  const r = await postJson<{ items: Looked[] }>("/api/food-source", {
    items: items.map((i) => ({ food_id: i.food_id, name: i.name, grams: i.grams, calories: i.calories, source: i.source })),
  });
  return r.items ?? [];
}

/**
 * "Which one?" — the variant chips under an ambiguous row. The current food reads as picked;
 * tapping another swaps the row to it at the same grams.
 */
export function VariantChips({ variants, currentId, onPick, disabled }: { variants: FoodVariant[]; currentId: string | null; onPick: (v: FoodVariant) => void; disabled?: boolean }) {
  if (variants.length < 2) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5" style={{ scrollbarWidth: "none" }} role="radiogroup" aria-label="Which one?">
      <span className="shrink-0 text-[11px] font-semibold muted">Which one?</span>
      {variants.map((v) => {
        const sel = v.food_id === currentId;
        return (
          <button
            key={v.food_id}
            type="button"
            role="radio"
            aria-checked={sel}
            disabled={disabled}
            className="hit press shrink-0 rounded-full px-2.5 text-[12px] font-semibold"
            style={{ minHeight: 30, whiteSpace: "nowrap", background: sel ? "var(--ink)" : "var(--card2)", color: sel ? "var(--card)" : "var(--ink)" }}
            onClick={() => !sel && onPick(v)}
          >
            {v.label ?? v.name} <span style={{ opacity: 0.65, fontWeight: 500 }}>{v.kcal_per_100g}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The small ⓘ on every row; highlighted as "Check" when the row is low confidence or has variants. */
export function InfoButton({ name, check, onClick }: { name: string; check: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Where's ${name} from?${check ? " Worth a check." : ""}`}
      className="hit press inline-flex shrink-0 items-center justify-center gap-1 rounded-full"
      style={
        check
          ? { minHeight: 24, padding: "0 8px", fontSize: 11, fontWeight: 700, background: "var(--orange-bg)", color: "var(--orange)" }
          : { minWidth: 24, minHeight: 24, fontSize: 13, fontWeight: 700, color: "var(--muted)", background: "transparent" }
      }
      onClick={onClick}
    >
      ⓘ{check ? " Check" : ""}
    </button>
  );
}

/**
 * "Where's this from?" — the source (with links where one can be built), the confidence and the
 * per-100 g numbers, then "Not right? Pick another" (the variant chips, or search) and "Report"
 * (a meal_feedback row). Rows that arrived without provenance look it up once when opened.
 */
export function SourceSheet({
  item,
  onClose,
  onPickVariant,
  onPickAnother,
  onLoaded,
  mealId = null,
}: {
  item: SourceItem | null;
  onClose: () => void;
  onPickVariant?: (v: FoodVariant) => void;
  /** No variants: open search to pick a different food. Omitted where there is no search (scan result). */
  onPickAnother?: () => void;
  /** The lookup for a row without provenance landed — the caller keeps it on the row. */
  onLoaded?: (r: Looked) => void;
  mealId?: string | null;
}) {
  const [looked, setLooked] = useState<{ key: string; r: Looked } | null>(null);
  const [reported, setReported] = useState<string | null>(null);
  const key = item ? `${item.food_id ?? ""}|${item.name}` : "";
  const need = !!item && !item.source_info && !!item.food_id && !isRecipeItem(item) && looked?.key !== key;

  useEffect(() => {
    if (!need || !item) return;
    let live = true;
    lookUpSources([item])
      .then(([r]) => {
        if (!live || !r) return;
        setLooked({ key, r });
        onLoaded?.(r);
      })
      .catch(() => {
        if (live) setLooked({ key, r: { source_info: { kind: "custom", label: "Locked In food table", detail: "Couldn't load the source just now — try again in a moment.", links: [] } } });
      });
    return () => {
      live = false;
    };
    // `item` is read through `key`; re-running on every parent render would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need, key]);

  const info: SourceInfo | null = item ? (isRecipeItem(item) ? RECIPE_INFO : null) ?? (item.source_info ?? (looked?.key === key ? looked.r.source_info : null) ?? (item.food_id ? null : sourceInfoFor({ name: item.name, food_id: null, item_source: item.source }))) : null;
  const variants = item?.variants?.length ? item.variants : looked?.key === key ? (looked.r.variants ?? []) : [];

  function report() {
    if (!item) return;
    setReported(key);
    const correction = `[source report] ${item.name} · food_id=${item.food_id ?? "none"} · ${info?.label ?? item.source} · ${per100Note(item)}`;
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meal_id: mealId, raw_text: item.name, rating: "down", correction }),
    }).catch(() => undefined);
  }

  return (
    <BottomSheet open={!!item} title="Where's this from?" subtitle={item?.name} onClose={onClose}>
      {item ? (
        <div className="flex flex-col gap-3 pb-1">
          {/* v2.13: AI estimate vs database match, the confidence with its why, the gram range, the macros. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: originOf(item) === "ai" ? "var(--purple-bg)" : "var(--card2)", color: originOf(item) === "ai" ? "var(--purple)" : "var(--ink)" }}>
              {ORIGIN_LABEL[originOf(item)]}
            </span>
            <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: LEVEL_TONE[levelOf(item)].bg, color: LEVEL_TONE[levelOf(item)].ink }}>
              {levelOf(item)} confidence
            </span>
          </div>
          <p className="-mt-1 px-1 text-[13px] leading-[18px]">{confidenceWhy(item)}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["kcal", `${Math.round(item.calories)}`, "var(--ink)"],
                ["Protein", `${fmt(Math.round(item.protein_g * 10) / 10)} g`, "var(--red)"],
                ["Carbs", `${fmt(Math.round(item.carbs_g * 10) / 10)} g`, "var(--orange)"],
                ["Fat", `${fmt(Math.round(item.fat_g * 10) / 10)} g`, "var(--blue)"],
              ] as const
            ).map(([label, v, color]) => (
              <div key={label} className="rounded-2xl px-2 py-2 text-center" style={{ background: "var(--card2)" }}>
                <p className="num text-[15px] font-bold leading-tight" style={{ color }}>
                  {v}
                </p>
                <p className="text-[11px] muted">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "var(--card2)" }}>
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold">Amount</span>
              <span className="text-[11px] muted">{gramRange(item).fromModel ? "Likely range from the photo" : "Likely range for this estimate"}</span>
            </span>
            <span className="num text-right text-[13px]">
              <span className="font-bold">{Math.round(item.grams)} g</span>
              <span className="muted"> · {gramRangeText(item)}</span>
            </span>
          </div>
          <div className="rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }}>
            {info ? (
              <>
                <p className="text-[11px] font-semibold uppercase muted" style={{ letterSpacing: ".06em" }}>
                  Source
                </p>
                <p className="text-[15px] font-bold">{info.label}</p>
                <p className="mt-0.5 text-[13px] leading-snug muted">{info.detail}</p>
                {info.links.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {info.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="hit text-[13px] font-semibold underline" style={{ color: "var(--blue)", overflowWrap: "anywhere" }}>
                        {l.label} ↗
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="flex items-center gap-2 text-[13px] muted">
                <Spinner size={14} />
                Checking the source…
              </p>
            )}
          </div>
          <p className="num px-1 text-[12px] muted">{per100Note(item)}</p>
          {variants.length > 1 && onPickVariant ? (
            <div className="flex flex-col gap-1 px-1">
              <p className="text-[13px] font-semibold">Not right? Pick another</p>
              <VariantChips variants={variants} currentId={item.food_id} onPick={onPickVariant} />
            </div>
          ) : onPickAnother ? (
            <button type="button" className="hit press self-start px-1 text-[13px] font-semibold underline" onClick={onPickAnother}>
              Not right? Pick another
            </button>
          ) : null}
          <button type="button" className="hit press self-start px-1 text-[13px] font-semibold" style={{ color: reported === key ? "var(--muted)" : "var(--danger)" }} disabled={reported === key} onClick={report}>
            {reported === key ? "Reported — thanks, we'll check it" : "Report a wrong number"}
          </button>
        </div>
      ) : null}
    </BottomSheet>
  );
}
