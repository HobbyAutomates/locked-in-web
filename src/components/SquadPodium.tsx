"use client";

import { useEffect, useState } from "react";
import { loadChallengeBoard } from "@/lib/actions";
import { streakJewel } from "@/lib/jewels";
import type { Challenge, ChallengeBoardRow, LeaderRow } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Jewel } from "./Jewel";

/**
 * v2.16 squad leaderboard (board SquadLeaderboard, locked by the owner): a frosted-glass 3D podium
 * (2 · 1 · 3, gold for #1, a crown above the winner) with each person's top badge as a mini jewel
 * on their photo and a streak pill, then everyone else on glass rows with an ember progress ring.
 * The metric is the day streak, unless a challenge is running: then challenge points (days done).
 */

type Entry = { user_id: string; name: string; avatar_path: string | null; value: number; flames: number; row: LeaderRow | null };

const FLAME = "M12 21c3.6 0 6-2.4 6-5.8 0-3.4-2.6-5.2-3.6-8.2-.3 1.8-1.3 3-2.4 3.4.3-2.8-.8-5.6-3.2-7.4.3 3.2-3.8 6-3.8 12.2C5 18.6 8.4 21 12 21z";

/** Ranked entries: challenge points when a running challenge's board is in, else the day streak. */
export function rankEntries(rows: LeaderRow[], board: ChallengeBoardRow[] | null): Entry[] {
  if (board && board.length) {
    const flames = new Map(rows.map((r) => [r.user_id, r]));
    return [...board]
      .sort((a, b) => b.progress - a.progress || a.rank - b.rank)
      .map((b) => ({ user_id: b.user_id, name: b.name, avatar_path: b.avatar_path, value: b.progress, flames: flames.get(b.user_id)?.flames ?? 0, row: flames.get(b.user_id) ?? null }));
  }
  return [...rows].sort((a, b) => b.flames - a.flames || a.rank - b.rank).map((r) => ({ user_id: r.user_id, name: r.name, avatar_path: r.avatar_path, value: r.flames, flames: r.flames, row: r }));
}

export function SquadPodium({ me, rows, challenges, boards, onOpenProfile }: { me: string; rows: LeaderRow[]; challenges: Challenge[]; boards: Record<string, ChallengeBoardRow[]>; onOpenProfile: (row: LeaderRow) => void }) {
  const active = challenges.find((c) => c.status === "active") ?? null;
  // The running challenge's board: from the Challenges tab if it has loaded, else fetched here once.
  const [fetched, setFetched] = useState<Record<string, ChallengeBoardRow[]>>({});
  const activeId = active?.id ?? null;
  const known = activeId ? boards[activeId] ?? fetched[activeId] ?? null : null;
  useEffect(() => {
    if (!activeId || boards[activeId] || fetched[activeId]) return;
    let live = true;
    loadChallengeBoard(activeId)
      .then((b) => {
        if (live) setFetched((f) => ({ ...f, [activeId]: b }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activeId, boards, fetched]);
  const board = known;

  const points = !!(active && board && board.length);
  const entries = rankEntries(rows, points ? board : null);
  const unit = (n: number) => (points ? `${n} pt${n === 1 ? "" : "s"}` : `${n} day${n === 1 ? "" : "s"}`);
  const top = entries.slice(0, 3);
  const rest = entries.slice(3);
  const lead = Math.max(1, entries[0]?.value ?? 1);
  // Podium order: 2 · 1 · 3.
  const order = [top[1], top[0], top[2]];
  const open = (e: Entry) => e.row && onOpenProfile(e.row);

  return (
    <div className="flex flex-col">
      <div className="relative mt-4 flex items-end gap-2 rounded-t-[30px] px-3 pt-4" style={{ background: "radial-gradient(80% 60% at 50% 30%, rgba(255,91,31,.18), transparent 70%)" }}>
        {order.map((e, i) => {
          if (!e) return <div key={i} className="flex-1" />;
          const place = i === 1 ? 1 : i === 0 ? 2 : 3;
          const size = place === 1 ? 64 : 54;
          const h = place === 1 ? 170 : place === 2 ? 128 : 100;
          const jewel = streakJewel(e.flames);
          return (
            <div key={e.user_id} className="flex min-w-0 flex-col items-center" style={{ flex: place === 1 ? 1.15 : 1 }}>
              {place === 1 ? (
                <svg width="30" height="22" viewBox="0 0 40 30" aria-hidden="true" className="m-drop" style={{ animationDelay: "500ms" }}>
                  <defs>
                    <linearGradient id="podium-crown" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#fbe7a8" />
                      <stop offset="1" stopColor="#A8823A" />
                    </linearGradient>
                  </defs>
                  <path d="M2 26 L6 6 L14 16 L20 2 L26 16 L34 6 L38 26 Z" fill="url(#podium-crown)" />
                </svg>
              ) : null}
              <button type="button" className="press relative rounded-full" style={{ background: "none", border: 0, padding: 0, boxShadow: place === 1 ? "0 0 0 3px var(--bg), 0 0 0 5px #D9B872" : "0 0 0 3px var(--bg), 0 0 0 4px color-mix(in srgb, var(--ink) 20%, transparent)" }} onClick={() => open(e)} aria-label={`${e.name}, number ${place}, ${unit(e.value)}${jewel ? `, top badge ${jewel.name}` : ""}`}>
                <Avatar path={e.avatar_path} name={e.name} size={size} />
                {jewel ? (
                  <span className="absolute" style={{ right: -10, bottom: -8 }}>
                    <Jewel category={jewel.category} tier={jewel.tier} size={30} />
                  </span>
                ) : null}
              </button>
              <span className="mt-3 max-w-full truncate text-[14px] font-semibold">
                {e.name.split(/\s+/)[0]}
                {e.user_id === me ? <span className="font-normal muted"> · you</span> : null}
              </span>
              <span className="num mt-1.5 inline-flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold" style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF8B5E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={FLAME} />
                </svg>
                {unit(e.value)}
              </span>
              <div
                className="m-growy relative mt-3 w-full overflow-hidden rounded-t-[10px]"
                style={{
                  height: h,
                  animationDelay: `${place === 1 ? 250 : place === 2 ? 100 : 400}ms`,
                  background: place === 1 ? "linear-gradient(180deg, rgba(217,184,114,.35), rgba(217,184,114,.03))" : "linear-gradient(180deg, color-mix(in srgb, var(--ink) 14%, transparent), color-mix(in srgb, var(--ink) 2%, transparent))",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), inset 0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
                aria-hidden="true"
              >
                <div className="absolute inset-x-0 top-0 h-3.5" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.3), transparent)" }} />
                <div className="num absolute inset-x-0 top-5 text-center font-extrabold" style={{ fontSize: place === 1 ? 54 : 42, color: place === 1 ? "var(--gold-ink)" : "color-mix(in srgb, var(--ink) 70%, transparent)", textShadow: "0 2px 0 rgba(0,0,0,.2)" }}>
                  {place}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t pt-3" style={{ borderColor: "var(--hair)" }}>
        <span className="text-[9px] font-medium uppercase muted" style={{ letterSpacing: ".28em" }}>
          {points ? `${active?.title ?? "Challenge"} · points` : "This week · streak days"}
        </span>
      </div>
      <div className="flex flex-col gap-2 pt-1">
        {rest.map((e, k) => {
          const pct = Math.round(Math.min(1, e.value / lead) * 100);
          const c = 2 * Math.PI * 20;
          return (
            <button
              key={e.user_id}
              type="button"
              className="press mt-1 flex items-center gap-3 rounded-[20px] px-3.5 py-3 text-left"
              style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--ink) 7%, transparent), color-mix(in srgb, var(--ink) 2%, transparent))", boxShadow: e.user_id === me ? "inset 0 0 0 1.5px var(--ember)" : "inset 0 0 0 1px color-mix(in srgb, var(--ink) 7%, transparent)", border: 0, color: "var(--ink)" }}
              onClick={() => open(e)}
            >
              <span className="num w-[18px] text-[14px] font-semibold muted">{k + 4}</span>
              <Avatar path={e.avatar_path} name={e.name} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">
                  {e.name}
                  {e.user_id === me ? <span className="font-normal muted"> · you</span> : null}
                </span>
                <span className="text-[12.5px] muted">{points ? unit(e.value) : `${unit(e.value)} streak`}</span>
              </span>
              <span className="relative grid h-[46px] w-[46px] shrink-0 place-items-center">
                <svg width="46" height="46" className="absolute inset-0" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
                  <circle cx="23" cy="23" r="20" fill="none" stroke="color-mix(in srgb, var(--ink) 10%, transparent)" strokeWidth="4" />
                  <circle cx="23" cy="23" r="20" fill="none" stroke="#FF5B1F" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
                </svg>
                <span className="num text-[11px] font-semibold">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
