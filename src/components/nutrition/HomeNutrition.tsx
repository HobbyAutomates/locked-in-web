"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { FastSession } from "@/lib/nutritionTypes";
import { clock, durationText, stageAt } from "@/lib/fasting";
import { LineIcon } from "../lineIcons";
import { WhatToEatSheet } from "./WhatToEatSheet";
import { FastRing, useNow } from "./FastingScreen";

const noop = () => () => undefined;

/**
 * v2.13 Home, under the macro cards: "What should I eat?" (the remaining-macros helper) and the
 * micronutrient dashboard. Only for today.
 */
export function HomeNutritionLinks({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <button
          type="button"
          className="press flex min-h-[48px] items-center gap-2.5 rounded-[18px] px-3.5 text-left"
          style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)", border: 0, color: "var(--ink)" }}
          onClick={() => setOpen(true)}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
            <LineIcon name="spark" size={16} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold leading-tight">What should I eat?</span>
            <span className="truncate text-[12px] muted">Picks for what&apos;s left today</span>
          </span>
        </button>
        <Link href="/nutrition/micros" aria-label="Micronutrients" className="press flex min-h-[48px] items-center gap-2 rounded-[18px] px-3.5 text-[13px] font-semibold" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)", color: "var(--ink)" }}>
          <LineIcon name="chart" size={16} />
          Micros
        </Link>
      </div>
      <WhatToEatSheet open={open} onClose={() => setOpen(false)} date={date} />
    </>
  );
}

/** v2.13: a compact card while a fast is running (never shown under 18). */
export function FastingHomeCard({ fast }: { fast: FastSession }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const now = useNow(true);
  const ms = mounted ? Math.max(0, now - Date.parse(fast.started_at)) : 0;
  const h = ms / 3_600_000;
  const reached = h >= fast.target_hours;
  return (
    <Link href="/fasting" className="press flex items-center gap-3 rounded-[20px] px-3.5 py-3" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)", color: "var(--ink)" }} aria-label={`Fasting, ${durationText(h)} of ${durationText(fast.target_hours)}. Open the fasting timer`}>
      <FastRing elapsedH={h} target={fast.target_hours} size={44} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12px] font-semibold muted">{reached ? "Fasting goal reached" : `Fasting · ${stageAt(h).label}`}</span>
        <span className="num text-[20px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em" }} suppressHydrationWarning>
          {clock(ms)}
        </span>
      </span>
      <span className="num text-[12px] muted">of {durationText(fast.target_hours)}</span>
      <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
    </Link>
  );
}
