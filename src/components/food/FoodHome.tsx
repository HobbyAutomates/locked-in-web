"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dismiss, useDismissed } from "@/lib/dismiss";
import { dayAccuracy } from "@/lib/food/honesty";
import { leftoverLine, pickSwap, waterFromMeals } from "@/lib/food/foodBits";
import { decideSplit, dismissLeftover, loadFoodHome, logLeftover, type FoodHome } from "@/lib/food/foodActions";
import type { Meal } from "@/lib/types";
import { Close, Spinner } from "../icons";
import { LineIcon } from "../lineIcons";
import { Rise } from "../ui";

/**
 * v2.18 Area A on Home (today only), one self-contained block under the macro cards:
 *   A3  the day's accuracy chip; tap it for the vaguest entries, each one tap from its editor.
 *   A6  leftovers from "Ate part of it", one tap to log.
 *   A7  splits squadmates sent: Accept (lands in my day) or Decline.
 *   A9  one smart swap for the latest meal.
 * Each part hides when it has nothing to say or its schema_v42 table isn't there.
 */

// ---- a tiny client store for loadFoodHome(), shared with the water tile (A10) ----
let home: FoodHome | null = null;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
export function refreshFoodHome() {
  if (loading) return;
  loading = true;
  void loadFoodHome()
    .then((h) => {
      home = h;
    })
    .catch(() => {
      home = { leftovers: null, splits: null, waterFromFood: null };
    })
    .finally(() => {
      loading = false;
      emit();
    });
}
export function useFoodHome(): FoodHome | null {
  const h = useSyncExternalStore(subscribe, () => home, () => null);
  // Every mount re-reads (Home after a scan, a pre-log or a new sign-in); the old value shows meanwhile.
  useEffect(() => {
    refreshFoodHome();
  }, []);
  return h;
}

/** A10: ml of water in the day's food when the setting is on (0 otherwise, or before schema_v42). */
export function useFoodWaterMl(meals: Pick<Meal, "items">[]): number {
  const h = useFoodHome();
  return h?.waterFromFood ? waterFromMeals(meals) : 0;
}

export default function FoodHomeExtras({ meals, isToday }: { meals: Meal[]; isToday: boolean }) {
  const router = useRouter();
  const h = useFoodHome();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const acc = dayAccuracy(meals.map((m) => ({ id: m.id, items: m.items })));
  const latest = [...meals].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const swap = latest ? pickSwap(latest.items) : null;
  const swapId = latest ? `swap-${latest.id}` : "swap-none";
  const swapHidden = useDismissed(swapId);
  if (!isToday) return null;

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    setError(null);
    const r = await fn().catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't do that" }));
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Couldn't do that");
    refreshFoodHome();
    router.refresh();
  }

  const leftovers = h?.leftovers ?? [];
  const splits = h?.splits ?? [];
  const tone = acc.score == null ? null : acc.score >= 80 ? "var(--green)" : acc.score >= 60 ? "var(--ink)" : "var(--orange)";

  return (
    <>
      {acc.score != null ? (
        <Rise index={3}>
          <div className="flex flex-col gap-2 rounded-[20px] px-3.5 py-2.5" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
            <button type="button" className="press flex min-h-[36px] items-center gap-2.5 text-left" style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }} aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`Logging accuracy ${acc.score} out of 100, ${acc.label}. ${acc.vague.length ? `${acc.vague.length} to fix` : "Nothing to fix"}`}>
              <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold" style={{ boxShadow: `inset 0 0 0 2.5px ${tone}`, color: tone ?? undefined }}>
                {acc.score}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-semibold leading-tight">Accuracy · {acc.label}</span>
                <span className="truncate text-[12px] muted">{acc.vague.length ? `${acc.vague.length} vague ${acc.vague.length === 1 ? "entry" : "entries"}. Fix ${acc.vague.length === 1 ? "it" : "them"} for sharper numbers` : "Every entry is well sourced today"}</span>
              </span>
              <LineIcon name="chev" size={16} style={{ color: "var(--muted)", transform: open ? "rotate(90deg)" : undefined, transition: "transform .2s" }} />
            </button>
            {open ? (
              <div className="flex flex-col gap-1.5 pb-1">
                {acc.vague.map((v) => (
                  <Link key={`${v.mealId}-${v.index}`} href={`/meal?id=${v.mealId}`} className="press flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-[13px]" style={{ background: "var(--card2)", color: "var(--ink)" }}>
                    <span className="min-w-0 flex-1 truncate font-semibold">{v.name}</span>
                    <span className="num shrink-0 muted">
                      {v.kcal} kcal ±{v.plusMinus}
                    </span>
                    <span className="shrink-0 font-bold" style={{ color: "var(--accent)" }}>
                      Fix
                    </span>
                  </Link>
                ))}
                <p className="px-1 text-[11px] leading-[15px] muted">Each item carries a ± range from where its numbers came from: your own numbers ±5%, a scanned label ±8%, the food table ±12%, a web-checked photo ±12–30%, a guess up to ±40%.</p>
              </div>
            ) : null}
          </div>
        </Rise>
      ) : null}

      {splits.map((s) => (
        <Rise key={s.id} index={3}>
          <div className="flex items-center gap-3 rounded-[20px] px-3.5 py-3" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
              <LineIcon name="users" size={17} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-semibold">{s.from_name ?? "A squadmate"} split {s.dish}</span>
              <span className="num text-[12px] muted">
                Your share · {Math.round(s.kcal)} kcal · {Math.round(s.share * 100)}%
              </span>
            </span>
            {busy === s.id ? (
              <Spinner size={16} />
            ) : (
              <>
                <button type="button" className="chip press shrink-0" style={{ height: 34, padding: "0 12px", fontWeight: 700 }} onClick={() => void act(s.id, () => decideSplit(s.id, true))}>
                  Accept
                </button>
                <button type="button" aria-label="Decline" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => void act(s.id, () => decideSplit(s.id, false))}>
                  <Close size={14} />
                </button>
              </>
            )}
          </div>
        </Rise>
      ))}

      {leftovers.slice(0, 2).map((l) => (
        <Rise key={l.id} index={3}>
          <div className="flex items-center gap-3 rounded-[20px] px-3.5 py-3" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
              <LineIcon name="bowl" size={17} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold muted">Leftovers</span>
              <span className="truncate text-[14px] font-semibold">{leftoverLine(l)}</span>
            </span>
            {busy === l.id ? (
              <Spinner size={16} />
            ) : (
              <>
                <button type="button" className="chip press shrink-0" style={{ height: 34, padding: "0 12px", fontWeight: 700 }} onClick={() => void act(l.id, () => logLeftover(l.id))}>
                  Log it
                </button>
                <button type="button" aria-label="Not eating it" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => void act(l.id, () => dismissLeftover(l.id))}>
                  <Close size={14} />
                </button>
              </>
            )}
          </div>
        </Rise>
      ))}

      {swap && !swapHidden ? (
        <Rise index={3}>
          <div className="flex items-center gap-3 rounded-[20px] px-3.5 py-3" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }} role="note">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
              <LineIcon name="refresh" size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold muted">Smart swap for next time</span>
              <span className="text-[14px] font-semibold leading-snug">{swap.line}</span>
              <span className="text-[12px] muted">{swap.why.charAt(0).toUpperCase() + swap.why.slice(1)}</span>
            </span>
            <button type="button" aria-label="Hide this swap" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => dismiss(swapId)}>
              <Close size={14} />
            </button>
          </div>
        </Rise>
      ) : null}
      {error ? <p className="px-2 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </>
  );
}
