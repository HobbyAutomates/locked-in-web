"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../Avatar";
import { ErrorNote } from "../ui";
import { grantCoach, revokeCoach } from "@/lib/social/actions";
import { COACH_TIER_NOTE, type CoachRow } from "@/lib/social/coachView";
import type { CoachComment } from "@/lib/social/data";
import { shortDate } from "@/lib/dates";

export default function CoachAccessScreen({ coaches, notes }: { coaches: CoachRow[]; notes: CoachComment[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const names = new Map(coaches.map((c) => [c.coach_id, c.name]));

  async function grant() {
    setBusy("grant");
    setError(null);
    setOk(null);
    const r = await grantCoach(username);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setOk(`@${username.replace(/^@/, "").toLowerCase()} can now see your logs.`);
    setUsername("");
    router.refresh();
  }
  async function revoke(c: CoachRow) {
    setBusy(c.coach_id);
    const r = await revokeCoach(c.coach_id);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <>
      <section className="flex flex-col gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[16px] font-bold">Add your coach</p>
        <p className="text-[13px] muted">They see your daily totals, meals, weight and workouts from the last few weeks, and can leave you notes. They can&rsquo;t change anything. Remove them any time.</p>
        <div className="flex gap-2">
          <input aria-label="Coach's username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@their_username" autoCapitalize="none" className="h-12 min-w-0 flex-1 rounded-2xl px-3.5 text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          <button type="button" disabled={busy === "grant" || username.trim().length < 3} onClick={() => void grant()} className="press h-12 rounded-2xl px-4 text-[14px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: username.trim().length < 3 ? 0.5 : 1 }}>
            {busy === "grant" ? "…" : "Add"}
          </button>
        </div>
        <p className="text-[12px]" style={{ color: "#9c7a35" }}>
          {COACH_TIER_NOTE}
        </p>
      </section>
      <ErrorNote text={error} />
      {ok ? (
        <p role="status" className="px-1 text-[13px] font-semibold" style={{ color: "var(--green-ink)" }}>
          {ok}
        </p>
      ) : null}

      <p className="px-1 text-[13px] font-bold muted">Who can see my logs</p>
      {coaches.length ? (
        <div className="overflow-hidden" style={{ background: "var(--card)", borderRadius: 22, boxShadow: "var(--pcard-ring)" }}>
          {coaches.map((c, i) => (
            <div key={c.coach_id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? "1px solid var(--hair)" : undefined }}>
              <Avatar path={c.avatar_path} name={c.name} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{c.name}</span>
                <span className="text-[12px] muted">{c.username ? `@${c.username} · ` : ""}since {shortDate(c.since.slice(0, 10))}</span>
              </span>
              <button type="button" disabled={busy === c.coach_id} onClick={() => void revoke(c)} className="press h-9 rounded-full px-3 text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--danger)", border: 0 }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 text-[13.5px] muted">Nobody. Your logs are only yours.</p>
      )}

      {notes.length ? (
        <>
          <p className="px-1 text-[13px] font-bold muted">Notes from your coach</p>
          {notes.map((n) => (
            <article key={n.id} className="flex flex-col gap-1" style={{ background: "var(--card)", borderRadius: 18, padding: 14, boxShadow: "var(--pcard-ring)" }}>
              <p className="text-[14.5px] leading-5">{n.body}</p>
              <p className="text-[12px] muted">
                {names.get(n.coach_id) ?? "Coach"} · {n.day ? `about ${shortDate(n.day)}` : shortDate(n.created_at.slice(0, 10))}
              </p>
            </article>
          ))}
        </>
      ) : null}
    </>
  );
}
