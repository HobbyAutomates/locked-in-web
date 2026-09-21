"use client";

import { motion } from "motion/react";
import { Flame as FlameIcon } from "./icons";

/** Spring used for anything spatial (rings, bars, rising cards) — mirrors Motion.spatialSlow(). */
export const SPRING = { type: "spring" as const, stiffness: 190, damping: 22 };

/** Fade + slide-up on mount, staggered by `index` (Compose's `Rise`). */
export function Rise({ index = 0, children, className, style }: { index?: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 9) * 0.04 }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function Card({
  children,
  className = "",
  style,
  padding = 16,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  padding?: number;
}) {
  return (
    <div className={`card ${className}`} style={{ padding, ...style }}>
      {children}
    </div>
  );
}

/** A card the whole surface of which is a button. */
export function CardButton({
  children,
  onClick,
  className = "",
  padding = 14,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  padding?: number;
  ariaLabel?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={`card press w-full text-left ${className}`} style={{ padding }}>
      {children}
    </button>
  );
}

export function PillButton({
  children,
  onClick,
  type = "button",
  disabled,
  soft,
  height = 52,
  className = "",
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  soft?: boolean;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`pill press ${soft ? "pill-soft" : ""} ${className}`}
      style={{ minHeight: height, ...style }}
    >
      {children}
    </button>
  );
}

export function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className="chip press">
      {label}
    </button>
  );
}

export function Segmented({ options, selected, onSelect, label }: { options: string[]; selected: number; onSelect: (i: number) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button key={o} type="button" role="tab" aria-selected={i === selected} onClick={() => onSelect(i)} className="press">
          {o}
        </button>
      ))}
    </div>
  );
}

/** Pill switch used for Band level and Appearance — same shape as Compose's inline row. */
export function PillSwitch({ options, value, onChange, label }: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex gap-1 rounded-full p-[3px]" style={{ background: "var(--card2)" }} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const sel = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(o)}
            className="press rounded-full px-3 text-xs font-semibold"
            style={{ height: 30, background: sel ? "var(--btn)" : "transparent", color: sel ? "var(--btn-ink)" : "var(--muted)" }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Progress ring that animates from zero with a spring. */
export function Ring({
  fraction,
  color,
  size,
  stroke,
  children,
}: {
  fraction: number;
  color: string;
  size: number;
  stroke: number;
  children?: React.ReactNode;
}) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} className="absolute -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - f) }}
          transition={{ ...SPRING, delay: 0.12 }}
        />
      </svg>
      {children}
    </div>
  );
}

/** Streak flame with the gentle breathing motion. */
export function BreathingFlame({ size, color = "var(--flame)" }: { size: number; color?: string }) {
  return <FlameIcon size={size} className="flame-breathe" style={{ color }} />;
}

/** Macro dot + value, e.g. "● 38g" in the protein colour. */
export function MacroDot({ value, color }: { value: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: color, flex: "none" }} />
      {value}
    </span>
  );
}

export function IconTile({ children, tint = "var(--ink)", bg = "var(--card2)" }: { children: React.ReactNode; tint?: string; bg?: string }) {
  return (
    <span className="tile" style={{ background: bg, color: tint }}>
      {children}
    </span>
  );
}

export function ErrorNote({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl px-3 py-3 text-[13px]" style={{ background: "var(--red-bg)", color: "var(--red)" }}>
      {text}
    </p>
  );
}

export function Hair() {
  return <div className="hair" />;
}

/** Right-aligned numeric box with a unit suffix (Compose's NumberField). */
export function NumberField({
  value,
  onChange,
  unit,
  label,
  decimal,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  label: string;
  decimal?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        className="numfield num"
        aria-label={label}
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        onChange={(e) => onChange(decimal ? e.target.value.replace(/[^\d.]/g, "") : e.target.value.replace(/\D/g, ""))}
      />
      {unit ? <span className="text-[13px] muted">{unit}</span> : null}
    </span>
  );
}

/** A settings-style row inside a zero-padding card. */
export function SettingRow({
  icon,
  tint,
  label,
  onClick,
  children,
}: {
  icon?: React.ReactNode;
  tint?: string;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2.5">
        {icon ? <span style={{ color: tint ?? "var(--ink)", display: "inline-flex" }}>{icon}</span> : null}
        {label}
      </span>
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="setting-row press">
        {inner}
      </button>
    );
  }
  return <div className="setting-row">{inner}</div>;
}

/** Number formatting shared with the Android app's `fmt`. */
export function fmt(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
