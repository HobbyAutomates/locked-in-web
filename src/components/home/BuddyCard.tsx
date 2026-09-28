"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buddyNudge, buddyRequest, loadBuddies, loadBuddyCandidates, type Buddy, type BuddyCandidate } from "@/lib/v214Actions";
import { Avatar } from "../Avatar";
import { Flame } from "../icons";

/**
 * v2.14 buddy streaks on Home: the shared flame (ember: it's a streak), both-logged dots for today,
 * and Nudge when your buddy hasn't logged. Nothing renders until schema_v37 is there; with no buddy
 * yet it's a one-line invite.
 * v2.15: with no buddy but a squadmate who could be one, it's "Buddy up with <name>?" and a one-tap
 * request (schema_v39; without it, the plain invite row that opens /buddy).
 */
export default function BuddyCard() {
  const [list, setList] = useState<Buddy[] | null>(null);
  const [nudged, setNudged] = useState<Record<string, string>>({});
  const [mate, setMate] = useState<BuddyCandidate | null>(null);
  const [req, setReq] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadBuddies()
      .then(async (r) => {
        if (!live) return;
        setList(r.ok ? r.buddies : null);
        if (r.ok && !r.buddies.length) {
          const c = await loadBuddyCandidates().catch(() => null);
          if (live && c?.ok && c.candidates.length) setMate(c.candidates[0]);
        }
      })
      .catch(() => live && setList(null));
    return () => {
      live = false;
    };
  }, []);
  if (!list) return null;
  if (!list.length && mate) {
    const first = mate.name.split(" ")[0] || mate.name;
    return (
      <div className="card flex items-center gap-3" style={{ padding: "12px 12px 12px 16px" }}>
        <Avatar path={mate.avatar_path} name={mate.name} size={36} />
        <Link href="/buddy" className="min-w-0 flex-1" style={{ color: "var(--ink)" }}>
          <span className="block truncate text-[15px] font-bold">Buddy up with {first}?</span>
          <span className="block truncate text-xs muted">{mate.squads ? `From ${mate.squads} · a shared streak` : "A shared streak makes you 2× more likely to stick"}</span>
        </Link>
        <button
          type="button"
          className="press shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold"
          style={req ? { background: "var(--card2)", color: "var(--ink)", border: 0 } : { background: "var(--ember)", color: "var(--ember-ink)", border: 0 }}
          disabled={!!req}
          onClick={async () => {
            setReq("Sending…");
            const r = await buddyRequest(mate.user_id);
            setReq(r.ok ? (r.code ? "Sent" : "Buddies") : null);
          }}
        >
          {req ?? "Send request"}
        </button>
      </div>
    );
  }
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
