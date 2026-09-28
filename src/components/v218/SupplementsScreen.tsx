"use client";

import { useState } from "react";
import SubPage from "@/components/SubPage";
import { PRESETS, doseText, type SupplementKind } from "@/lib/v218/supplements";
import { COMING_SOON } from "@/lib/v36";
import { LineIcon } from "../lineIcons";
import { ErrorNote } from "../ui";
import { AccentButton, CardHead, GhostButton, PCard, Pill } from "../nutrition/kit";
import { api, useCoachJson } from "./api";
import type { SupplementRow, SupplementsState } from "./types";

/**
 * v2.18 B7 supplement tracker: creatine, whey, vitamin D, iron… or your own. Tick today's dose,
 * keep the streak, and get a reminder at your time (web: the inbox / push; Android: a local alarm).
 * The app never suggests a dose: you enter what's on your label or what your doctor said.
 */
export default function SupplementsScreen() {
  const { data, set } = useCoachJson<SupplementsState>("supplements");
  const [adding, setAdding] = useState<SupplementKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call(id: string, fn: () => Promise<SupplementsState>) {
    setBusy(id);
    setErr(null);
    try {
      set(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SubPage title="Supplements" back="/coach/hub">
      <div className="flex flex-col gap-3.5">
        {data === null ? <p className="py-10 text-center text-sm muted">Loading…</p> : null}
        {data === false || (data && !data.available) ? (
          <PCard>
            <CardHead icon="info" title={COMING_SOON} sub="The supplement tracker needs a quick server update. Everything else works as usual." />
          </PCard>
        ) : null}
        {data && data.available ? (
          <>
            {data.items.length ? (
              <PCard label="Today">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] font-semibold">Today</p>
                  {data.allStreak > 0 ? <Pill tone="accent">{data.allStreak}-day streak</Pill> : null}
                </div>
                <div className="flex flex-col">
                  {data.items.map((s, i) => (
                    <Row key={s.id} s={s} first={i === 0} busy={busy === s.id} onTick={() => void call(s.id, () => api("supplements", { method: "PATCH", body: { id: s.id, taken: !s.takenToday } }))} onPause={() => void call(s.id, () => api("supplements", { method: "PATCH", body: { ...s, active: !s.active } }))} onDelete={() => void call(s.id, () => api(`supplements?id=${s.id}`, { method: "DELETE" }))} />
                  ))}
                </div>
              </PCard>
            ) : (
              <PCard>
                <CardHead icon="drop" title="Track your supplements" sub="Tick them off each day, get a reminder, and keep the streak going." />
              </PCard>
            )}
            <ErrorNote text={err} />
            <PCard label="Add">
              <p className="text-[13px] font-semibold muted">Add one</p>
              <div className="flex flex-wrap gap-1.5">
                {[...PRESETS.map((p) => ({ kind: p.kind, name: p.name })), { kind: "custom" as const, name: "Custom" }].map((p) => (
                  <button key={p.kind} type="button" className="chip press" style={{ height: 36 }} aria-pressed={adding === p.kind} onClick={() => setAdding(adding === p.kind ? null : p.kind)}>
                    {p.name}
                  </button>
                ))}
              </div>
              {adding ? (
                <AddForm
                  kind={adding}
                  onCancel={() => setAdding(null)}
                  onSave={async (body) => {
                    setErr(null);
                    try {
                      set(await api<SupplementsState>("supplements", { method: "POST", body }));
                      setAdding(null);
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Couldn't add it");
                    }
                  }}
                />
              ) : null}
            </PCard>
            <p className="px-1 text-[11px] leading-4 muted">Locked In doesn&apos;t recommend doses. Use what&apos;s on your label or what your doctor advised, and check with a doctor before starting iron or high-dose vitamins.</p>
          </>
        ) : null}
      </div>
    </SubPage>
  );
}

function Row({ s, first, busy, onTick, onPause, onDelete }: { s: SupplementRow; first: boolean; busy: boolean; onTick: () => void; onPause: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex flex-col gap-2 py-3" style={{ borderTop: first ? 0 : "1px solid var(--hair)", opacity: s.active ? 1 : 0.55 }}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={s.takenToday}
          aria-label={`${s.takenToday ? "Untick" : "Tick"} ${s.name} for today`}
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full"
          style={{ border: s.takenToday ? 0 : "1.5px solid var(--line)", background: s.takenToday ? "var(--green)" : "transparent", color: "#fff" }}
          disabled={busy || !s.active}
          onClick={onTick}
        >
          {s.takenToday ? <LineIcon name="check" size={20} /> : null}
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{s.name}</span>
          <span className="block text-[12px] muted">
            {[doseText(s), s.remind_at ? `reminder ${s.remind_at}` : null, !s.active ? "paused" : null].filter(Boolean).join(" · ") || "no dose set"}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <b className="num text-[15px]" style={{ color: s.current ? "var(--ember)" : "var(--muted)" }}>
            {s.current}
          </b>
          <span className="text-[10px] muted">best {s.best}</span>
        </span>
        <button type="button" aria-label={`More for ${s.name}`} className="press grid h-9 w-9 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => setMenu((m) => !m)}>
          <LineIcon name="sliders" size={16} />
        </button>
      </div>
      {menu ? (
        <div className="flex gap-2 pl-14">
          <GhostButton onClick={onPause}>{s.active ? "Pause" : "Resume"}</GhostButton>
          <GhostButton onClick={onDelete}>Remove</GhostButton>
        </div>
      ) : null}
    </div>
  );
}

function AddForm({ kind, onSave, onCancel }: { kind: SupplementKind; onSave: (b: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const preset = PRESETS.find((p) => p.kind === kind);
  const [name, setName] = useState(preset?.name ?? "");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState(preset?.unit ?? "serving");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const field = { minHeight: 48, background: "var(--card2)" } as const;
  return (
    <div className="flex flex-col gap-2">
      {preset ? <p className="text-[12.5px] leading-[17px] muted">{preset.hint}</p> : null}
      <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={field}>
        <span className="text-[14px] font-semibold">Name</span>
        <input className="min-w-0 flex-1 bg-transparent text-right text-[15px]" style={{ border: 0, color: "var(--ink)" }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Supplement name" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded-2xl px-3.5" style={field}>
          <span className="text-[14px] font-semibold">Dose</span>
          <input className="num w-16 bg-transparent text-right text-[15px]" style={{ border: 0, color: "var(--ink)" }} inputMode="decimal" placeholder="—" value={dose} onChange={(e) => setDose(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} aria-label="Dose" />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-2xl px-3.5" style={field}>
          <span className="text-[14px] font-semibold">Unit</span>
          <input className="w-20 bg-transparent text-right text-[15px]" style={{ border: 0, color: "var(--ink)" }} value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
        </label>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={field}>
        <span className="text-[14px] font-semibold">Daily reminder</span>
        <input type="time" className="num bg-transparent text-right text-[14px]" style={{ border: 0, color: "var(--ink)", minHeight: 44 }} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Reminder time" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <AccentButton
          disabled={busy || name.trim().length < 2}
          onClick={() => {
            setBusy(true);
            void onSave({ kind, name, dose: dose || null, unit, remind_at: time || null }).finally(() => setBusy(false));
          }}
        >
          {busy ? "Adding…" : "Add"}
        </AccentButton>
      </div>
    </div>
  );
}
