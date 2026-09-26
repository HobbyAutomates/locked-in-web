"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STYLES } from "@/lib/onboardingV2";
import { mealTypeForHour, mealTypeLabel } from "@/lib/mealType";
import { CoachAvatar } from "@/components/onboarding/kit";

/**
 * v2.14 Home "Today's note" (canvas BCoachHome): one note a morning in the chosen voice, plus the
 * Sunday roast for No excuses. An ink card with the coach's iris mark; Reply opens the chat and
 * the second chip logs the next meal. Hidden until schema_v37 is applied.
 */
type Note = { date: string; text: string; style: string; kind: string; created_at: string };
type Payload = { available: boolean; note: Note | null; roast?: Note | null; evening?: Note | null; noteTime?: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).toLowerCase();

export default function TodayNote() {
  const [data, setData] = useState<Payload | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/coach/note")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => live && setData(d ?? { available: false, note: null }))
      .catch(() => live && setData({ available: false, note: null }));
    return () => {
      live = false;
    };
  }, []);

  if (!data?.available) return null;
  const meal = mealTypeLabel(mealTypeForHour(new Date().getHours()));
  const notes = [data.roast, data.evening ?? data.note].filter((n): n is Note => !!n);
  if (!notes.length)
    return (
      <Link href="/coach" className="press block rounded-[20px] px-4 py-3.5 text-[13.5px] leading-snug" style={{ background: "var(--card)", color: "var(--muted)" }}>
        <span className="flex items-center gap-2.5">
          <CoachAvatar size={28} />
          <span>
            Your coach writes one note a morning{data.noteTime ? ` (${data.noteTime})` : ""}, plus a nudge if you go quiet by 8 pm. Tap to chat now.
          </span>
        </span>
      </Link>
    );
  return (
    <>
      {notes.map((n) => {
        const label = STYLES.find((s) => s.key === n.style)?.label ?? "Coach";
        return (
          <section key={n.kind} className="m-rise rounded-[24px] p-[18px]" style={{ background: "#0B0B0C", color: "#F4F1EA" }} aria-label="Today's note from your coach">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CoachAvatar size={28} />
                <span className="mono" style={{ fontSize: 11.5, color: "#B9AEFF" }}>
                  {n.kind === "roast" ? "Weekly roast" : n.kind === "evening" ? "Evening nudge" : "Today's note"} · {label}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "#8F8A82" }}>{time(n.created_at)}</span>
            </div>
            <p className="m-0 mt-3" style={{ fontSize: 17, lineHeight: 1.45 }}>
              {n.text}
            </p>
            <div className="mt-3.5 flex gap-2">
              <Link href="/coach" className="press rounded-full" style={{ padding: "9px 14px", background: "rgba(255,255,255,.1)", fontSize: 13.5, fontWeight: 600, color: "#F4F1EA" }}>
                Reply
              </Link>
              <Link href="/log?mode=meal" className="press rounded-full" style={{ padding: "9px 14px", background: "rgba(255,255,255,.1)", fontSize: 13.5, fontWeight: 600, color: "#F4F1EA" }}>
                Log {meal.toLowerCase()}
              </Link>
            </div>
          </section>
        );
      })}
    </>
  );
}
