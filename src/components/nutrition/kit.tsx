"use client";

import { LineIcon, type LineName } from "../lineIcons";
import { md } from "../motion";

/**
 * v2.13 nutrition screens share the v2.12 premium surface (ProgressScreen's PCard: 22 px corners,
 * 20 px padding, a hairline ring), thin line icons and the warm accent used sparingly.
 */

export function PCard({ children, label, className = "", style, padding = 20 }: { children: React.ReactNode; label?: string; className?: string; style?: React.CSSProperties; padding?: number }) {
  return (
    <section aria-label={label} className={`flex flex-col gap-3.5 ${className}`} style={{ background: "var(--card)", borderRadius: 22, padding, boxShadow: "var(--pcard-ring)", ...style }}>
      {children}
    </section>
  );
}

/** Icon tile + title + optional subtitle, the header row of a card. */
export function CardHead({ icon, title, sub, right, tint = "var(--ink)" }: { icon: LineName; title: string; sub?: React.ReactNode; right?: React.ReactNode; tint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]" style={{ background: "var(--card2)", color: tint }}>
        <LineIcon name={icon} size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em" }}>
          {title}
        </span>
        {sub ? <span className="mt-0.5 text-[13px] leading-[18px] muted">{sub}</span> : null}
      </span>
      {right}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold muted">{children}</p>;
}

export type Tone = "good" | "warn" | "flat" | "accent";
const TONE: Record<Tone, { bg: string; ink: string }> = {
  good: { bg: "var(--green-bg)", ink: "var(--green-ink)" },
  warn: { bg: "var(--orange-bg)", ink: "var(--orange-ink)" },
  flat: { bg: "var(--card2)", ink: "var(--muted)" },
  accent: { bg: "color-mix(in srgb, var(--accent) 14%, transparent)", ink: "var(--accent)" },
};

export function Pill({ tone = "flat", children, delay }: { tone?: Tone; children: React.ReactNode; delay?: number }) {
  return (
    <span className={`num inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${delay != null ? "m-drop" : ""}`} style={md(delay ?? 0, { background: TONE[tone].bg, color: TONE[tone].ink })}>
      {children}
    </span>
  );
}

/** The schema_v36-not-applied state: the feature is visible but says it's on its way. */
export function ComingSoon({ what }: { what?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }} role="status">
      <LineIcon name="spark" size={16} style={{ color: "var(--accent)" }} />
      <span className="text-[13px] font-semibold">
        {what ? `${what}: ` : ""}Coming with the next update
      </span>
    </div>
  );
}

/** A warm primary button (the accent is kept for the one main action on a card). */
export function AccentButton({ children, onClick, disabled, type = "button", className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`press inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold ${className}`} style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: disabled ? 0.55 : 1 }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`press inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold ${className}`} style={{ background: "var(--card2)", color: "var(--ink)", border: 0, opacity: disabled ? 0.55 : 1 }}>
      {children}
    </button>
  );
}

/** A thin horizontal bar (0–1) that grows in once, with an optional limit marker. */
export function Bar({ fraction, color, delay = 0, marker }: { fraction: number; color: string; delay?: number; marker?: number }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <div className="relative h-2 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
      <div className="m-growx h-full rounded-full" style={md(delay, { width: `${f * 100}%`, background: color, transformOrigin: "left center" })} />
      {marker != null ? <span className="absolute top-0 h-full w-0.5" style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%`, background: "var(--ink)", opacity: 0.35 }} /> : null}
    </div>
  );
}
