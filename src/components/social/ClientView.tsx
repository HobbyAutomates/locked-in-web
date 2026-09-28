"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "../ui";
import { addCoachComment, revokeCoach } from "@/lib/social/actions";
import { adherenceLine, type Overview } from "@/lib/social/coachView";
import type { CoachComment } from "@/lib/social/data";
import { shortDate } from "@/lib/dates";

const card: React.CSSProperties = { background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" };

export default function ClientView({ clientId, today, o, comments }: { clientId: string; today: string; o: Overview; comments: CoachComment[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const r = await addCoachComment(clientId, note, day);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNote("");
    setDay(null);
    router.refresh();
  }
  async function drop() {
    const r = await revokeCoach(clientId);
    if (!r.ok) return setError(r.error);
    router.push("/clients");
  }

  const latestW = o.weights[0];
  const oldestW = o.weights[o.weights.length - 1];
  return (
    <>
      <section style={card} className="flex flex-col gap-2">
        <p className="text-[15.5px] font-semibold">{adherenceLine(o, today)}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Calories", o.calorie_target ? `${o.calorie_target}` : "—"],
            ["Protein", o.protein_target_g ? `${o.protein_target_g} g` : "—"],
            ["Goal", o.goal_type ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl py-2.5" style={{ background: "var(--card2)" }}>
              <p className="num text-[16px] font-bold">{v}</p>
              <p className="text-[11px] muted">{k}</p>
            </div>
          ))}
        </div>
        {latestW ? (
          <p className="text-[13px] muted">
            Weight {latestW.kg} kg{oldestW && oldestW !== latestW ? ` (${latestW.kg - oldestW.kg > 0 ? "+" : ""}${Math.round((latestW.kg - oldestW.kg) * 10) / 10} kg since ${shortDate(oldestW.date)})` : ""}
            {o.goal_weight_kg ? ` · goal ${o.goal_weight_kg} kg` : ""}
          </p>
        ) : null}
      </section>

      <section style={card} className="flex flex-col gap-1">
        <p className="mb-1 text-[15px] font-semibold">Last 14 days</p>
        {o.days.length ? (
          o.days.map((d) => (
            <button key={d.date} type="button" onClick={() => setDay(d.date)} className="press flex items-center justify-between rounded-xl px-2 py-2 text-left text-[13.5px]" style={{ background: day === d.date ? "var(--card2)" : "none", border: 0, color: "var(--ink)" }}>
              <span className="w-24">{shortDate(d.date)}</span>
              <span className="num flex-1 text-right">{Math.round(d.calories)} kcal</span>
              <span className="num w-16 text-right">{Math.round(d.protein_g)} g</span>
              <span className="w-8 text-right">{d.trained ? "🏋️" : ""}</span>
            </button>
          ))
        ) : (
          <p className="text-[13px] muted">Nothing logged in the last two weeks.</p>
        )}
      </section>

      {o.meals.length ? (
        <section style={card} className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold">Meals</p>
          {o.meals.slice(0, 30).map((m, i) => (
            <div key={`${m.date}-${i}`} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="muted">{shortDate(m.date)} · </span>
                {m.text || "Meal"}
              </span>
              <span className="num shrink-0 muted">
                {Math.round(m.calories)} kcal · {Math.round(m.protein_g)} g
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {o.workouts.length ? (
        <section style={card} className="flex flex-col gap-1.5">
          <p className="text-[15px] font-semibold">Workouts</p>
          {o.workouts.map((w, i) => (
            <p key={`${w.date}-${i}`} className="text-[13px]">
              <span className="muted">{shortDate(w.date)} · </span>
              {w.kind}
              {w.minutes ? `, ${w.minutes} min` : ""}
              {w.muscles.length ? ` · ${w.muscles.slice(0, 4).join(", ")}` : ""}
            </p>
          ))}
        </section>
      ) : null}

      <section style={card} className="flex flex-col gap-2.5">
        <p className="text-[15px] font-semibold">Leave a note</p>
        {day ? (
          <p className="text-[12.5px] muted">
            About {shortDate(day)} ·{" "}
            <button type="button" className="underline" style={{ background: "none", border: 0, color: "var(--ink)", padding: 0 }} onClick={() => setDay(null)}>
              general note instead
            </button>
          </p>
        ) : (
          <p className="text-[12.5px] muted">Tap a day above to attach the note to it.</p>
        )}
        <textarea aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Great protein this week. Add a second roti on training days." className="min-h-24 rounded-2xl px-3.5 py-3 text-[14px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
        <ErrorNote text={error} />
        <button type="button" disabled={busy || !note.trim()} onClick={() => void send()} className="press h-11 rounded-2xl text-[14px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: note.trim() ? 1 : 0.5 }}>
          {busy ? "Sending…" : "Send note"}
        </button>
        {comments.length ? (
          <div className="mt-1 flex flex-col gap-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-2xl px-3 py-2.5 text-[13.5px]" style={{ background: "var(--card2)" }}>
                {c.body}
                <p className="mt-0.5 text-[11.5px] muted">{c.day ? `About ${shortDate(c.day)}` : shortDate(c.created_at.slice(0, 10))}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <button type="button" onClick={() => void drop()} className="press h-11 text-[13.5px] font-semibold" style={{ background: "none", border: 0, color: "var(--danger)" }}>
        Stop coaching this client
      </button>
    </>
  );
}
