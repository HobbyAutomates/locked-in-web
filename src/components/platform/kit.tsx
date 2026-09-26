"use client";

import Link from "next/link";
import { useEffect } from "react";
import { smoothPath } from "@/lib/svgPath";
import { drawLen, md } from "../motion";
import { LineIcon } from "../lineIcons";

/**
 * v2.13 platform UI kit, in the v2.12 premium style (22 px cards on --pcard with the hairline ring,
 * slow m-rise / m-draw entrances from lib/motion.css).
 */

/** The small "PRO" chip on Pro features (spec §1). */
export function ProChip({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 text-[10px] font-extrabold ${className}`}
      style={{ height: 18, letterSpacing: "0.08em", color: "var(--accent-ink)", background: "var(--accent)", lineHeight: 1, ...style }}
      aria-label="Pro feature"
    >
      PRO
    </span>
  );
}

export function PCard({ children, label, className = "", style }: { children: React.ReactNode; label?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <section aria-label={label} className={`flex flex-col gap-3.5 ${className}`} style={{ background: "var(--pcard)", borderRadius: 22, padding: 20, boxShadow: "var(--pcard-ring)", ...style }}>
      {children}
    </section>
  );
}

export function CardLabel({ children, pro = false, right }: { children: React.ReactNode; pro?: boolean; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-[13px] font-semibold muted">
        {children}
        {pro ? <ProChip /> : null}
      </p>
      {right}
    </div>
  );
}

/** Shown wherever a feature needs schema_v36 and the server doesn't have it yet. */
export function ComingSoon({ what = "This" }: { what?: string }) {
  return (
    <PCard label="Coming soon">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <LineIcon name="spark" size={18} />
        Coming with the next update
      </p>
      <p className="text-[13px] muted">{what} needs a server update that's on its way. Nothing you've logged is affected.</p>
    </PCard>
  );
}

/** The paywall card. It can't show while everyone is on the beta, but the logic is live. */
export function ProLocked({ feature }: { feature: string }) {
  return (
    <PCard label="Locked In Pro">
      <p className="flex items-center gap-2 text-[17px] font-bold">
        {feature} <ProChip />
      </p>
      <p className="text-[13px] muted">This is part of Locked In Pro.</p>
      <Link href="/profile/pro" className="press flex h-12 items-center justify-center rounded-2xl text-[15px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
        See Locked In Pro
      </Link>
    </PCard>
  );
}

/** A line chart that draws itself in (values oldest first). */
export function DrawLine({ values, width = 318, height = 90, color = "var(--accent)", delay = 200, label, dots = false, highlight }: { values: number[]; width?: number; height?: number; color?: string; delay?: number; label: string; dots?: boolean; highlight?: boolean[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 0.5);
  const mid = (hi + lo) / 2;
  const x = (i: number) => 6 + (i * (width - 12)) / (values.length - 1);
  const y = (v: number) => 8 + ((mid + span / 2 - v) / span) * (height - 16);
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smoothPath(pts);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={label}>
      <path d={`${line} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`} fill={color} fillOpacity={0.12} className="m-fade" style={md(delay + 1200)} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" pathLength={1} className="m-draw" style={drawLen(1, delay)} />
      {pts.map(([cx, cy], i) =>
        dots || highlight?.[i] || i === pts.length - 1 ? (
          <circle key={i} cx={cx} cy={cy} r={highlight?.[i] ? 5.5 : 4} fill={highlight?.[i] ? "var(--orange)" : color} stroke="var(--pcard)" strokeWidth={2} className="m-pop" style={md(delay + 900 + i * 60)} />
        ) : null,
      )}
    </svg>
  );
}

/** A bottom snackbar with an action (Undo). Auto-dismisses after `ms`. */
export function Snackbar({ text, action, onAction, onTimeout, ms = 6000 }: { text: string; action?: string; onAction?: () => void; onTimeout: () => void; ms?: number }) {
  useEffect(() => {
    const t = setTimeout(onTimeout, ms);
    return () => clearTimeout(t);
  }, [onTimeout, ms]);
  return (
    <div role="status" className="fixed inset-x-0 z-50 mx-auto flex w-[calc(100%-32px)] max-w-[448px] items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--shadow-lg)" }}>
      <span className="text-[14px] font-medium">{text}</span>
      {action ? (
        <button type="button" className="press min-h-11 px-2 text-[14px] font-bold" style={{ background: "none", border: 0, color: "var(--accent2)" }} onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

/** Screen header for platform pages that use the (sub) layout. */
export function PageTitle({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  return (
    <h1 className="screen-title flex items-center gap-2.5" style={{ padding: "4px 4px 2px" }}>
      {children}
      {pro ? <ProChip style={{ height: 20 }} /> : null}
    </h1>
  );
}
