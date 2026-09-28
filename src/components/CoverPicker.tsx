"use client";

import { useState } from "react";
import { COVER_CATEGORIES, COVER_PRESETS, coverPreset, type CoverCategory } from "@/lib/covers";
import { Cover } from "./Cover";
import { BottomSheet } from "./ui";

/**
 * v2.16 cover picker (board CoverPicker): category chips and a 3-column grid of the 34 covers. A tap
 * previews the cover straight away (the parent swaps it in behind the sheet); Done closes.
 */
export default function CoverPicker({ open, value, onPick, onClose }: { open: boolean; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState<CoverCategory | "all">("all");
  const current = coverPreset(value).id;
  const list = COVER_PRESETS.filter((c) => cat === "all" || c.category === cat);
  return (
    <BottomSheet open={open} title="Choose a cover" subtitle="Your photo and name stay the same. Only the background changes." onClose={onClose} action={{ label: "Done", onClick: onClose }}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="Cover categories">
        {COVER_CATEGORIES.map((c) => {
          const on = c.key === cat;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={on}
              className="press inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold"
              style={{ border: 0, background: on ? "var(--btn)" : "var(--card2)", color: on ? "var(--btn-ink)" : "var(--muted)" }}
              onClick={() => setCat(c.key)}
            >
              {c.key === "all" ? `All ${COVER_PRESETS.length}` : c.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-x-2.5 gap-y-3 pb-2" role="radiogroup" aria-label="Covers">
        {list.map((c) => {
          const on = c.id === current;
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} aria-label={`${c.name}, ${c.tone}`} className="press relative text-left" style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }} onClick={() => onPick(c.id)}>
              <span className="block overflow-hidden rounded-[14px]" style={{ height: 62, boxShadow: on ? "0 0 0 2.5px var(--ember), 0 0 18px rgba(255,91,31,.4)" : "inset 0 0 0 1px var(--hair)" }}>
                <Cover id={c.id} animate={false} align="middle" />
              </span>
              {on ? (
                <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full" style={{ background: "var(--ember)" }} aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              ) : null}
              <span className="mt-1.5 block truncate text-[10.5px] font-medium" style={{ color: on ? "var(--ink)" : "var(--muted)" }}>
                {c.name} · {c.tone}
                {on ? " · current" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
