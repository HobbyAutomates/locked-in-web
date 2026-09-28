"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../Avatar";
import { BottomSheet, ErrorNote } from "../ui";
import { giftFreeze, syncFreezes } from "@/lib/social/actions";
import { GIFT_REASON_TEXT, MAX_FREEZES, canGift, freezeCountText } from "@/lib/social/freezes";
import type { SquadMate } from "@/lib/social/data";
import { shortDate } from "@/lib/dates";

/** One token: a faceted ice shield, lit when you have it. */
function Token({ lit, i }: { lit: boolean; i: number }) {
  return (
    <svg width="64" height="72" viewBox="0 0 64 72" aria-hidden="true" className="m-pop" style={{ animationDelay: `${120 + i * 90}ms` }}>
      <defs>
        <linearGradient id={`fz${i}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={lit ? "#e6f6ff" : "#3a3a3f"} />
          <stop offset=".5" stopColor={lit ? "#7cc4f2" : "#26262a"} />
          <stop offset="1" stopColor={lit ? "#1f5f8f" : "#141416"} />
        </linearGradient>
      </defs>
      <path d="M32 3 L59 12 L59 36 C59 54 45 64 32 69 C19 64 5 54 5 36 L5 12 Z" fill={`url(#fz${i})`} stroke={lit ? "#bfe6ff" : "rgba(255,255,255,.1)"} strokeWidth="1.5" />
      <g stroke={lit ? "#ffffff" : "#4a4a50"} strokeWidth="2.2" strokeLinecap="round" opacity={lit ? 0.95 : 0.6}>
        <path d="M32 20v28M20 27l24 14M44 27 20 41" />
        <path d="M28 22l4 4 4-4M28 46l4-4 4 4" fill="none" />
      </g>
    </svg>
  );
}

export default function FreezeScreen({ tokens: tokens0, usedDays, hint, streak, mates, lastGiftTo }: { tokens: number; usedDays: string[]; hint: string; streak: number; mates: SquadMate[]; lastGiftTo: Record<string, string> }) {
  const router = useRouter();
  const [tokens, setTokens] = useState(tokens0);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [gifted, setGifted] = useState<Record<string, string>>(lastGiftTo);

  async function sync() {
    setBusy("sync");
    setError(null);
    const r = await syncFreezes();
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setTokens(r.data.tokens);
    setNote(r.data.used_now ? "A freeze covered a missed day." : r.data.earned_now ? "Perfect week: +1 freeze." : "Up to date.");
    router.refresh();
  }

  async function gift(m: SquadMate) {
    setBusy(m.user_id);
    setError(null);
    const r = await giftFreeze(m.user_id);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setTokens(r.data.tokens);
    setGifted((g) => ({ ...g, [m.user_id]: new Date().toISOString() }));
    setNote(`Sent a freeze to ${m.name.split(" ")[0]}.`);
    setSheet(false);
  }

  return (
    <>
      <section aria-label="Your freezes" className="flex flex-col items-center gap-3 text-center" style={{ background: "linear-gradient(180deg, #0B0B0C, #151518)", color: "#F4F1EA", borderRadius: 26, padding: "26px 18px 22px", boxShadow: "var(--shadow-lg)" }}>
        <p className="mono text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.14em", opacity: 0.6 }}>
          Streak freezes
        </p>
        <div className="flex items-end justify-center gap-3">
          {Array.from({ length: MAX_FREEZES }, (_, i) => (
            <Token key={i} lit={i < tokens} i={i} />
          ))}
        </div>
        <p className="display text-[28px] font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
          {freezeCountText(tokens)}
        </p>
        <p className="max-w-[300px] text-[13.5px]" style={{ opacity: 0.72 }}>
          {hint}
        </p>
        <p className="text-[12.5px]" style={{ color: "#FF8B5E" }}>
          Day streak: {streak} {streak === 1 ? "day" : "days"}
        </p>
      </section>

      <ErrorNote text={error} />
      {note ? (
        <p role="status" className="px-1 text-[13px] font-semibold" style={{ color: "var(--green-ink)" }}>
          {note}
        </p>
      ) : null}

      <section aria-label="How it works" className="flex flex-col gap-2.5" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[15.5px] font-semibold">How freezes work</p>
        {[
          ["Earn", "Log something on all 7 days of a week (Monday to Sunday) and you get one. You can hold 3."],
          ["Auto-use", "Miss a day and one is used for you the next morning, so the streak carries on. If the gap is longer than your freezes, none are spent."],
          ["Gift", "Send one to a squadmate who needs it. Once a week per person."],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="mt-0.5 w-16 shrink-0 text-[12.5px] font-bold" style={{ color: "var(--accent)" }}>
              {k}
            </span>
            <span className="text-[13.5px] leading-5 muted">{v}</span>
          </div>
        ))}
        <div className="mt-1 flex gap-2">
          <button type="button" className="press h-11 flex-1 rounded-2xl text-[14px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: tokens < 1 ? 0.5 : 1 }} disabled={tokens < 1} onClick={() => setSheet(true)}>
            Gift a freeze
          </button>
          <button type="button" className="press h-11 rounded-2xl px-4 text-[14px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} disabled={busy === "sync"} onClick={() => void sync()}>
            {busy === "sync" ? "Checking…" : "Check now"}
          </button>
        </div>
      </section>

      {usedDays.length ? (
        <section aria-label="Days covered" className="flex flex-col gap-2" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
          <p className="text-[15.5px] font-semibold">Days a freeze covered</p>
          <ul className="flex flex-col gap-1.5">
            {usedDays.slice(0, 12).map((d) => (
              <li key={d} className="flex items-center justify-between text-[13.5px]">
                <span>{shortDate(d)}</span>
                <span className="muted">frozen</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Gift a freeze">
        {mates.length ? (
          <ul className="flex flex-col">
            {mates.map((m) => {
              const check = canGift(tokens, null, gifted[m.user_id] ?? null);
              return (
                <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                  <Avatar path={m.avatar_path} name={m.name} size={40} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.name}</span>
                  <button type="button" className="press h-10 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: check.ok ? "var(--ink)" : "var(--card2)", color: check.ok ? "var(--bg)" : "var(--muted)", border: 0 }} disabled={!check.ok || busy === m.user_id} onClick={() => void gift(m)}>
                    {busy === m.user_id ? "Sending…" : check.ok ? "Gift" : GIFT_REASON_TEXT[check.reason]}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] muted">Join a squad to gift freezes to your squadmates.</p>
        )}
      </BottomSheet>
    </>
  );
}
