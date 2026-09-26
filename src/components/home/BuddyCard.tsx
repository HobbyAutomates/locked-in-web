"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buddyNudge, loadBuddies, type Buddy } from "@/lib/v214Actions";
import { Flame } from "../icons";

/**
 * v2.14 buddy streaks on Home: the shared flame (ember: it's a streak), both-logged dots for today,
 * and Nudge when your buddy hasn't logged. Nothing renders until schema_v37 is there; with no buddy
 * yet it's a one-line invite.
 */
export default function BuddyCard() {
  const [list, setList] = useState<Buddy[] | null>(null);
  const [nudged, setNudged] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    loadBuddies()
      .then((r) => live && setList(r.ok ? r.buddies : null))
      .catch(() => live && setList(null));
    return () => {
      live = false;
    };
  }, []);
  if (!list) return null;
  if (!list.length)
    return (
      <Link href="/buddy" className="card press flex items-center gap-3" style={{ padding: "12px 16px", color: "var(--ink)" }}>
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--card2)", color: "var(--muted)" }}>
          <Flame size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Bring a buddy</span>
          <span className="block text-xs muted">A shared streak makes you 2× more likely to stick</span>
        </span>
      </Link>
    );
  return (
    <>
      {list.slice(0, 2).map((b) => {
        const both = b.me_today && b.partner_today;
        return (
          <div key={b.id} className="card flex items-center gap-3" style={{ padding: "12px 12px 12px 16px" }}>
            <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: b.streak > 0 ? "var(--ember-bg)" : "var(--card2)", color: b.streak > 0 ? "var(--ember)" : "var(--muted)" }}>
              <Flame size={18} />
            </span>
            <Link href="/buddy" className="min-w-0 flex-1" style={{ color: "var(--ink)" }}>
              <span className="num block text-[15px] font-extrabold">
                {b.streak}-day streak · you + {b.partner_name}
              </span>
              <span className="flex items-center gap-1.5 text-xs muted">
                <Dot on={b.me_today} /> you <Dot on={b.partner_today} /> {b.partner_name.split(" ")[0]}
                {both ? " · today counts" : ""}
              </span>
            </Link>
            {!b.partner_today ? (
              <button
                type="button"
                className="press shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold"
                style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }}
                disabled={!!nudged[b.id]}
                onClick={async () => {
                  const r = await buddyNudge(b.id);
                  setNudged((n) => ({ ...n, [b.id]: r.ok ? (r.sent ? "Nudged" : "Sent today") : "Try later" }));
                }}
              >
                {nudged[b.id] ?? "Nudge"}
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: on ? "var(--ink)" : "transparent", border: "1.5px solid var(--ink)" }} />;
}
