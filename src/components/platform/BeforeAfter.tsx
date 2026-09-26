"use client";

import { useState } from "react";
import { compare, type Photo } from "@/lib/body";
import { parseIso } from "@/lib/dates";
import type { WeightEntry } from "@/lib/types";
import { weightText } from "@/lib/display";
import { ProChip } from "./kit";

const dmy = (d: string) => parseIso(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * v2.13 before/after slider (spec §11): the older photo underneath, the newer one on top, clipped at
 * a vertical divider you drag. A full-size transparent range input drives the divider, so touch,
 * mouse and keyboard (arrow keys) all work.
 */
export default function BeforeAfter({ a, b, weights, units, onClose }: { a: Photo; b: Photo; weights: WeightEntry[]; units: "metric" | "imperial"; onClose: () => void }) {
  const [pos, setPos] = useState(50);
  const c = compare(a, b, weights);
  const delta = c.weightDelta;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-4" style={{ background: "rgba(0,0,0,0.92)" }} role="dialog" aria-modal="true" aria-label="Before and after">
      <div className="flex w-full max-w-[448px] items-center justify-between" style={{ color: "#fff" }}>
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          Before / after <ProChip />
        </p>
        <button type="button" className="press h-10 rounded-full px-4 text-[14px] font-semibold" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: 0 }} onClick={onClose}>
          Done
        </button>
      </div>
      <div className="relative w-full max-w-[448px] overflow-hidden rounded-[22px]" style={{ aspectRatio: "3 / 4", background: "#111" }}>
        {c.before.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.before.url} alt={`Before, ${dmy(c.before.date)}`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : null}
        {c.after.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.after.url} alt={`After, ${dmy(c.after.date)}`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} draggable={false} />
        ) : null}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%`, width: 3, marginLeft: -1.5, background: "#fff", boxShadow: "0 0 12px rgba(0,0,0,0.5)" }}>
          <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[15px] font-bold" style={{ background: "#fff", color: "#000" }}>
            ‹›
          </span>
        </div>
        <span className="pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
          Before · {dmy(c.before.date)}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
          After · {dmy(c.after.date)}
        </span>
        <input type="range" min={0} max={100} step={0.5} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Divider position" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" style={{ touchAction: "pan-y" }} />
      </div>
      <p className="num text-center text-[14px] font-semibold" style={{ color: "#fff" }}>
        {c.days} day{c.days === 1 ? "" : "s"} apart
        {delta != null ? ` · ${delta === 0 ? "same weight" : `${delta < 0 ? "−" : "+"}${weightText(Math.abs(delta), units)}`}` : ""}
      </p>
      <p className="text-center text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>
        Drag across the photo to compare. Same light and pose makes the change easiest to see.
      </p>
    </div>
  );
}
