"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { dismiss, useDismissed } from "@/lib/dismiss";
import { MOOD_LABELS, SLEEP_CHOICES, STRESS_LABELS } from "@/lib/v218/checkin";
import { doseText } from "@/lib/v218/supplements";
import { LineIcon } from "../lineIcons";
import { ErrorNote } from "../ui";
import { api, useCoachJson } from "./api";
import type { DailyState, SupplementsState } from "./types";

/**
 * v2.18 Home: the coach's daily card. Before the check-in it's the 5-second tap (B4: sleep, stress,
 * mood); after, a one-line read-out of what changed today (target buffer, training advice), the
 * recovery score (B8), festival mode (B9), the private cycle day (B6) and today's supplements (B7)
 * as tap-to-tick chips. Hidden entirely until schema_v43 is applied.
 */
export default function CoachDaily() {
  const router = useRouter();
  const { data, set } = useCoachJson<DailyState>("daily");
  const [editing, setEditing] = useState(false);
  const skipped = useDismissed(`checkin:${data ? data.date : ""}`);
  if (!data) return null;
  const showCheckin = data.checkinAvailable && (editing || (!data.checkin && !skipped));
  const supps = data.supplements.available ? data.supplements.items.filter((s) => s.active) : [];
  const nothing = !data.checkinAvailable && !data.festival.line && !supps.length;
  if (nothing) return null;

  return (
    <section aria-label="Today's check-in" className="flex flex-col gap-3 rounded-[22px] p-4" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
      {data.festival.line ? <FestivalBanner d={data} /> : null}
      {showCheckin ? (
        <CheckinTap
          initial={data.checkin}
          onSaved={(d) => {
            set(d);
            setEditing(false);
            router.refresh();
          }}
          onSkip={() => {
            dismiss(`checkin:${data.date}`);
            setEditing(false);
          }}
        />
      ) : data.checkin ? (
        <Readout d={data} onEdit={() => setEditing(true)} />
      ) : data.checkinAvailable ? (
        <button type="button" className="press flex items-center justify-between rounded-2xl px-3.5 py-3 text-left text-[14px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => setEditing(true)}>
          How did you sleep? <span className="muted text-[12px]">5-second check-in</span>
        </button>
      ) : null}
      {data.cycle.today ? (
        <p className="flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[12.5px] leading-[17px]" style={{ background: "var(--purple-bg)", color: "var(--ink)" }}>
          <LineIcon name="lock" size={14} style={{ marginTop: 2, color: "var(--purple)" }} />
          <span>
            <b>Day {data.cycle.today.day} · {data.cycle.today.label}.</b> {data.cycle.today.hunger}
            {data.cycle.today.waterMl ? ` Add about ${data.cycle.today.waterMl} ml water today.` : ""}
          </span>
        </p>
      ) : null}
      {supps.length ? <SupplementChips items={supps} allStreak={data.supplements.allStreak} onChange={(s) => set({ ...data, supplements: { ...data.supplements, items: s.items, allStreak: s.allStreak } })} /> : null}
      <div className="flex gap-2">
        <Link href="/coach?voice=1" className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold" style={{ background: "var(--iris-bg)", color: "var(--iris)", border: "1px solid var(--iris-line)" }}>
          <MicGlyph /> Talk to coach
        </Link>
        <Link href="/coach/hub" className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
          Coach hub <LineIcon name="chev" size={13} />
        </Link>
      </div>
    </section>
  );
}

export function MicGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function FestivalBanner({ d }: { d: DailyState }) {
  const active = d.festival.active;
  return (
    <div className="flex items-start gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--gold) 22%, var(--card2)), var(--card2))", border: "1px solid color-mix(in srgb, var(--gold) 40%, transparent)" }}>
      <LineIcon name="spark" size={18} style={{ color: "var(--gold-deep, var(--gold))", marginTop: 1 }} />
      <p className="text-[13px] leading-[18px]">
        <b className="block">{active ? `${active.name} mode` : `${d.festival.upcoming?.mode.name} is coming`}</b>
        {d.festival.line}
      </p>
    </div>
  );
}

function Readout({ d, onEdit }: { d: DailyState; onEdit: () => void }) {
  const r = d.recovery;
  const tone = r?.band === "push" ? "var(--green)" : r?.band === "deload" ? "var(--orange)" : "var(--accent)";
  return (
    <div className="flex items-start gap-3">
      {r ? (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-center" style={{ background: "var(--card2)" }} aria-label={`Recovery ${r.score} of 100, ${r.label}`}>
          <span className="flex flex-col leading-none">
            <b className="num text-[20px]" style={{ color: tone }}>
              {r.score}
            </b>
            <span className="mt-0.5 text-[10px] font-bold uppercase" style={{ letterSpacing: ".06em", color: tone }}>
              {r.label}
            </span>
          </span>
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold muted">Today&apos;s check-in</p>
        <p className="mt-0.5 text-[13.5px] leading-[19px]">{d.adjust.summary || "Logged. Train as planned."}</p>
        {d.targets.bump > 0 ? (
          <p className="num mt-1 text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
            Target today {d.targets.kcal.toLocaleString("en-IN")} kcal (+{d.targets.bump})
          </p>
        ) : null}
      </div>
      <button type="button" className="press shrink-0 text-[12px] font-semibold underline muted" style={{ background: "none", border: 0 }} onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

function Scale({ label, labels, value, onPick }: { label: string; labels: string[]; value: number | null; onPick: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold muted">{label}</span>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {labels.map((l, i) => {
          const on = value === i + 1;
          return (
            <button key={l} type="button" role="radio" aria-checked={on} className="press rounded-xl text-[12px] font-semibold" style={{ height: 36, border: 0, background: on ? "var(--btn)" : "var(--card2)", color: on ? "var(--btn-ink)" : "var(--ink)" }} onClick={() => onPick(i + 1)}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckinTap({ initial, onSaved, onSkip }: { initial: DailyState["checkin"]; onSaved: (d: DailyState) => void; onSkip: () => void }) {
  const [sleep, setSleep] = useState<number | null>(initial?.sleep_hours ?? null);
  const [stress, setStress] = useState<number | null>(initial?.stress ?? null);
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(next?: { sleep?: number | null; stress?: number | null; mood?: number | null }) {
    const body = { sleep_hours: next?.sleep !== undefined ? next.sleep : sleep, stress: next?.stress !== undefined ? next.stress : stress, mood: next?.mood !== undefined ? next.mood : mood };
    if (body.sleep_hours == null && body.stress == null && body.mood == null) return;
    setBusy(true);
    setErr(null);
    try {
      onSaved(await api<DailyState>("daily", { method: "POST", body }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }
  const pickMood = (v: number) => {
    setMood(v);
    // The last row answered: save straight away (the "5-second" part).
    if (sleep != null && stress != null) void save({ mood: v });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
          Quick check-in
        </p>
        <button type="button" className="press text-[12px] font-semibold muted" style={{ background: "none", border: 0 }} onClick={onSkip}>
          Not today
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold muted">Sleep last night</span>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Hours slept">
          {SLEEP_CHOICES.map((h) => {
            const on = sleep === h;
            return (
              <button key={h} type="button" role="radio" aria-checked={on} className="press num rounded-xl text-[13px] font-semibold" style={{ height: 36, border: 0, background: on ? "var(--btn)" : "var(--card2)", color: on ? "var(--btn-ink)" : "var(--ink)" }} onClick={() => setSleep(h)}>
                {h === 5 ? "≤5" : h === 9 ? "9+" : h} h
              </button>
            );
          })}
        </div>
      </div>
      <Scale label="Stress" labels={STRESS_LABELS} value={stress} onPick={setStress} />
      <Scale label="Mood" labels={MOOD_LABELS} value={mood} onPick={pickMood} />
      <ErrorNote text={err} />
      <button type="button" className="press h-11 rounded-full text-[14px] font-semibold" style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }} disabled={busy || (sleep == null && stress == null && mood == null)} onClick={() => void save()}>
        {busy ? "Saving…" : "Done"}
      </button>
    </div>
  );
}

function SupplementChips({ items, allStreak, onChange }: { items: DailyState["supplements"]["items"]; allStreak: number; onChange: (s: SupplementsState) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function tick(id: string, taken: boolean) {
    setBusy(id);
    try {
      onChange(await api<SupplementsState>("supplements", { method: "PATCH", body: { id, taken } }));
    } catch {
      // leave it; the next load shows the truth
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Link href="/coach/supplements" className="text-[12px] font-semibold muted">
          Supplements
        </Link>
        {allStreak > 1 ? <span className="num inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--ember)" }}><LineIcon name="flame" size={13} /> {allStreak} days, all taken</span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.takenToday}
            className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold"
            style={{ border: s.due ? "1px solid var(--accent)" : "1px solid transparent", background: s.takenToday ? "var(--green-bg)" : "var(--card2)", color: s.takenToday ? "var(--green-ink)" : "var(--ink)", opacity: busy === s.id ? 0.6 : 1 }}
            disabled={busy === s.id}
            onClick={() => void tick(s.id, !s.takenToday)}
          >
            {s.takenToday ? <LineIcon name="check" size={14} /> : null}
            {s.name}
            {doseText(s) ? <span className="muted text-[11px] font-medium">{doseText(s)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
