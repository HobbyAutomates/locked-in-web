"use client";

import { useId } from "react";
import { drawLen } from "./motion";

/**
 * v2.14 "Hatch = remaining" (canvas "Ember is earned", idea 02): rings and bars draw the done part
 * solid and what's still to go as a 45° hatch instead of a faint tint. Colour-blind safe, and it
 * keeps charts monochrome. `--hatch` is the line colour (ink or bone at ~30 %).
 */

/** A <pattern> of 45° lines for SVG strokes / fills. Render once inside the <svg>'s <defs>. */
export function HatchPattern({ id, gap = 5, width = 1.6 }: { id: string; gap?: number; width?: number }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={gap} height={gap} patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2={gap} style={{ stroke: "var(--hatch)" }} strokeWidth={width} />
    </pattern>
  );
}

/** CSS background for a hatched bar track (the remaining part). */
export const HATCH_BG = "repeating-linear-gradient(-45deg, var(--hatch) 0 1.4px, transparent 1.4px 5px)";

/** A mono ring: solid ink arc for what's done, hatched track for what's left. */
export function HatchRing({
  fraction,
  size,
  stroke,
  delay = 0,
  color = "var(--ink)",
  children,
}: {
  fraction: number;
  size: number;
  stroke: number;
  delay?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - stroke) / 2;
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute -rotate-90" aria-hidden="true">
        <defs>
          <HatchPattern id={id} />
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} />
        {f > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" pathLength={1} className="m-draw" style={drawLen(f, delay, { stroke: color })} />
        ) : null}
      </svg>
      {children}
    </span>
  );
}

/** A mono bar: solid for done, hatched for the rest. */
export function HatchBar({ fraction, height = 8, color = "var(--ink)", delay = 0 }: { fraction: number; height?: number; color?: string; delay?: number }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <span className="relative block w-full overflow-hidden" style={{ height, borderRadius: height, background: HATCH_BG }}>
      <span className="m-growx absolute inset-y-0 left-0 block" style={{ width: `${f * 100}%`, background: color, borderRadius: height, animationDelay: `${delay}ms` }} />
    </span>
  );
}
