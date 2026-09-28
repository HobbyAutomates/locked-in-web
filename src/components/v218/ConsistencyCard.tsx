"use client";

import Link from "next/link";
import ShareButton from "../platform/ShareButton";
import { useCoachJson } from "./api";
import type { InsightsState } from "./types";

/**
 * v2.18 B11 consistency score (0–100 over 14 days: logging, protein, training, sleep), for Profile
 * and the coach hub. Shareable as the ember milestone story card. Hides when the route fails.
 */
export default function ConsistencyCard({ insights, link = true }: { insights?: InsightsState | null; link?: boolean }) {
  const own = useCoachJson<InsightsState>(insights === undefined ? "insights" : null);
  const d = insights === undefined ? own.data : insights;
  if (!d) return null;
  const c = d.consistency;
  const ring = Math.max(0, Math.min(100, c.score));
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <section aria-label="Consistency score" className="flex flex-col gap-3 rounded-[22px] p-4" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
      <div className="flex items-center gap-4">
        <svg width={76} height={76} viewBox="0 0 76 76" aria-hidden>
          <circle cx={38} cy={38} r={R} fill="none" stroke="var(--track)" strokeWidth={7} />
          <circle cx={38} cy={38} r={R} fill="none" stroke="var(--ember)" strokeWidth={7} strokeLinecap="round" strokeDasharray={`${(ring / 100) * C} ${C}`} transform="rotate(-90 38 38)" />
          <text x={38} y={44} textAnchor="middle" className="num" style={{ fontSize: 20, fontWeight: 700, fill: "var(--ink)" }}>
            {c.score}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase muted" style={{ letterSpacing: ".08em" }}>
            Consistency · 14 days
          </p>
          <p className="text-[20px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em" }}>
            {c.label}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-[17px] muted">{c.tip}</p>
        </div>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${c.parts.length}, minmax(0, 1fr))` }}>
        {c.parts.map((p) => (
          <div key={p.key} className="rounded-xl px-2 py-1.5 text-center" style={{ background: "var(--card2)" }}>
            <b className="num block text-[14px]">{p.pct}%</b>
            <span className="text-[10.5px] muted">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <ShareButton compact pro={false} label="Share" filename="locked-in-consistency.png" card={() => ({ kind: "milestone", eyebrow: "CONSISTENCY SCORE", big: String(c.score), line: `${c.label} over the last 14 days` })} />
        {link ? (
          <Link href="/coach/hub" className="press text-[13px] font-semibold underline muted">
            See what&apos;s behind it
          </Link>
        ) : null}
      </div>
    </section>
  );
}
