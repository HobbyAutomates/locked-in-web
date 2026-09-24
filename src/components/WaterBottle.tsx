"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * v2.6: the Fittr-style water bottle — a tall rounded body with a cap, filling with blue liquid
 * and a gentle wave. `fraction` 0–1 is how full it is; `label` sits inside ("1.75 L").
 * Drawn in a 100 × 220 box and scaled to `height`.
 */
export function WaterBottle({ fraction, label, height = 210 }: { fraction: number; label?: string; height?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduce = useReducedMotion();
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  // Body spans y 40..214; the liquid's surface sits `f` of the way up (a sliver shows from the first sip).
  const top = 40;
  const bottom = 214;
  const surface = bottom - (f > 0 ? Math.max(0.06, f) : 0) * (bottom - top);
  const width = (height * 100) / 220;
  return (
    <svg width={width} height={height} viewBox="0 0 100 220" role="img" aria-label={label ? `Bottle, ${label} so far` : "Water bottle"}>
      <defs>
        <clipPath id={`body-${id}`}>
          <rect x="14" y="40" width="72" height="174" rx="30" />
        </clipPath>
        <linearGradient id={`liq-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc0ff" />
          <stop offset="1" stopColor="#2f7fe0" />
        </linearGradient>
      </defs>
      {/* cap + neck */}
      <path d="M40 22 a10 10 0 0 1 20 0" fill="none" stroke="var(--muted)" strokeWidth="3.2" strokeLinecap="round" />
      <rect x="34" y="20" width="32" height="14" rx="5" fill="var(--ink)" opacity="0.85" />
      <rect x="38" y="33" width="24" height="10" rx="3" fill="var(--card2)" />
      {/* body */}
      <rect x="14" y="40" width="72" height="174" rx="30" fill="var(--card2)" />
      <g clipPath={`url(#body-${id})`}>
        <motion.g initial={false} animate={{ y: surface }} transition={{ type: "spring", stiffness: 120, damping: 20 }}>
          <g className={reduce ? undefined : "water-wave"}>
            <path d="M-50 6 q12.5 -6 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V240 H-50 Z" fill={`url(#liq-${id})`} opacity={f > 0 ? 1 : 0} />
          </g>
          {f > 0 ? (
            <g fill="#fff" opacity="0.55">
              <circle cx="36" cy="30" r="2" />
              <circle cx="62" cy="52" r="1.6" />
              <circle cx="46" cy="88" r="1.3" />
              <circle cx="70" cy="120" r="1.8" />
            </g>
          ) : null}
        </motion.g>
      </g>
      {/* gloss */}
      <rect x="22" y="58" width="6" height="120" rx="3" fill="#fff" opacity="0.18" />
      {label ? (
        <text x="50" y={Math.min(196, Math.max(surface + 22, 120))} textAnchor="middle" fontSize="15" fontWeight="800" fill={f > 0.3 ? "#fff" : "var(--ink)"} style={{ fontVariantNumeric: "tabular-nums" }}>
          {label}
        </text>
      ) : null}
    </svg>
  );
}

/** "1.75 L" / "250 mL" for the labels. */
export function litres(ml: number): string {
  if (ml < 1000) return `${Math.round(ml)} mL`;
  const cents = Math.round(ml / 10);
  return `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : cents % 10 === 0 ? 1 : 2)} L`;
}
