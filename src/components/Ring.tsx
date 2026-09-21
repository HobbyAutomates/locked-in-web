"use client";

import { motion } from "motion/react";

export default function Ring({
  value,
  target,
  label,
  unit,
  color,
  size = 132,
}: {
  value: number;
  target: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
}) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth="12" fill="none" />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ type: "spring", stiffness: 60, damping: 18 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-2xl font-extrabold leading-none">{Math.round(value)}</span>
          <span className="text-[11px] muted mt-1">of {target} {unit}</span>
        </div>
      </div>
      <span className="text-xs font-bold tracking-wide uppercase muted">{label}</span>
    </div>
  );
}
