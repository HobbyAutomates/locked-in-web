"use client";

import { md } from "@/components/motion";

/**
 * v2.14 onboarding building blocks (canvas "Onboarding 01 · brand v1"). Tokens only, so the same
 * markup is the light row (ink on bone) and the dark row (bone on ink).
 */

const P = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The design's 24-grid line icons (1.4–1.5 px stroke, round caps). */
export const ONB_ICONS = {
  back: "M15 18l-6-6 6-6",
  food: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  dumbbell: "M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7",
  brain: "M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 5 2V3zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-5 2",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  instagram: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.5 6.5h.01",
  youtube: "M22 12s0-3.5-.5-5a2.6 2.6 0 0 0-1.8-1.8C18 4.7 12 4.7 12 4.7s-6 0-7.7.5A2.6 2.6 0 0 0 2.5 7C2 8.5 2 12 2 12s0 3.5.5 5a2.6 2.6 0 0 0 1.8 1.8c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.6 2.6 0 0 0 1.8-1.8c.5-1.5.5-5 .5-5zM10 15.5v-7l6 3.5z",
  grad: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  down: "M12 5v14M19 12l-7 7-7-7",
  plus: "M4 12h16M12 4v16",
  lock: "M5 11h14v11H5zM7 11V7a5 5 0 0 1 10 0v4",
  leaf: "M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16zM4 21c3-6 6-8 10-10",
  scales: "M3 7h18M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0zM12 3v18M8 21h8",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM20 17v5H6.5A2.5 2.5 0 0 1 4 19.5",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
  chart: "M3 3v18h18M7 15l4-4 3 3 6-6",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  star: "M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6 7 18.2l1.9-5.8L4 8.8h6.1z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  chevron: "M9 18l6-6-6-6",
  check: "M5 12l5 5 9-10",
  arrow: "M5 12h13M13 6l6 6-6 6",
  barcode: "M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14",
} as const;
export type OnbIconName = keyof typeof ONB_ICONS;

export function OnbIcon({ name, size = 19, stroke = 1.5, style }: { name: OnbIconName; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={stroke} {...P} aria-hidden="true" style={{ flex: "none", ...style }}>
      <path d={ONB_ICONS[name]} />
    </svg>
  );
}

/** The six sections of the progress pill: food, streak, you, training, mind, together. */
export const SECTIONS: OnbIconName[] = ["food", "flame", "user", "dumbbell", "brain", "users"];

/** Back button + the section pill: done = ember on ember tint, current = ink, later = faded. */
export function TopBar({ section, onBack }: { section: number; onBack?: () => void }) {
  return (
    <div className="m-rise flex items-center justify-between" style={{ padding: "calc(14px + env(safe-area-inset-top, 0px)) 20px 0" }}>
      <button
        type="button"
        aria-label="Back"
        className="press grid place-items-center rounded-full"
        style={{ width: 40, height: 40, background: "var(--surf)", border: 0, color: "var(--ink)", visibility: onBack ? "visible" : "hidden" }}
        onClick={onBack}
      >
        <OnbIcon name="back" size={18} stroke={2} />
      </button>
      <div className="flex gap-[2px] rounded-full p-1" style={{ background: "var(--surf)" }} role="progressbar" aria-valuemin={1} aria-valuemax={6} aria-valuenow={section + 1} aria-label={`Step ${section + 1} of 6`}>
        {SECTIONS.map((name, i) => {
          const done = i < section;
          const now = i === section;
          return (
            <span
              key={name}
              className="grid place-items-center rounded-full"
              style={{
                width: 28,
                height: 28,
                background: done ? "var(--ember-bg)" : now ? "var(--btn)" : "transparent",
                color: done ? "var(--ember)" : now ? "var(--btn-ink)" : "var(--mute)",
                opacity: done || now ? 1 : 0.45,
                transition: "background-color .4s ease, color .4s ease",
              }}
            >
              <OnbIcon name={name} size={14} stroke={2} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Eyebrow({ children, color = "var(--ember)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="mono" style={{ fontSize: 12, color }}>
      {children}
    </span>
  );
}

/** Eyebrow + Bricolage headline + one muted line, rising in 150 ms after the top bar. */
export function Heading({ eyebrow, title, sub, delay = 150 }: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; delay?: number }) {
  return (
    <div className="m-rise flex flex-col gap-2.5" style={md(delay, { padding: "26px 22px 0" })}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 800 }}>{title}</h1>
      {sub ? <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.45, color: "var(--mute)" }}>{sub}</p> : null}
    </div>
  );
}

/** A tappable option: selected flips to an inverted ink card. `multi` draws a square check. */
export function Option({
  icon,
  title,
  sub,
  selected,
  onClick,
  multi = false,
  compact = false,
  delay = 0,
  disabled = false,
  note,
}: {
  icon?: OnbIconName;
  title: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
  compact?: boolean;
  delay?: number;
  disabled?: boolean;
  note?: string;
}) {
  const inv = selected;
  return (
    <div className="m-rise" style={md(delay)}>
      <button
        type="button"
        role={multi ? "checkbox" : "radio"}
        aria-checked={selected}
        disabled={disabled}
        className="press flex w-full items-center gap-3.5 text-left"
        style={{
          padding: compact ? "11px 16px" : "16px",
          borderRadius: 20,
          border: 0,
          background: inv ? "var(--btn)" : "var(--surf)",
          color: inv ? "var(--btn-ink)" : "var(--ink)",
          opacity: disabled ? 0.45 : 1,
          transition: "background-color .25s ease, color .25s ease",
        }}
        onClick={onClick}
      >
        {icon ? (
          <span
            className="grid place-items-center rounded-full"
            style={{ width: compact ? 36 : 42, height: compact ? 36 : 42, background: inv ? "color-mix(in srgb, var(--btn-ink) 14%, transparent)" : "var(--surf2)", flex: "none" }}
          >
            <OnbIcon name={icon} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block" style={{ fontSize: 17, fontWeight: 700 }}>
            {title}
          </span>
          {sub || note ? (
            <span className="mt-0.5 block" style={{ fontSize: 13.5, color: inv ? "color-mix(in srgb, var(--btn-ink) 65%, transparent)" : "var(--mute)" }}>
              {note ?? sub}
            </span>
          ) : null}
        </span>
        <span
          className="grid place-items-center"
          style={{ width: 24, height: 24, borderRadius: multi ? 6 : 999, border: `2px solid ${inv ? "var(--btn-ink)" : "var(--track)"}`, flex: "none" }}
          aria-hidden="true"
        >
          {selected ? <span style={{ width: 12, height: 12, borderRadius: multi ? 3 : 999, background: "var(--btn-ink)" }} /> : null}
        </span>
      </button>
    </div>
  );
}

/** The bottom call to action: a full-width ink pill, plus an optional quiet line / link under it. */
export function Cta({
  label,
  onClick,
  disabled,
  busy,
  secondary,
  onSecondary,
  tone = "ink",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: string;
  onSecondary?: () => void;
  tone?: "ink" | "ember";
}) {
  return (
    <div
      className="sticky bottom-0 z-10 mt-auto flex flex-col items-center gap-3.5"
      style={{ padding: "18px 20px calc(22px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(to top, var(--bg) 70%, transparent)" }}
    >
      <button
        type="button"
        className="press w-full rounded-full"
        style={{
          height: 56,
          border: 0,
          background: tone === "ember" ? "var(--ember)" : "var(--btn)",
          color: tone === "ember" ? "var(--ember-ink)" : "var(--btn-ink)",
          fontSize: 17,
          fontWeight: 700,
        }}
        disabled={disabled || busy}
        onClick={onClick}
      >
        {busy ? "One sec…" : label}
      </button>
      {secondary ? (
        onSecondary ? (
          <button type="button" className="press hit" style={{ background: "none", border: 0, fontSize: 14.5, color: "var(--mute)" }} onClick={onSecondary}>
            {secondary}
          </button>
        ) : (
          <span style={{ fontSize: 14.5, color: "var(--mute)", textAlign: "center" }}>{secondary}</span>
        )
      ) : null}
    </div>
  );
}

/** The coach's mark: an iris disc with the four-point star. Iris means the coach is talking. */
export function CoachAvatar({ size = 34 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-full" style={{ width: size, height: size, background: "var(--iris)", color: "#fff", flex: "none" }} aria-hidden="true">
      <OnbIcon name="star" size={Math.round(size * 0.47)} stroke={2} />
    </span>
  );
}

/** A coach speech bubble (iris tint, square top-left corner). */
export function CoachBubble({ label, children, avatar = true, style }: { label?: string; children: React.ReactNode; avatar?: boolean; style?: React.CSSProperties }) {
  return (
    <div className="flex items-start gap-2.5" style={style}>
      {avatar ? <CoachAvatar /> : null}
      <div style={{ background: "var(--iris-bg)", border: "1px solid var(--iris-line)", color: "var(--ink)", borderRadius: "4px 20px 20px 20px", padding: "14px 16px", fontSize: 14.5, lineHeight: 1.45 }}>
        {label ? (
          <div className="mono" style={{ fontSize: 11, color: "var(--iris)", marginBottom: 6 }}>
            {label}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** `**bold**` markers → <b>. Used by the reveal's "why this works" lines (same strings on Android). */
export function Bolded({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </>
  );
}
