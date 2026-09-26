"use client";

import { useState } from "react";
import { saveCoachSettings, type CoachSettings } from "@/lib/coachActions";
import { STYLES, type CoachStyle } from "@/lib/onboardingV2";
import { CoachMark } from "./CoachMarks";
import { OnbIcon } from "@/components/onboarding/kit";
import { ErrorNote, Toggle } from "@/components/ui";
import { COMING_SOON } from "@/lib/v36";

/** v2.14 Coach → Style (canvas BCoachStyle): the three voices, note time, quiet hours, weekly roast. */

const t12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 || 12;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};

export default function CoachStyleSettings({ initial }: { initial: CoachSettings }) {
  const [s, setS] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!initial.available)
    return (
      <div className="card text-center">
        <p className="font-bold">{COMING_SOON}</p>
        <p className="mt-1 text-sm muted">Coach settings need a quick server update.</p>
      </div>
    );

  async function save(patch: Partial<Omit<CoachSettings, "available" | "teen">>) {
    const prev = s;
    const next = { ...s, ...patch };
    if (patch.style && patch.style !== "no_excuses") next.roast = false;
    setS(next);
    setErr(null);
    setSaved(false);
    const r = await saveCoachSettings(patch.style && patch.style !== "no_excuses" ? { ...patch, roast: false } : patch);
    if (!r.ok) {
      setS(prev);
      setErr(r.error);
    } else setSaved(true);
  }

  return (
    <>
      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Coach style">
        {STYLES.map((st, i) => {
          const on = s.style === st.key;
          const locked = s.teen && st.key === "no_excuses";
          return (
            <button
              key={st.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked}
              className="press flex flex-col gap-2.5 text-left"
              style={{ padding: 16, borderRadius: 22, border: 0, background: "var(--surf)", color: "var(--ink)", boxShadow: on ? "inset 0 0 0 2px var(--ember)" : "none", opacity: locked ? 0.45 : 1 }}
              onClick={() => void save({ style: st.key as CoachStyle })}
            >
              <span className="flex items-center gap-3">
                <CoachMark style={st.key} />
                <span className="flex-1">
                  <span className="display block" style={{ fontSize: 17, fontWeight: 800 }}>
                    {st.label}
                  </span>
                  <span className="block" style={{ fontSize: 13, color: "var(--mute)" }}>
                    {locked ? "18+ only" : st.short}
                  </span>
                </span>
                <span className="grid place-items-center rounded-full" style={{ width: 22, height: 22, border: `2px solid ${on ? "var(--ember)" : "var(--track)"}` }}>
                  {on ? <span className="block rounded-full" style={{ width: 11, height: 11, background: "var(--ember)" }} /> : null}
                </span>
              </span>
              <span className="serif" style={{ fontSize: 15, color: "var(--mute)" }}>
                “{st.sample}”
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[20px] px-4 py-1" style={{ background: "var(--surf)" }}>
        <label className="flex items-center justify-between gap-3 py-3 text-[15px]">
          <span>Morning note</span>
          <input type="time" className="pickfield" style={{ maxWidth: 130, textAlign: "right" }} value={s.noteTime} onChange={(e) => e.target.value && void save({ noteTime: e.target.value })} aria-label={`Morning note, ${t12(s.noteTime)}`} />
        </label>
        <div className="flex items-center justify-between gap-3 py-3 text-[15px]" style={{ borderTop: "1px solid var(--line)" }}>
          <span>Quiet hours</span>
          <span className="flex items-center gap-1.5">
            <input type="time" className="pickfield" style={{ maxWidth: 112 }} value={s.quietFrom} onChange={(e) => e.target.value && void save({ quietFrom: e.target.value })} aria-label="Quiet from" />
            <span style={{ color: "var(--mute)" }}>–</span>
            <input type="time" className="pickfield" style={{ maxWidth: 112 }} value={s.quietTo} onChange={(e) => e.target.value && void save({ quietTo: e.target.value })} aria-label="Quiet until" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-3 text-[15px]" style={{ borderTop: "1px solid var(--line)", opacity: s.style === "no_excuses" ? 1 : 0.45 }}>
          <span>
            Weekly roast (Sunday)
            {s.style !== "no_excuses" ? (
              <span className="block text-[12px]" style={{ color: "var(--mute)" }}>
                No excuses only
              </span>
            ) : null}
          </span>
          <Toggle on={s.roast && s.style === "no_excuses"} disabled={s.style !== "no_excuses"} onChange={(v) => void save({ roast: v })} label="Weekly roast" />
        </div>
      </div>
      <ErrorNote text={err} />
      {saved ? (
        <p className="text-[13px]" style={{ color: "var(--mute)" }} aria-live="polite">
          Saved. Your next note uses it.
        </p>
      ) : null}
      <div className="flex gap-2.5 text-[13px] leading-snug" style={{ color: "var(--mute)" }}>
        <OnbIcon name="shield" size={18} />
        <span>Every style is about habits, never looks. Under 18s get Balanced at most. If you mention not eating or feeling low, the coach switches to calm and shares help.</span>
      </div>
    </>
  );
}
