import type { CSSProperties, ReactNode } from "react";
import s from "./bento.module.css";

/**
 * Server-rendered building blocks for the v2.12 bento admin pages: tiles, pills, and small charts
 * (bars, horizontal bars, donut, ring, strips) that animate in with CSS only (see bento.module.css)
 * and hold still under prefers-reduced-motion. Colours are app tokens: var(--blue) etc.
 */

export { s as bento };

type Span = 1 | 2 | 3 | 4 | 6;
const SPAN: Record<Span, string> = { 1: s.s1, 2: s.s2, 3: s.s3, 4: s.s4, 6: s.s6 };

/** Stagger helper: `--d` (tile delay) and `--i` (item index) as inline custom properties. */
export function delay(ms: number, i?: number): CSSProperties {
  return { ["--d" as string]: `${ms}ms`, ...(i != null ? { ["--i" as string]: i } : {}) } as CSSProperties;
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

export function Tile({ span = 1, d = 0, risk, className, style, children, as = "section" }: { span?: Span; d?: number; risk?: boolean; className?: string; style?: CSSProperties; children: ReactNode; as?: "section" | "div" }) {
  const Tag = as;
  return (
    <Tag className={cx(s.tile, s.rise, SPAN[span], risk && s.risk, className)} style={{ ...delay(d), ...style }}>
      {children}
    </Tag>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className={s.label}>{children}</div>;
}

export function Head({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={s.head}>
      <Label>{children}</Label>
      {right}
    </div>
  );
}

export type Tone = "green" | "red" | "orange" | "blue" | "ink" | "muted" | "card";
const PILL: Record<Tone, string> = { green: s.pillGreen, red: s.pillRed, orange: s.pillOrange, blue: s.pillBlue, ink: s.pillInk, muted: "", card: s.pillCard };
const INK: Record<Tone, string> = { green: s.inkGreen, red: s.inkRed, orange: s.inkOrange, blue: s.inkBlue, ink: "", muted: s.inkMuted, card: "" };

export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx(s.pill, PILL[tone])}>{children}</span>;
}

export function inkClass(tone: Tone): string {
  return INK[tone];
}

/** A KPI tile: label, a big number, one coloured line under it. */
export function Kpi({ label, value, sub, tone = "muted", d = 0, span = 1 }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; d?: number; span?: Span }) {
  return (
    <Tile span={span} d={d}>
      <Label>{label}</Label>
      <div className={s.big}>{value}</div>
      {sub ? <div className={cx(s.sub, INK[tone])}>{sub}</div> : null}
    </Tile>
  );
}

export function Avatar({ letter, size = 38 }: { letter: string; size?: number }) {
  return (
    <div className={s.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {letter}
    </div>
  );
}

/**
 * Vertical bars that grow in (oldest → newest). Pure HTML so they fill any width. `highlight`
 * gets `hiColor`; bars before `dimBefore` are drawn at 55% opacity (the design's "older" bars).
 */
export function VBars({
  values,
  titles,
  height = 120,
  color = "var(--blue)",
  highlight,
  hiColor = "var(--ink)",
  dimBefore = 0,
  gap = 4,
  d = 0,
  zeroColor,
  label,
}: {
  values: number[];
  titles?: string[];
  height?: number;
  color?: string;
  highlight?: number;
  hiColor?: string;
  dimBefore?: number;
  gap?: number;
  d?: number;
  zeroColor?: string;
  label: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className={s.vbars} style={{ height, gap }} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(4, (v / max) * height) : zeroColor ? Math.max(3, height * 0.08) : 0;
        return (
          <span
            key={i}
            className={cx(s.vbar, s.growY)}
            title={titles?.[i]}
            style={{ height: h, background: v > 0 ? (i === highlight ? hiColor : color) : (zeroColor ?? "transparent"), opacity: i < dimBefore ? 0.55 : 1, ...delay(d, i) }}
          />
        );
      })}
    </div>
  );
}

/** Label · bar · value rows for a small ranked breakdown. */
export function HRows({ rows, color = "var(--orange)", d = 0, empty = "Nothing yet.", format = (v: number) => v.toLocaleString("en-IN"), max: maxIn }: { rows: { label: string; value: number; title?: string }[]; color?: string; d?: number; empty?: string; format?: (v: number) => string; max?: number }) {
  if (!rows.length) return <p className={s.note}>{empty}</p>;
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r, i) => (
        <div key={r.label} className={s.hrow} title={r.title}>
          <span>{r.label}</span>
          <div className={s.htrack}>
            <div className={cx(s.hfill, s.growX)} style={{ width: `${Math.max(r.value > 0 ? 2 : 0, Math.min(100, (r.value / max) * 100))}%`, background: color, ...delay(d, i) }} />
          </div>
          <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{format(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

const f1 = (x: number) => Math.round(x * 10) / 10;

/** SVG arc path from 12 o'clock, `from`→`to` as fractions of the circle. */
export function arcPath(cx0: number, cy0: number, r: number, from: number, to: number): string {
  const a0 = -Math.PI / 2 + 2 * Math.PI * from;
  const a1 = -Math.PI / 2 + 2 * Math.PI * Math.min(to, from + 0.9999);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${f1(cx0 + r * Math.cos(a0))},${f1(cy0 + r * Math.sin(a0))} A${r},${r} 0 ${large} 1 ${f1(cx0 + r * Math.cos(a1))},${f1(cy0 + r * Math.sin(a1))}`;
}

/** Donut of shares with a centre label; segments draw in one after another. */
export function Donut({ parts, size = 130, stroke = 16, center, sub, d = 0, label }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; center?: ReactNode; sub?: ReactNode; d?: number; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 0.006 : 0;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {total > 0
          ? parts.map((p, i) => {
              if (p.value <= 0) return null;
              const from = acc / total;
              acc += p.value;
              const to = acc / total;
              return <path key={i} d={arcPath(c, c, r, from + gap, Math.max(from + gap + 0.001, to - gap))} pathLength={1} fill="none" stroke={p.color} strokeWidth={stroke} className={s.draw} style={delay(d, i)} />;
            })
          : null}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          {center != null ? <div style={{ fontSize: size > 120 ? 22 : 13, fontWeight: 800, lineHeight: 1.05 }}>{center}</div> : null}
          {sub ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** A progress ring (0–1) with text in the middle. */
export function RingMeter({ value, size = 54, stroke = 6, color = "var(--blue)", text, d = 0, label }: { value: number | null; size?: number; stroke?: number; color?: string; text: string; d?: number; label: string }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {v > 0 ? <path d={arcPath(c, c, r, 0, v)} pathLength={1} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" className={s.draw} style={delay(d)} /> : null}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{text}</div>
    </div>
  );
}

export function Legend({ color, label, value }: { color: string; label: ReactNode; value?: ReactNode }) {
  return (
    <div className={s.legend}>
      <span className={s.dot} style={{ background: color }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {value != null ? <b style={{ marginLeft: "auto" }}>{value}</b> : null}
    </div>
  );
}

/** One-row stacked share bar. */
export function StackBar({ parts, d = 0, label }: { parts: { value: number; color: string }[]; d?: number; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className={s.stack} role="img" aria-label={label} style={{ background: total ? undefined : "var(--track)" }}>
      {total
        ? parts
            .filter((p) => p.value > 0)
            .map((p, i) => <span key={i} className={s.growX} style={{ width: `${(p.value / total) * 100}%`, background: p.color, ...delay(d, i) }} />)
        : null}
    </div>
  );
}

/** Thin day-by-day strip: true = hit (coloured), false = logged but missed, null = nothing logged. */
export function HitStrip({ days, color, d = 0, label }: { days: (boolean | null)[]; color: string; d?: number; label: string }) {
  return (
    <div className={s.strip} role="img" aria-label={label}>
      {days.map((h, i) => (
        <span key={i} className={s.fade} style={{ background: h ? color : "var(--track)", opacity: h == null ? 0.45 : 1, ...delay(d, i) }} />
      ))}
    </div>
  );
}

/** Line-icon dumbbell (training day). */
export function DumbbellIcon({ color = "currentColor", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
