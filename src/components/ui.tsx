"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight as ChevronRightIcon, Flame as FlameIcon } from "./icons";
import { track } from "@/lib/track";

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

/**
 * Two to four short, mutually exclusive options on a grey track (four only for tight labels like
 * Progress's "This wk / Last wk / 2 wk ago / 3 wk ago"); anything longer is a `ChipRow` instead.
 */
export function Segmented({ options, selected, onSelect, label }: { options: [string, string] | [string, string, string] | [string, string, string, string]; selected: number; onSelect: (i: number) => void; label: string }) {
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

/** A horizontally scrolling row of single-select chips (period filters, categories, squads). */
export function ChipRow<T extends string>({ options, value, onChange, label }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
      <div className="flex w-max gap-1.5 py-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={o.key === value} className="chip press" style={{ height: 36 }} onClick={() => onChange(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The one bottom sheet: grab handle, title, content, optional primary button. Backdrop tap and
 * Escape close it; it slides up with a spring and locks page scroll while open.
 */
export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  primary,
}: {
  open: boolean;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  primary?: { label: React.ReactNode; onClick: () => void; disabled?: boolean };
}) {
  return <AnimatePresence>{open ? <SheetFrame title={title} subtitle={subtitle} onClose={onClose} primary={primary}>{children}</SheetFrame> : null}</AnimatePresence>;
}

function SheetFrame({ title, subtitle, onClose, children, primary }: { title: string; subtitle?: React.ReactNode; onClose: () => void; children?: React.ReactNode; primary?: { label: React.ReactNode; onClick: () => void; disabled?: boolean } }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <motion.div
        className="flex w-full max-w-[480px] flex-col"
        style={{ background: "var(--card)", borderRadius: "28px 28px 0 0", maxHeight: "88vh", padding: "10px 20px calc(18px + env(safe-area-inset-bottom, 0px))" }}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full" style={{ background: "var(--hair)" }} />
        <p className="shrink-0 text-[19px] font-extrabold leading-tight" style={{ letterSpacing: "-0.02em" }}>
          {title}
        </p>
        {subtitle ? <div className="mt-0.5 shrink-0 text-[13px] muted">{subtitle}</div> : null}
        {children ? <div className="-mx-1 mt-3 min-h-0 overflow-y-auto px-1">{children}</div> : null}
        {primary ? (
          <div className="mt-4 shrink-0">
            <PillButton onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </PillButton>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
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
  draw,
}: {
  fraction: number;
  color: string;
  size: number;
  stroke: number;
  children?: React.ReactNode;
  /** v2.12: on first mount, draw in slowly like a pen after `draw` ms (later changes still spring). */
  draw?: number;
}) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduce = useReducedMotion();
  // The first draw is the slow pen stroke; once it lands, later changes use the usual spring.
  const [slow, setSlow] = useState(draw != null);
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
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - f) }}
          transition={slow ? { duration: 1.9, ease: [0.65, 0, 0.35, 1], delay: (draw ?? 0) / 1000 } : { ...SPRING, delay: 0.12 }}
          onAnimationComplete={() => {
            if (slow) setSlow(false);
          }}
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
  useEffect(() => void (text && track("error_shown", { message: text })), [text]);
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

/** A settings-style row inside a zero-padding card. `href` renders a link, `onClick` a button. */
export function SettingRow({
  icon,
  tint,
  label,
  subtitle,
  onClick,
  href,
  children,
}: {
  icon?: React.ReactNode;
  tint?: string;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        {icon ? <span style={{ color: tint ?? "var(--ink)", display: "inline-flex", flex: "none" }}>{icon}</span> : null}
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{label}</span>
          {subtitle ? <span className="text-[11px] font-normal muted">{subtitle}</span> : null}
        </span>
      </span>
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="setting-row press">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="setting-row press">
        {inner}
      </button>
    );
  }
  return <div className="setting-row">{inner}</div>;
}

/** The small "›" that ends a row which pushes a page. */
export function Chevron() {
  return (
    <span style={{ color: "var(--muted)", display: "inline-flex", flex: "none" }}>
      <ChevronRightIcon size={18} />
    </span>
  );
}

/** Grey caption above a grouped card ("Account", "Goals & tracking"). */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[13px] font-bold muted">{children}</p>;
}

/** iOS-style switch: black track when on. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className="toggle press">
      <span className="toggle-knob" />
    </button>
  );
}

/** Answer tile for onboarding: solid black with white text when chosen, soft grey when not. */
export function OptionCard({ title, sub, selected, onClick }: { title: string; sub?: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className="option-card press">
      <span className="block text-[17px] font-bold">{title}</span>
      {sub ? (
        <span className="mt-0.5 block text-[13px]" style={{ opacity: selected ? 0.72 : 1, color: selected ? "inherit" : "var(--muted)" }}>
          {sub}
        </span>
      ) : null}
    </button>
  );
}

/** Number formatting shared with the Android app's `fmt`. */
export function fmt(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
