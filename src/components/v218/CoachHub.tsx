"use client";

import Link from "next/link";
import { useState } from "react";
import SubPage from "@/components/SubPage";
import { FESTIVAL_PRESETS, type FestivalKind } from "@/lib/v218/festival";
import { COMING_SOON } from "@/lib/v36";
import { LineIcon, type LineName } from "../lineIcons";
import { ErrorNote } from "../ui";
import { AccentButton, CardHead, GhostButton, PCard, Pill } from "../nutrition/kit";
import CoachDaily from "./CoachDaily";
import ConsistencyCard from "./ConsistencyCard";
import { api, useCoachJson } from "./api";
import type { InsightsState, ModesState } from "./types";

/**
 * v2.18 coach hub (/coach/hub): everything the coach stream added in one place. Today's check-in
 * and recovery, the weekly check-in (B2), plateau detective (B5), why the target changed (B3,
 * English / हिंदी), the consistency score (B11), festival & wedding mode (B9), private cycle
 * guidance (B6), and links to supplements, fasting presets, home workouts, sports and form check.
 */
export default function CoachHub({ gender }: { gender: string | null }) {
  const { data } = useCoachJson<InsightsState>("insights?generate=1");
  return (
    <SubPage title="Coach hub" back="/">
      <div className="flex flex-col gap-3.5">
        <CoachDaily />
        {data === null ? <p className="py-6 text-center text-sm muted">Reading your week…</p> : null}
        {data ? (
          <>
            <WeeklyCard d={data} />
            <PlateauCard d={data} />
            {data.why ? <WhyCard why={data.why} /> : null}
            <ConsistencyCard insights={data} link={false} />
          </>
        ) : null}
        <FestivalCard />
        {gender !== "male" ? <CycleCard /> : null}
        <PCard label="More">
          <div className="grid grid-cols-2 gap-2">
            <Tile href="/coach/supplements" icon="drop" title="Supplements" sub="Doses, reminders, streak" />
            <Tile href="/fasting" icon="flame" title="Indian fasts" sub="Navratri, Ramadan, Ekadashi, Jain" />
            <Tile href="/train" icon="target" title="Home workouts" sub="No-equipment and band plans" />
            <Tile href="/train/sports" icon="award" title="Sports & steps" sub="Cricket, football, kabaddi…" />
            <Tile href="/train/form-check" icon="camera" title="Form check" sub="Rep count + tips, on device" />
            <Tile href="/coach?voice=1" icon="chat" title="Voice coach" sub="Ask out loud, hear it back" />
          </div>
        </PCard>
      </div>
    </SubPage>
  );
}

function Tile({ href, icon, title, sub }: { href: string; icon: LineName; title: string; sub: string }) {
  return (
    <Link href={href} className="press flex min-h-[88px] flex-col justify-between rounded-2xl p-3" style={{ background: "var(--card2)", color: "var(--ink)" }}>
      <LineIcon name={icon} size={18} />
      <span>
        <span className="block text-[14px] font-semibold leading-tight">{title}</span>
        <span className="block text-[11px] leading-snug muted">{sub}</span>
      </span>
    </Link>
  );
}

function WeeklyCard({ d }: { d: InsightsState }) {
  const w = d.weekly;
  if (!w) return null;
  const f = w.facts;
  return (
    <PCard label="Weekly check-in">
      <CardHead icon="chart" title="Weekly check-in" sub={`Week of ${new Date(`${w.weekStart}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`} right={<Pill tone="accent">{w.plan.title}</Pill>} />
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {([
          [`${f.loggedDays}/7`, "days logged"],
          [f.avgProtein != null ? `${Math.round(f.avgProtein)} g` : "—", "avg protein"],
          [`${f.workouts}/${f.workoutTarget}`, "workouts"],
          [f.avgSleep != null ? `${f.avgSleep.toFixed(1)} h` : "—", "sleep"],
        ] as const).map(([v, l]) => (
          <div key={l} className="rounded-xl px-1 py-1.5" style={{ background: "var(--card2)" }}>
            <b className="num block text-[14px]">{v}</b>
            <span className="text-[10px] muted">{l}</span>
          </div>
        ))}
      </div>
      <p className="text-[14px] leading-[20px]">{w.text}</p>
      <p className="rounded-2xl px-3.5 py-3 text-[13px] leading-[18px]" style={{ background: "var(--iris-bg)", border: "1px solid var(--iris-line)" }}>
        <b style={{ color: "var(--iris)" }}>Next week&apos;s one thing:</b> {w.plan.plan}
      </p>
    </PCard>
  );
}

function PlateauCard({ d }: { d: InsightsState }) {
  const p = d.plateau;
  if (!p.flat) return null;
  return (
    <PCard label="Plateau detective">
      <CardHead icon="scale" title="Plateau detective" sub={`Your trend has been flat for ${p.days}+ days (${p.trendKgPerWeek > 0 ? "+" : ""}${p.trendKgPerWeek} kg/week).`} />
      <div className="flex flex-col gap-2">
        {p.causes.slice(0, 3).map((c, i) => (
          <div key={c.key} className="rounded-2xl px-3.5 py-3" style={{ background: i === 0 ? "color-mix(in srgb, var(--accent) 10%, var(--card2))" : "var(--card2)" }}>
            <p className="text-[14px] font-semibold">
              {i === 0 ? "Most likely: " : ""}
              {c.title}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-[17px] muted">{c.detail}</p>
            {i === 0 ? (
              <p className="mt-1.5 text-[13px] leading-[18px]">
                <b>Fix:</b> {c.fix}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </PCard>
  );
}

function WhyCard({ why }: { why: NonNullable<InsightsState["why"]> }) {
  const [hi, setHi] = useState(false);
  return (
    <PCard label="Why your target changed">
      <CardHead
        icon="target"
        title={why.direction === "same" ? "Your target is on track" : "Why your target changed"}
        sub={`${why.oldTarget.toLocaleString("en-IN")} → ${why.newTarget.toLocaleString("en-IN")} kcal`}
        right={
          <button type="button" className="press h-8 rounded-full px-3 text-[12px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => setHi((h) => !h)} aria-label={hi ? "Show in English" : "हिंदी में दिखाएँ"}>
            {hi ? "English" : "हिंदी"}
          </button>
        }
      />
      <ol className="flex flex-col gap-1.5 text-[13.5px] leading-[19px]" lang={hi ? "hi" : "en"}>
        {(hi ? why.hi : why.en).map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="num shrink-0 font-semibold muted">{i + 1}.</span>
            <span>{l}</span>
          </li>
        ))}
      </ol>
    </PCard>
  );
}

function FestivalCard() {
  const { data, set } = useCoachJson<ModesState>("modes");
  const [kind, setKind] = useState<FestivalKind | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  if (!data.festival.available)
    return (
      <PCard label="Festival mode">
        <CardHead icon="spark" title="Festival & wedding mode" sub={COMING_SOON} />
      </PCard>
    );
  const pick = (k: FestivalKind) => {
    const p = FESTIVAL_PRESETS.find((x) => x.kind === k);
    setKind(k);
    setName(p?.name ?? "");
    const s = data.date;
    setStart(s);
    setEnd(new Date(Date.parse(`${s}T00:00:00Z`) + ((p?.days ?? 3) - 1) * 86_400_000).toISOString().slice(0, 10));
  };
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      set(await api<ModesState>("modes", { method: "POST", body: { type: "festival", kind, name, start_date: start, end_date: end } }));
      setKind(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }
  const upcoming = data.festival.modes.filter((m) => m.end_date >= data.date);
  return (
    <PCard label="Festival mode">
      <CardHead icon="spark" title="Festival & wedding mode" sub="Targets go to maintenance, your streak is protected, and the coach warns you a few days ahead." />
      {upcoming.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5" style={{ background: "var(--card2)" }}>
          <span className="min-w-0">
            <b className="block truncate text-[14px]">{m.name}</b>
            <span className="num text-[12px] muted">
              {m.start_date} → {m.end_date}
              {m.start_date <= data.date ? " · on now" : ""}
            </span>
          </span>
          <button type="button" className="press text-[12px] font-semibold underline muted" style={{ background: "none", border: 0 }} onClick={() => void api<ModesState>(`modes?id=${m.id}`, { method: "DELETE" }).then(set).catch(() => undefined)}>
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {[...FESTIVAL_PRESETS.map((p) => ({ kind: p.kind, name: p.name })), { kind: "other" as const, name: "Other" }].map((p) => (
          <button key={p.kind} type="button" className="chip press" style={{ height: 34 }} aria-pressed={kind === p.kind} onClick={() => (kind === p.kind ? setKind(null) : pick(p.kind))}>
            {p.name}
          </button>
        ))}
      </div>
      {kind ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={{ minHeight: 46, background: "var(--card2)" }}>
            <span className="text-[14px] font-semibold">Name</span>
            <input className="min-w-0 flex-1 bg-transparent text-right text-[14px]" style={{ border: 0, color: "var(--ink)" }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col rounded-2xl px-3 py-2" style={{ background: "var(--card2)" }}>
              <span className="text-[11px] font-semibold muted">From</span>
              <input type="date" className="num bg-transparent text-[14px]" style={{ border: 0, color: "var(--ink)" }} value={start} min={data.date} onChange={(e) => setStart(e.target.value)} aria-label="Start date" />
            </label>
            <label className="flex flex-col rounded-2xl px-3 py-2" style={{ background: "var(--card2)" }}>
              <span className="text-[11px] font-semibold muted">To</span>
              <input type="date" className="num bg-transparent text-[14px]" style={{ border: 0, color: "var(--ink)" }} value={end} min={start || data.date} onChange={(e) => setEnd(e.target.value)} aria-label="End date" />
            </label>
          </div>
          <p className="text-[12.5px] leading-[17px] muted">{FESTIVAL_PRESETS.find((p) => p.kind === kind)?.tip}</p>
          <ErrorNote text={err} />
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setKind(null)}>Cancel</GhostButton>
            <AccentButton onClick={() => void save()} disabled={busy || !start || !end}>
              {busy ? "Saving…" : "Turn on"}
            </AccentButton>
          </div>
        </div>
      ) : null}
    </PCard>
  );
}

function CycleCard() {
  const { data, set } = useCoachJson<ModesState>("modes");
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ start: string; len: number; per: number } | null>(null);
  if (!data) return null;
  if (!data.cycle.available) return null;
  const s = data.cycle.settings;
  const today = data.cycle.today;
  async function save(body: Record<string, unknown>) {
    setErr(null);
    try {
      set(await api<ModesState>("modes", { method: "POST", body: { type: "cycle", ...body } }));
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  const editing = draft;
  return (
    <PCard label="Cycle">
      <CardHead icon="lock" title="Cycle-aware guidance" sub="Optional and private: only you and your own coach see it. It adjusts hunger expectations, water and training advice, never your targets." />
      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={{ minHeight: 46, background: "var(--card2)" }}>
            <span className="text-[14px] font-semibold">Last period started</span>
            <input type="date" className="num bg-transparent text-right text-[14px]" style={{ border: 0, color: "var(--ink)" }} max={data.date} value={editing.start} onChange={(e) => setDraft({ ...editing, start: e.target.value })} aria-label="Last period start" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between rounded-2xl px-3.5" style={{ minHeight: 46, background: "var(--card2)" }}>
              <span className="text-[13px] font-semibold">Cycle (days)</span>
              <input className="num w-12 bg-transparent text-right text-[14px]" style={{ border: 0, color: "var(--ink)" }} inputMode="numeric" value={editing.len} onChange={(e) => setDraft({ ...editing, len: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 0 })} aria-label="Cycle length in days" />
            </label>
            <label className="flex items-center justify-between rounded-2xl px-3.5" style={{ minHeight: 46, background: "var(--card2)" }}>
              <span className="text-[13px] font-semibold">Period (days)</span>
              <input className="num w-12 bg-transparent text-right text-[14px]" style={{ border: 0, color: "var(--ink)" }} inputMode="numeric" value={editing.per} onChange={(e) => setDraft({ ...editing, per: Number(e.target.value.replace(/\D/g, "").slice(0, 1)) || 0 })} aria-label="Period length in days" />
            </label>
          </div>
          <ErrorNote text={err} />
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
            <AccentButton onClick={() => void save({ enabled: true, last_period_start: editing.start, cycle_length: editing.len, period_length: editing.per })} disabled={!editing.start}>
              Save
            </AccentButton>
          </div>
        </div>
      ) : s.enabled ? (
        <div className="flex flex-col gap-2">
          {today ? (
            <div className="rounded-2xl px-3.5 py-3" style={{ background: "var(--purple-bg)" }}>
              <p className="text-[14px] font-semibold">
                Day {today.day} · {today.label} <span className="text-[12px] font-medium muted">· next period in ~{today.nextPeriodIn} days</span>
              </p>
              <p className="mt-1 text-[12.5px] leading-[17px]">{today.hunger}</p>
              <p className="mt-1 text-[12.5px] leading-[17px]">{today.training}</p>
              <p className="mt-1 text-[12.5px] leading-[17px] muted">{today.scale}</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setDraft({ start: data.date, len: s.cycle_length, per: s.period_length })}>Period started</GhostButton>
            <GhostButton onClick={() => void save({ enabled: false })}>Turn off</GhostButton>
          </div>
          <ErrorNote text={err} />
        </div>
      ) : (
        <GhostButton onClick={() => setDraft({ start: data.date, len: 28, per: 5 })}>Turn on</GhostButton>
      )}
    </PCard>
  );
}
