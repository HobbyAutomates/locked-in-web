"use client";

import { useState } from "react";
import Link from "next/link";
import type { Slide, WrappedKind } from "@/lib/social/wrapped";
import { TONES, renderSlide, shareSlides } from "@/lib/social/wrappedCard";
import { ErrorNote } from "../ui";

const TABS: { key: WrappedKind; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

/** A 9:16 preview drawn with the same layout as the PNG (the canvas draws the real card on share). */
function Preview({ slide, period, index }: { slide: Slide; period: string; index: number }) {
  const c = TONES[slide.tone];
  const small = slide.big.length > 6;
  return (
    <div className="m-rise relative flex aspect-[9/16] w-full flex-col overflow-hidden rounded-[22px]" style={{ background: c.bg, color: c.ink, padding: "9% 8.5%", boxShadow: "var(--shadow-lg)", animationDelay: `${index * 60}ms` }}>
      <p className="display text-[15px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
        locked in
      </p>
      <p className="mono text-[8.5px] uppercase" style={{ color: c.soft }}>
        {period}
      </p>
      <div className="mt-auto mb-[18%] flex flex-col">
        <p className="mono text-[9.5px] font-semibold uppercase" style={{ color: slide.tone === "ink" ? c.accent : c.ink, letterSpacing: "0.08em" }}>
          {slide.eyebrow}
        </p>
        <p className="display font-extrabold leading-[0.95]" style={{ fontSize: small ? 34 : 64, letterSpacing: "-0.05em", overflowWrap: "anywhere" }}>
          {slide.big}
        </p>
        <p className="serif mt-2 text-[16px] italic leading-snug" style={{ color: slide.tone === "ember" ? "#F4F1EA" : c.ink }}>
          {slide.line}
        </p>
      </div>
      <p className="text-[8.5px] font-semibold" style={{ color: c.soft }}>
        Tracked with Locked In
      </p>
    </div>
  );
}

export default function WrappedScreen({ kind, period, periodFrom, slides }: { kind: WrappedKind; period: string; periodFrom: string; slides: Slide[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function share(list: Slide[], key: string) {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      const files = [];
      for (const s of list) files.push({ blob: await renderSlide(s, period), name: `locked-in-${kind}-${periodFrom}-${s.key}.png` });
      const r = await shareSlides(files);
      if (r === "downloaded") setDone(list.length === 1 ? "Saved the card. Post it from your gallery." : `Saved ${list.length} cards.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the card");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div role="tablist" aria-label="Wrapped period" className="grid grid-cols-3 gap-1 rounded-2xl p-1" style={{ background: "var(--card2)" }}>
        {TABS.map((tb) => (
          <Link key={tb.key} role="tab" aria-selected={tb.key === kind} href={`/wrapped/${tb.key}`} replace className="press flex h-10 items-center justify-center rounded-xl text-[14px] font-semibold" style={{ background: tb.key === kind ? "var(--card)" : "transparent", color: tb.key === kind ? "var(--ink)" : "var(--muted)", boxShadow: tb.key === kind ? "var(--shadow-sm)" : undefined }}>
            {tb.label}
          </Link>
        ))}
      </div>
      <div className="flex items-baseline justify-between px-1">
        <p className="text-[15.5px] font-semibold">{period}</p>
        <p className="text-[12.5px] muted">{slides.length} cards · 9:16</p>
      </div>
      <button type="button" disabled={busy != null} onClick={() => void share(slides, "all")} className="press flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }}>
        {busy === "all" ? "Making your cards…" : "Share all to your story"}
      </button>
      <ErrorNote text={error} />
      {done ? (
        <p role="status" className="px-1 text-[13px] font-semibold" style={{ color: "var(--green-ink)" }}>
          {done}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {slides.map((s, i) => (
          <div key={s.key} className="flex flex-col gap-2">
            <Preview slide={s} period={period} index={i} />
            <button type="button" disabled={busy != null} onClick={() => void share([s], s.key)} className="press h-10 rounded-xl text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }}>
              {busy === s.key ? "…" : "Share"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
