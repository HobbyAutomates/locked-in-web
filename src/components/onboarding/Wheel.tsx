"use client";

import { useEffect, useRef } from "react";

/**
 * A scroll-snap wheel picker (canvas BOnbBody): five rows visible, the middle one big and bold on a
 * raised card. Arrow keys step it for keyboard users. Values are whatever `format` shows.
 */
const ROW = 48;

export function Wheel({ values, index, onIndex, format, label, unit }: { values: number[]; index: number; onIndex: (i: number) => void; format: (v: number) => string; label: string; unit: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | null>(null);
  const cb = useRef(onIndex);
  useEffect(() => {
    cb.current = onIndex;
  });

  // Keep the scroll position on the chosen row (first paint, unit switches).
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index, values.length]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW)));
      cb.current(i);
    }, 90);
  }

  return (
    <div className="relative" style={{ width: 140 }}>
      <div className="pointer-events-none absolute inset-x-0 rounded-[22px]" style={{ top: ROW * 2 - 10, height: ROW + 20, background: "var(--surf)", boxShadow: "0 6px 24px rgba(0,0,0,0.07)" }} />
      <div
        ref={ref}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={values[index]}
        aria-valuetext={`${format(values[index])} ${unit}`}
        className="relative overflow-y-scroll"
        style={{ height: ROW * 5, scrollSnapType: "y mandatory", scrollbarWidth: "none", maskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)" }}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const i = Math.max(0, Math.min(values.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
            onIndex(i);
          }
        }}
      >
        <div style={{ height: ROW * 2 }} />
        {values.map((v, i) => {
          const d = Math.abs(i - index);
          return (
            <div
              key={v}
              className="num grid place-items-center"
              style={{
                height: ROW,
                scrollSnapAlign: "center",
                fontFamily: "var(--font-display)",
                fontSize: d === 0 ? 44 : d === 1 ? 26 : 20,
                fontWeight: d === 0 ? 800 : 600,
                opacity: d === 0 ? 1 : d === 1 ? 0.45 : 0.2,
                letterSpacing: "-1px",
                transition: "font-size .15s ease, opacity .15s ease",
              }}
            >
              {format(v)}
            </div>
          );
        })}
        <div style={{ height: ROW * 2 }} />
      </div>
      <div className="mono mt-1.5 text-center" style={{ fontSize: 12, color: "var(--mute)" }}>
        {unit}
      </div>
    </div>
  );
}

/** The value list's index closest to `v`. */
export function nearest(values: number[], v: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - v) < Math.abs(values[best] - v)) best = i;
  return best;
}
