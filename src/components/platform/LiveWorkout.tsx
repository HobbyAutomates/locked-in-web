"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveWorkout } from "@/lib/actions";
import { exerciseDef, exercisesText, lastSets, musclesOf } from "@/lib/exercises";
import { MUSCLES } from "@/lib/muscles";
import { isNewPr } from "@/lib/e1rm";
import { DEFAULT_REST_S, type RoutineDay } from "@/lib/training";
import { localNotify } from "@/lib/pushClient";
import type { Workout, WorkoutExercise } from "@/lib/types";
import SubPage from "../SubPage";
import { MRise, STAGGER, md } from "../motion";
import { LineIcon } from "../lineIcons";
import { ErrorNote } from "../ui";
import { ProChip } from "./kit";

type LiveSet = { kg: string; reps: string; done: boolean };
type LiveEx = { name: string; rest_s: number; bw: boolean; sets: LiveSet[] };
type Saved = { v: 1; startedAt: number; list: LiveEx[] };

function initial(day: RoutineDay, history: Workout[]): LiveEx[] {
  return day.exercises.map((x) => {
    const last = lastSets(history, x.name) ?? [];
    return {
      name: x.name,
      rest_s: x.rest_s || DEFAULT_REST_S,
      bw: !!exerciseDef(x.name)?.bw,
      sets: Array.from({ length: x.sets }, (_, i) => ({ kg: last[i]?.kg != null ? String(last[i].kg) : last[0]?.kg != null ? String(last[0].kg) : "", reps: String(x.reps), done: false })),
    };
  });
}

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, "0")}`;

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.28].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.24);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // No audio: vibration and the notification still fire.
  }
}

/**
 * v2.13 live workout mode (spec §12): a set-by-set checklist pre-filled from the routine (weights
 * from last time), a rest timer after each ticked set (per-exercise rest, default 90 s) that
 * vibrates and beeps at 0 and notifies if the page is in the background, PR badges, and Finish,
 * which saves an ordinary gym / bodyweight workout. Progress survives a reload (this device).
 */
export default function LiveWorkout({ routineId, routineName, dayIndex, day, history, today }: { routineId: string; routineName: string; dayIndex: number; day: RoutineDay; history: Workout[]; today: string }) {
  const router = useRouter();
  const key = `lockedin-live-${routineId}-${dayIndex}-${today}`;
  const [list, setList] = useState<LiveEx[]>(() => initial(day, history));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [rest, setRest] = useState<{ end: number; total: number; next: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef<number | null>(null);

  // Restore an unfinished session from this device, else start the clock now.
  useEffect(() => {
    let restored: Saved | null = null;
    try {
      restored = JSON.parse(window.localStorage.getItem(key) ?? "null") as Saved | null;
    } catch {
      restored = null;
    }
    const t = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after mount
    setStartedAt(restored?.v === 1 ? restored.startedAt : t);
    if (restored?.v === 1 && Array.isArray(restored.list) && restored.list.length) setList(restored.list);
    setNow(t);
  }, [key]);

  useEffect(() => {
    if (startedAt == null) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({ v: 1, startedAt, list } satisfies Saved));
    } catch {
      // Storage full / private mode: the session just won't survive a reload.
    }
  }, [key, startedAt, list]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const restLeft = rest && now != null ? Math.ceil((rest.end - now) / 1000) : null;

  const finishRest = useCallback((r: { end: number; next: string }) => {
    if (fired.current === r.end) return;
    fired.current = r.end;
    try {
      navigator.vibrate?.([220, 120, 220]);
    } catch {
      // Not supported (iPhone): the beep and the banner still show.
    }
    beep();
    if (document.visibilityState === "hidden") void localNotify("Rest's over", r.next ? `Next: ${r.next}` : "Next set", "rest-timer");
  }, []);

  useEffect(() => {
    if (rest && restLeft != null && restLeft <= 0) finishRest(rest);
  }, [rest, restLeft, finishRest]);

  function tick(i: number, j: number) {
    const next = list.map((x, a) => (a === i ? { ...x, sets: x.sets.map((s, b) => (b === j ? { ...s, done: !s.done } : s)) } : x));
    setList(next);
    if (!next[i].sets[j].done) return;
    const after = next[i].sets.findIndex((s) => !s.done);
    const nextEx = after >= 0 ? next[i].name : (next.slice(i + 1).find((x) => x.sets.some((s) => !s.done))?.name ?? "");
    const total = next[i].rest_s || DEFAULT_REST_S;
    setRest(nextEx ? { end: Date.now() + total * 1000, total, next: nextEx } : null);
  }

  const setVal = (i: number, j: number, patch: Partial<LiveSet>) => setList((ls) => ls.map((x, a) => (a === i ? { ...x, sets: x.sets.map((s, b) => (b === j ? { ...s, ...patch } : s)) } : x)));
  const addSet = (i: number) => setList((ls) => ls.map((x, a) => (a === i ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { kg: "", reps: "10" }), done: false }] } : x)));

  const done = list.reduce((a, x) => a + x.sets.filter((s) => s.done).length, 0);
  const total = list.reduce((a, x) => a + x.sets.length, 0);
  const elapsed = startedAt != null && now != null ? (now - startedAt) / 1000 : 0;

  async function finish() {
    const exercises: WorkoutExercise[] = list
      .map((x) => ({ name: x.name, sets: x.sets.filter((s) => s.done && Number(s.reps) > 0).map((s) => ({ kg: s.kg.trim() === "" ? null : Number(s.kg), reps: Math.round(Number(s.reps)) })) }))
      .filter((x) => x.sets.length);
    if (!exercises.length) {
      setError("Tick at least one set first.");
      return;
    }
    setBusy(true);
    setError(null);
    const allBw = exercises.every((x) => exerciseDef(x.name)?.bw && x.sets.every((s) => !s.kg));
    const res = await saveWorkout({
      date: today,
      muscles: musclesOf(exercises, MUSCLES).filter((m) => m !== "Other"),
      band_level: "Medium",
      resistance_kg: null,
      minutes: Math.max(1, Math.round(elapsed / 60)),
      exercises: exercisesText(exercises),
      notes: `${routineName} · ${day.name}`,
      kind: allBw ? "bodyweight" : "gym",
      exercises_json: exercises,
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    router.replace("/?celebrate=1");
  }

  return (
    <SubPage title={day.name} back="/train">
      <MRise delay={0}>
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center gap-2 text-[13px] font-semibold muted">
            {routineName} <ProChip />
          </span>
          <span className="num text-[13px] font-semibold" aria-live="off">
            {mmss(elapsed)} · {done}/{total} sets
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--track)" }} role="progressbar" aria-label="Sets done" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: "var(--accent)", transition: "width .4s cubic-bezier(.16,1,.3,1)" }} />
        </div>
      </MRise>

      {list.map((x, i) => {
        const doneSets = x.sets.filter((s) => s.done).map((s) => ({ kg: s.kg.trim() === "" ? null : Number(s.kg), reps: Number(s.reps) || 0 }));
        const pr = doneSets.length > 0 && isNewPr(history, x.name, doneSets);
        return (
          <MRise key={`${x.name}-${i}`} delay={STAGGER * (i + 1)}>
            <section aria-label={x.name} className="flex flex-col gap-2.5 rounded-[22px] p-4" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-[17px] font-semibold">
                  <span className="truncate">{x.name}</span>
                  {pr ? (
                    <span className="m-pop shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={md(0, { background: "var(--orange)", color: "#fff" })}>
                      PR
                    </span>
                  ) : null}
                </p>
                <span className="shrink-0 text-[12px] muted">rest {x.rest_s}s</span>
              </div>
              <div className="grid grid-cols-[28px_1fr_1fr_48px] items-center gap-2 text-[11px] font-semibold muted">
                <span>Set</span>
                <span>{x.bw ? "Extra kg" : "kg"}</span>
                <span>Reps</span>
                <span className="text-center">Done</span>
              </div>
              {x.sets.map((s, j) => (
                <div key={j} className="grid grid-cols-[28px_1fr_1fr_48px] items-center gap-2" style={{ opacity: s.done ? 0.7 : 1 }}>
                  <span className="num text-[14px] font-bold">{j + 1}</span>
                  <input inputMode="decimal" value={s.kg} placeholder={x.bw ? "BW" : "kg"} aria-label={`Set ${j + 1} weight`} className="num h-11 w-full rounded-xl px-3 text-[16px] outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onChange={(e) => setVal(i, j, { kg: e.target.value.replace(/[^\d.]/g, "") })} />
                  <input inputMode="numeric" value={s.reps} aria-label={`Set ${j + 1} reps`} className="num h-11 w-full rounded-xl px-3 text-[16px] outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onChange={(e) => setVal(i, j, { reps: e.target.value.replace(/\D/g, "") })} />
                  <button type="button" role="checkbox" aria-checked={s.done} aria-label={`Set ${j + 1} done`} className="press grid h-11 w-12 place-items-center rounded-xl" style={{ border: 0, background: s.done ? "var(--green)" : "var(--card2)", color: s.done ? "#fff" : "var(--muted)" }} onClick={() => tick(i, j)}>
                    <LineIcon name="check" size={18} stroke={2.4} />
                  </button>
                </div>
              ))}
              <button type="button" className="press self-start text-[13px] font-semibold" style={{ background: "none", border: 0, color: "var(--accent)", padding: "6px 0" }} onClick={() => addSet(i)}>
                + Add a set
              </button>
            </section>
          </MRise>
        );
      })}

      <ErrorNote text={error} />
      <button type="button" disabled={busy} className="press h-[54px] w-full rounded-2xl text-[16px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, marginBottom: rest ? 96 : 0 }} onClick={() => void finish()}>
        {busy ? "Saving…" : "Finish workout"}
      </button>

      {rest && restLeft != null ? (
        <div role="timer" aria-live="polite" className="fixed inset-x-0 z-40 mx-auto flex w-[calc(100%-32px)] max-w-[448px] items-center gap-3 rounded-[22px] px-4 py-3" style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", background: restLeft <= 0 ? "var(--green)" : "var(--ink)", color: "var(--bg)", boxShadow: "var(--shadow-lg)" }}>
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="4" />
            <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={Math.max(0, Math.min(1, 1 - restLeft / rest.total))} transform="rotate(-90 22 22)" />
          </svg>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="num text-[22px] font-bold leading-tight">{restLeft <= 0 ? "Go" : mmss(restLeft)}</span>
            <span className="truncate text-[12px]" style={{ opacity: 0.75 }}>
              {restLeft <= 0 ? "Rest's over" : "Rest"} · next: {rest.next}
            </span>
          </span>
          <button type="button" className="press h-10 rounded-full px-3 text-[13px] font-bold" style={{ background: "rgba(127,127,127,0.25)", color: "inherit", border: 0 }} onClick={() => setRest({ ...rest, end: rest.end + 15000, total: rest.total + 15 })}>
            +15s
          </button>
          <button type="button" className="press h-10 rounded-full px-3 text-[13px] font-bold" style={{ background: "rgba(127,127,127,0.25)", color: "inherit", border: 0 }} onClick={() => setRest(null)}>
            {restLeft <= 0 ? "Close" : "Skip"}
          </button>
        </div>
      ) : null}
    </SubPage>
  );
}
