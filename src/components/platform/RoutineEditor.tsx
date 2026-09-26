"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRoutine } from "@/lib/platformActions";
import { searchExercises } from "@/lib/exercises";
import { DEFAULT_REST_S, WEEKDAYS, dayRegions, makeExercise, type Routine, type RoutineDay } from "@/lib/training";
import SubPage from "../SubPage";
import { MRise, STAGGER } from "../motion";
import { LineIcon } from "../lineIcons";
import { Trash } from "../icons";
import { BottomSheet, ErrorNote, Toggle } from "../ui";
import MuscleMap, { MapLegend } from "./MuscleMap";
import { CardLabel, ComingSoon, PCard, ProLocked } from "./kit";
import { invalidateHomeEntries } from "./HomeEntries";

/** v2.13 build / edit a routine: days → exercises from the library with sets, reps and rest. */
export default function RoutineEditor({ routine, available, pro }: { routine: Routine | null; available: boolean; pro: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(routine?.name ?? "My routine");
  const [days, setDays] = useState<RoutineDay[]>(routine?.days.length ? routine.days : [{ weekday: 1, name: "Day 1", exercises: [] }]);
  const [sel, setSel] = useState(0);
  const [activate, setActivate] = useState(routine ? routine.active : true);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = days[Math.min(sel, days.length - 1)];

  const update = (i: number, patch: Partial<RoutineDay>) => setDays((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const setEx = (j: number, patch: Partial<RoutineDay["exercises"][number]>) => update(sel, { exercises: day.exercises.map((x, k) => (k === j ? { ...x, ...patch } : x)) });

  function addDay() {
    if (days.length >= 7) return;
    const used = new Set(days.map((d) => d.weekday));
    const free = [1, 2, 3, 4, 5, 6, 7].find((w) => !used.has(w)) ?? null;
    setDays((ds) => [...ds, { weekday: free, name: `Day ${ds.length + 1}`, exercises: [] }]);
    setSel(days.length);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveRoutine({ id: routine?.id, name, days, activate });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      invalidateHomeEntries();
      router.push("/train");
    }
  }

  if (!pro)
    return (
      <SubPage title="Routine" back="/train">
        <ProLocked feature="Routines" />
      </SubPage>
    );
  if (!available)
    return (
      <SubPage title="Routine" back="/train">
        <ComingSoon what="Routines" />
      </SubPage>
    );

  const regions = dayRegions(day);
  const results = searchExercises(q, "gym", 12);

  return (
    <SubPage title={routine ? "Edit routine" : "New routine"} back="/train">
      <MRise delay={0}>
        <PCard label="Routine name">
          <CardLabel pro>Name</CardLabel>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Routine name" className="rounded-2xl px-3.5 py-3 text-[17px] font-semibold outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
          <label className="flex items-center justify-between gap-3 text-[14px]">
            Make this my active routine
            <Toggle on={activate} onChange={setActivate} label="Active routine" />
          </label>
        </PCard>
      </MRise>

      <MRise delay={STAGGER}>
        <div className="-mx-4 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max gap-1.5" role="tablist" aria-label="Days">
            {days.map((d, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === sel} className="chip press" style={{ height: 38 }} onClick={() => setSel(i)}>
                {d.weekday ? `${WEEKDAYS[d.weekday - 1]} · ` : ""}
                {d.name}
              </button>
            ))}
            {days.length < 7 ? (
              <button type="button" className="chip press gap-1" style={{ height: 38 }} onClick={addDay}>
                <LineIcon name="plus" size={14} /> Day
              </button>
            ) : null}
          </div>
        </div>
      </MRise>

      <MRise delay={STAGGER * 2}>
        <PCard label="Day">
          <div className="flex items-center gap-2">
            <input value={day.name} maxLength={40} onChange={(e) => update(sel, { name: e.target.value })} aria-label="Day name" className="min-w-0 flex-1 rounded-2xl px-3.5 py-2.5 text-[16px] font-semibold outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
            {days.length > 1 ? (
              <button
                type="button"
                aria-label="Remove this day"
                className="press grid h-11 w-11 place-items-center rounded-full"
                style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
                onClick={() => {
                  setDays((ds) => ds.filter((_, k) => k !== sel));
                  setSel(Math.max(0, sel - 1));
                }}
              >
                <Trash size={16} />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Weekday">
            {[null, 1, 2, 3, 4, 5, 6, 7].map((w) => {
              const taken = w != null && days.some((d, k) => k !== sel && d.weekday === w);
              const on = day.weekday === w;
              return (
                <button key={String(w)} type="button" role="radio" aria-checked={on} disabled={taken} className="press h-9 rounded-xl text-[11px] font-bold" style={{ border: 0, background: on ? "var(--accent)" : "var(--card2)", color: on ? "var(--accent-ink)" : taken ? "var(--hair)" : "var(--ink)" }} onClick={() => update(sel, { weekday: w })}>
                  {w == null ? "Any" : WEEKDAYS[w - 1]}
                </button>
              );
            })}
          </div>

          {day.exercises.length === 0 ? <p className="text-[13px] muted">No exercises yet.</p> : null}
          {day.exercises.map((x, j) => (
            <div key={`${x.name}-${j}`} className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: "var(--card2)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">{x.name}</span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" aria-label="Move up" disabled={j === 0} className="press grid h-8 w-8 place-items-center rounded-full" style={{ background: "var(--pcard)", border: 0, color: "var(--ink)", transform: "rotate(-90deg)" }} onClick={() => update(sel, { exercises: day.exercises.map((e, k, a) => (k === j - 1 ? a[j] : k === j ? a[j - 1] : e)) })}>
                    <LineIcon name="chev" size={14} />
                  </button>
                  <button type="button" aria-label={`Remove ${x.name}`} className="press grid h-8 w-8 place-items-center rounded-full" style={{ background: "var(--pcard)", border: 0, color: "var(--ink)" }} onClick={() => update(sel, { exercises: day.exercises.filter((_, k) => k !== j) })}>
                    <Trash size={14} />
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumBox label="Sets" value={x.sets} min={1} max={10} onChange={(v) => setEx(j, { sets: v })} />
                <NumBox label="Reps" value={x.reps} min={1} max={100} onChange={(v) => setEx(j, { reps: v })} />
                <NumBox label="Rest s" value={x.rest_s} min={15} max={600} step={15} onChange={(v) => setEx(j, { rest_s: v })} />
              </div>
            </div>
          ))}
          <button type="button" className="press flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold" style={{ background: "transparent", color: "var(--accent)", border: "1.5px solid var(--accent)" }} onClick={() => setPicker(true)} disabled={day.exercises.length >= 20}>
            <LineIcon name="plus" size={16} /> Add exercise
          </button>
        </PCard>
      </MRise>

      {day.exercises.length ? (
        <MRise delay={STAGGER * 3}>
          <PCard label="Muscles this day">
            <CardLabel pro>Muscles this day</CardLabel>
            <MuscleMap mode={{ kind: "split", ...regions }} />
            <MapLegend mode="split" />
          </PCard>
        </MRise>
      ) : null}

      <ErrorNote text={error} />
      <button type="button" disabled={busy} className="press h-[54px] w-full rounded-2xl text-[16px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }} onClick={() => void save()}>
        {busy ? "Saving…" : "Save routine"}
      </button>

      <BottomSheet open={picker} title="Add exercise" onClose={() => setPicker(false)}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search exercises" className="mb-2 w-full rounded-2xl px-3.5 py-3 text-[15px] outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
        <div className="flex flex-col">
          {results.map((e) => (
            <button
              key={e.name}
              type="button"
              className="press flex min-h-12 items-center justify-between gap-2 text-left text-[15px]"
              style={{ background: "none", border: 0, borderBottom: "1px solid var(--hair)", color: "var(--ink)" }}
              onClick={() => {
                update(sel, { exercises: [...day.exercises, makeExercise(e.name, 3, e.bw ? 12 : 10, DEFAULT_REST_S)] });
                setPicker(false);
                setQ("");
              }}
            >
              {e.name}
              <span className="text-[12px] muted">{e.muscles.slice(0, 2).join(", ")}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </SubPage>
  );
}

function NumBox({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl py-1.5" style={{ background: "var(--pcard)" }}>
      <span className="text-[11px] font-semibold muted">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Fewer ${label}`} className="press grid h-8 w-8 place-items-center rounded-full text-[18px]" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => onChange(clamp(value - step))}>
          −
        </button>
        <span className="num w-9 text-center text-[16px] font-bold">{value}</span>
        <button type="button" aria-label={`More ${label}`} className="press grid h-8 w-8 place-items-center rounded-full text-[18px]" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => onChange(clamp(value + step))}>
          +
        </button>
      </div>
    </div>
  );
}
