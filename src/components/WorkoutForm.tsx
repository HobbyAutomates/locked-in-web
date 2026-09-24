"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteWorkout, saveWorkout } from "@/lib/actions";
import { POPULAR, exerciseDef, exercisesText, lastSets, musclesOf, searchExercises } from "@/lib/exercises";
import { BAND_LEVELS, MUSCLES } from "@/lib/muscles";
import type { Workout, WorkoutExercise, WorkoutKind } from "@/lib/types";
import ExerciseForm, { type ExercisePick } from "./ExerciseForm";
import { Band, Bat, Close, Dumbbell, Plus, Pushup, Refresh, Run, Search, Yoga } from "./icons";
import { Card, Chip, ErrorNote, Hair, NumberField, PillButton, PillSwitch, Rise, SettingRow, fmt } from "./ui";

/** v2.5: general-first. Gym and Bodyweight lead; Bands is one type among six. */
const KINDS: { key: WorkoutKind; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { key: "gym", label: "Gym", Icon: Dumbbell },
  { key: "bodyweight", label: "Body\u00ADweight", Icon: Pushup },
  { key: "bands", label: "Bands", Icon: Band },
  { key: "cardio", label: "Cardio", Icon: Run },
  { key: "sport", label: "Sport", Icon: Bat },
  { key: "yoga", label: "Yoga / Stretch", Icon: Yoga },
];

/** Cardio / Sport / Yoga open the Exercise form with only their own quick picks (Compendium codes). */
const QUICK: Record<"cardio" | "sport" | "yoga", ExercisePick[]> = {
  cardio: [
    { id: "run", label: "Run", name: "Running", code: "12150", met: 8.3 },
    { id: "walk", label: "Walk", name: "Walking", code: "LI-17190", met: 3.5 },
    { id: "cycle", label: "Cycle", name: "Cycling", code: "01015", met: 7.5 },
    { id: "treadmill", label: "Treadmill", name: "Running · on treadmill", code: "12180", met: 8 },
    { id: "elliptical", label: "Elliptical", name: "Elliptical trainer", code: "02090", met: 5 },
    { id: "rowing", label: "Rowing", name: "Rowing machine", code: "02080", met: 7 },
    { id: "skipping", label: "Skipping", name: "Jump rope", code: "LI-15551", met: 11 },
    { id: "stairs", label: "Stairs", name: "Stair climbing", code: "LI-17133", met: 8.8 },
  ],
  sport: [
    { id: "cricket", label: "Cricket", name: "Cricket", code: "LI-15150", met: 4.8 },
    { id: "badminton", label: "Badminton", name: "Badminton", code: "LI-15030", met: 5.5 },
    { id: "football", label: "Football", name: "Football", code: "15610", met: 7 },
    { id: "basketball", label: "Basketball", name: "Basketball", code: "15055", met: 6 },
    { id: "tennis", label: "Tennis", name: "Tennis", code: "15675", met: 7.3 },
    { id: "table-tennis", label: "Table tennis", name: "Table tennis", code: "15660", met: 4 },
    { id: "volleyball", label: "Volleyball", name: "Volleyball", code: "15710", met: 4 },
    { id: "squash", label: "Squash", name: "Squash", code: "15652", met: 7.3 },
  ],
  yoga: [
    { id: "yoga", label: "Yoga", name: "Yoga", code: "LI-02101", met: 2.5 },
    { id: "stretching", label: "Stretching", name: "Stretching", code: "02170", met: 2.3 },
    { id: "pilates", label: "Pilates", name: "Pilates", code: "02165", met: 3 },
  ],
};

type Payload = Parameters<typeof saveWorkout>[0];

export default function WorkoutForm({
  existing,
  last = null,
  initialDate,
  target,
  onClose,
  weightKg = null,
  recent = [],
  history = [],
}: {
  existing: Workout | null;
  /** The most recent workout: "Same as last time" copies it into a new one. */
  last?: Workout | null;
  initialDate: string;
  target: number;
  onClose: () => void;
  weightKg?: number | null;
  /** Recent exercise-log activities, for Cardio / Sport / Yoga. */
  recent?: ExercisePick[];
  /** Recent gym / bodyweight sessions: the set grid's "last time" ghost values. */
  history?: Workout[];
}) {
  const router = useRouter();
  const lastKind = last?.kind === "gym" || last?.kind === "bodyweight" ? last.kind : null;
  const [kind, setKind] = useState<WorkoutKind>((existing?.kind as WorkoutKind | null) ?? lastKind ?? "gym");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
  }, []);

  async function persist(payload: Payload) {
    setBusy(true);
    setError(null);
    try {
      const res = await saveWorkout(payload);
      if (!res.ok) {
        console.error("[WorkoutForm] save failed:", res.error);
        setError(res.error);
        setBusy(false);
        return;
      }
      if (res.warning) {
        // Saved, but the auto-burn row didn't make it: say so here instead of leaving silently.
        console.error("[WorkoutForm] saved with a warning:", res.warning);
        setError(res.warning);
        setTimeout(() => router.push(existing ? "/" : "/?celebrate=1"), 2500);
        return;
      }
      // A new session earns the streak celebration on Home; edits just go back.
      router.push(existing ? "/" : "/?celebrate=1");
    } catch (e) {
      console.error("[WorkoutForm] save threw:", e);
      setError(e instanceof Error && e.message ? `Couldn't save the workout: ${e.message}` : "Couldn't save the workout — check your connection and try again.");
      setBusy(false);
    }
  }

  /** Undoable delete: the confirm button turns into "Deleted" with an Undo button for ~5s; only then does the
   * real delete happen and the editor close. */
  function remove() {
    if (!existing) return;
    setError(null);
    setPendingDelete(true);
    deleteTimer.current = setTimeout(() => void finalizeRemove(), 5000);
  }

  function undoRemove() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = null;
    setPendingDelete(false);
  }

  async function finalizeRemove() {
    if (!existing) return;
    setBusy(true);
    try {
      const res = await deleteWorkout(existing.id);
      if (!res.ok) {
        console.error("[WorkoutForm] delete failed:", res.error);
        setError(res.error);
        setBusy(false);
        setPendingDelete(false);
        return;
      }
      onClose();
    } catch (e) {
      console.error("[WorkoutForm] delete threw:", e);
      setError(e instanceof Error && e.message ? e.message : "Could not delete");
      setBusy(false);
      setPendingDelete(false);
    }
  }

  // An existing session can move between Gym / Bodyweight / Bands; the log-only types can't hold it.
  const kinds = existing ? KINDS.filter((k) => k.key === "gym" || k.key === "bodyweight" || k.key === "bands") : KINDS;
  const shared = { existing, initialDate, busy, error, target, persist, remove, pendingDelete, undoRemove };

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 pb-1 pt-1.5">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Workout type">
          {kinds.map(({ key, label, Icon }) => {
            const on = kind === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setKind(key);
                  setError(null);
                }}
                className="press flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5"
                style={{ minHeight: 64, background: on ? "var(--btn)" : "var(--card)", color: on ? "var(--btn-ink)" : "var(--ink)", boxShadow: on ? "none" : "var(--shadow-sm)", border: 0 }}
              >
                <Icon size={20} />
                <span className="w-full text-center text-[12px] font-semibold leading-tight" style={{ hyphens: "manual" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {kind === "cardio" || kind === "sport" || kind === "yoga" ? (
        <ExerciseForm
          key={kind}
          date={initialDate}
          weightKg={weightKg}
          onClose={onClose}
          quick={QUICK[kind]}
          recent={recent.filter((r) => QUICK[kind].some((q) => q.code === r.code || q.name.toLowerCase() === r.name.toLowerCase()))}
          placeholder={kind === "cardio" ? "Search cardio — run, cycle, swim…" : kind === "sport" ? "Search a sport — cricket, football…" : "Search yoga, stretching, pilates…"}
        />
      ) : kind === "bands" ? (
        <BandsForm {...shared} last={last?.kind == null || last.kind === "bands" ? last : null} />
      ) : (
        <LiftForm key={kind} {...shared} kind={kind} history={history} />
      )}
    </div>
  );
}

type Shared = {
  existing: Workout | null;
  initialDate: string;
  busy: boolean;
  error: string | null;
  target: number;
  persist: (p: Payload) => Promise<void>;
  remove: () => void;
  pendingDelete: boolean;
  undoRemove: () => void;
};

function Footer({ existing, busy, error, target, remove, pendingDelete, undoRemove, onSave, label = "Save workout" }: Shared & { onSave: () => void; label?: string }) {
  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <ErrorNote text={error} />
        <p className="text-xs muted">Target {target} sessions a week.</p>
        {existing ? (
          pendingDelete ? (
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[15px] font-semibold muted">Deleted</span>
              <button type="button" onClick={undoRemove} className="press text-[15px] font-bold" style={{ color: "var(--btn)", background: "none", border: 0 }}>
                Undo
              </button>
            </div>
          ) : (
            <button type="button" onClick={remove} disabled={busy} className="press py-2 text-[15px] font-semibold" style={{ color: "var(--red)", background: "none", border: 0 }}>
              Delete workout
            </button>
          )
        ) : null}
      </div>
      <div className="sticky bottom-0 mt-auto px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
        <PillButton onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : label}
        </PillButton>
      </div>
    </>
  );
}

function DateMinutes({ date, setDate, minutes, setMinutes, initialDate, children }: { date: string; setDate: (v: string) => void; minutes: string; setMinutes: (v: string) => void; initialDate: string; children?: React.ReactNode }) {
  return (
    <Card padding={0}>
      <div className="px-4">
        <SettingRow label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || initialDate)}
            aria-label="Workout date"
            className="rounded-[10px] px-2.5 py-1.5 text-[15px] font-semibold"
            style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
          />
        </SettingRow>
        {children}
        <Hair />
        <SettingRow label="Duration">
          <NumberField value={minutes} onChange={(v) => setMinutes(v.slice(0, 3))} unit="min" label="Duration in minutes" />
        </SettingRow>
      </div>
    </Card>
  );
}

// ---- Gym / Bodyweight: exercises with a weight × reps grid ----

type SetRow = { kg: string; reps: string };
type LiftRow = { key: number; name: string; sets: SetRow[] };

function toRows(list: WorkoutExercise[] | null | undefined): LiftRow[] {
  return (list ?? []).map((x, i) => ({ key: i + 1, name: x.name, sets: x.sets.length ? x.sets.map((s) => ({ kg: s.kg != null ? fmt(s.kg) : "", reps: String(s.reps) })) : blankSets(3) }));
}
function blankSets(n: number): SetRow[] {
  return Array.from({ length: n }, () => ({ kg: "", reps: "" }));
}

function LiftForm({ kind, history, ...shared }: Shared & { kind: "gym" | "bodyweight"; history: Workout[] }) {
  const { existing, initialDate } = shared;
  const [date, setDate] = useState(existing?.date ?? initialDate);
  const [minutes, setMinutes] = useState(existing?.minutes != null ? String(existing.minutes) : "45");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [rows, setRows] = useState<LiftRow[]>(() => toRows(existing?.exercises_json));
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const seq = useRef(1000);

  const added = new Set(rows.map((r) => r.name.toLowerCase()));
  const hits = query.trim() ? searchExercises(query, kind, 6) : [];
  const exact = hits.some((h) => h.name.toLowerCase() === query.trim().toLowerCase());
  const popular = POPULAR[kind].filter((n) => !added.has(n.toLowerCase())).slice(0, 6);

  function add(name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    const prev = lastSets(history, clean);
    const key = seq.current++;
    setRows((cur) => [...cur, { key, name: clean, sets: blankSets(Math.min(6, Math.max(1, prev?.length ?? 3))) }]);
    setQuery("");
    setLocalError(null);
  }
  function setField(key: number, i: number, field: keyof SetRow, v: string) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, sets: r.sets.map((s, j) => (j === i ? { ...s, [field]: v } : s)) } : r)));
  }
  function addSet(key: number) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, sets: [...r.sets, { ...(r.sets[r.sets.length - 1] ?? { kg: "", reps: "" }) }] } : r)));
  }
  function removeSet(key: number, i: number) {
    setRows((cur) => cur.map((r) => (r.key === key && r.sets.length > 1 ? { ...r, sets: r.sets.filter((_, j) => j !== i) } : r)));
  }
  function copyLast(key: number, prev: WorkoutExercise["sets"]) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, sets: prev.map((s) => ({ kg: s.kg != null ? fmt(s.kg) : "", reps: String(s.reps) })) } : r)));
  }

  function save() {
    const list: WorkoutExercise[] = rows.map((r) => ({
      name: r.name,
      sets: r.sets
        .map((s) => ({ kg: s.kg.trim() === "" ? null : Number(s.kg), reps: Math.round(Number(s.reps) || 0) }))
        .filter((s) => s.reps > 0 && (s.kg == null || Number.isFinite(s.kg))),
    }));
    if (!list.length) return setLocalError("Add at least one exercise");
    void shared.persist({
      id: existing?.id,
      date,
      muscles: musclesOf(list, MUSCLES),
      band_level: existing?.band_level ?? "Medium",
      resistance_kg: null,
      minutes: minutes ? Number(minutes) : null,
      exercises: exercisesText(list),
      notes: notes.trim(),
      kind,
      exercises_json: list,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-3 pt-2.5">
        <Rise index={0}>
          <div className="searchbar">
            <Search size={17} className="muted shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 60))}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) add(hits[0] && !exact ? hits[0].name : query);
              }}
              placeholder="Add exercise — bench, squat, push-up…"
              aria-label="Add exercise"
              enterKeyHint="done"
            />
            {query ? (
              <button type="button" aria-label="Clear" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full muted" onClick={() => setQuery("")}>
                <Close size={15} />
              </button>
            ) : null}
          </div>
        </Rise>

        {query.trim() ? (
          <Card padding={0}>
            <div className="px-4">
              {hits.map((h, i) => (
                <div key={h.name}>
                  {i > 0 ? <Hair /> : null}
                  <button type="button" className="press flex min-h-[48px] w-full items-center gap-3 py-2 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => add(h.name)}>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{h.name}</span>
                    <span className="shrink-0 truncate text-xs muted" style={{ maxWidth: "45%" }}>
                      {h.muscles.slice(0, 2).join(" · ")}
                    </span>
                  </button>
                </div>
              ))}
              {!exact ? (
                <>
                  {hits.length ? <Hair /> : null}
                  <button type="button" className="press flex min-h-[48px] w-full items-center gap-2 py-2 text-left text-[15px] font-semibold" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => add(query)}>
                    <Plus size={16} />
                    <span className="min-w-0 truncate">Add “{query.trim()}”</span>
                  </button>
                </>
              ) : null}
            </div>
          </Card>
        ) : rows.length === 0 || focused ? (
          <div className="flex flex-wrap gap-1.5">
            {popular.map((n) => (
              <button key={n} type="button" className="chip press" style={{ height: 34, fontSize: 13 }} onMouseDown={(e) => e.preventDefault()} onClick={() => add(n)}>
                <Plus size={13} />
                <span className="ml-1">{n}</span>
              </button>
            ))}
          </div>
        ) : null}

        {rows.map((r, idx) => {
          const prev = lastSets(history, r.name);
          const bw = kind === "bodyweight" || !!exerciseDef(r.name)?.bw;
          return (
            <Rise key={r.key} index={Math.min(idx, 3)}>
              <Card padding={14}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[16px] font-bold">{r.name}</p>
                  <button type="button" aria-label={`Remove ${r.name}`} className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full muted" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}>
                    <Close size={15} />
                  </button>
                </div>
                <div className="mt-2 grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: "28px minmax(0,1fr) minmax(0,1fr) 28px" }}>
                  <span className="text-center text-[11px] font-semibold muted">Set</span>
                  <span className="text-center text-[11px] font-semibold muted">{bw ? "+ kg" : "kg"}</span>
                  <span className="text-center text-[11px] font-semibold muted">Reps</span>
                  <span />
                  {r.sets.map((s, i) => {
                    const ghost = prev?.[i] ?? null;
                    return (
                      <SetLine
                        key={i}
                        n={i + 1}
                        set={s}
                        ghostKg={ghost?.kg != null ? fmt(ghost.kg) : bw ? "BW" : "kg"}
                        ghostReps={ghost ? String(ghost.reps) : "reps"}
                        onKg={(v) => setField(r.key, i, "kg", v)}
                        onReps={(v) => setField(r.key, i, "reps", v)}
                        onRemove={r.sets.length > 1 ? () => removeSet(r.key, i) : null}
                        name={r.name}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="press flex h-9 min-w-[88px] flex-1 items-center justify-center gap-1 rounded-xl text-[13px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => addSet(r.key)}>
                    <Plus size={14} /> set
                  </button>
                  {prev ? (
                    <button type="button" className="press flex h-9 min-w-[88px] flex-1 items-center justify-center gap-1 rounded-xl text-[13px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => copyLast(r.key, prev)}>
                      <Refresh size={13} /> <span className="whitespace-nowrap">Last time</span>
                    </button>
                  ) : null}
                </div>
              </Card>
            </Rise>
          );
        })}

        <DateMinutes date={date} setDate={setDate} minutes={minutes} setMinutes={setMinutes} initialDate={initialDate} />

        <Card>
          <label className="text-[13px] font-semibold muted" htmlFor="lift-notes">
            Notes
          </label>
          <textarea id="lift-notes" className="field mt-1.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Felt strong on bench — go up next time" />
        </Card>
      </div>
      <Footer {...shared} error={localError ?? shared.error} onSave={save} label={rows.length ? `Save · ${rows.length} exercise${rows.length === 1 ? "" : "s"}` : "Save workout"} />
    </>
  );
}

function SetLine({ n, set, ghostKg, ghostReps, onKg, onReps, onRemove, name }: { n: number; set: SetRow; ghostKg: string; ghostReps: string; onKg: (v: string) => void; onReps: (v: string) => void; onRemove: (() => void) | null; name: string }) {
  return (
    <>
      <span className="num text-center text-[14px] font-bold muted">{n}</span>
      <input className="numfield num" style={{ width: "100%", height: 40, textAlign: "center" }} inputMode="decimal" aria-label={`${name} set ${n} weight in kg`} placeholder={ghostKg} value={set.kg} onChange={(e) => onKg(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
      <input className="numfield num" style={{ width: "100%", height: 40, textAlign: "center" }} inputMode="numeric" aria-label={`${name} set ${n} reps`} placeholder={ghostReps} value={set.reps} onChange={(e) => onReps(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      {onRemove ? (
        <button type="button" aria-label={`Remove set ${n}`} className="press grid h-7 w-7 place-items-center rounded-full muted" style={{ background: "none", border: 0 }} onClick={onRemove}>
          <Close size={13} />
        </button>
      ) : (
        <span />
      )}
    </>
  );
}

// ---- Bands: the original form ----

function BandsForm({ last, ...shared }: Shared & { last: Workout | null }) {
  const { existing, initialDate } = shared;
  const [date, setDate] = useState(existing?.date ?? initialDate);
  const [muscles, setMuscles] = useState<string[]>(existing?.muscles ?? []);
  const [band, setBand] = useState<string>(existing?.band_level ?? "Medium");
  const [kg, setKg] = useState(existing?.resistance_kg != null ? fmt(Number(existing.resistance_kg)) : "9");
  const [minutes, setMinutes] = useState(existing?.minutes != null ? String(existing.minutes) : "30");
  const [exercises, setExercises] = useState(existing?.exercises ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /** Pre-fill everything but the date from the most recent band workout. */
  function sameAsLast() {
    if (!last) return;
    setMuscles([...last.muscles]);
    setBand(last.band_level ?? "Medium");
    setKg(last.resistance_kg != null ? fmt(Number(last.resistance_kg)) : "");
    setMinutes(last.minutes != null ? String(last.minutes) : "");
    setExercises(last.exercises ?? "");
    setCopied(true);
  }

  function toggle(m: string) {
    setMuscles((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  function save() {
    if (muscles.length === 0) return setLocalError("Pick at least one muscle");
    setLocalError(null);
    void shared.persist({
      id: existing?.id,
      date,
      muscles: MUSCLES.filter((m) => muscles.includes(m)),
      band_level: band,
      resistance_kg: kg ? Number(kg) : null,
      minutes: minutes ? Number(minutes) : null,
      exercises: exercises.trim(),
      notes: notes.trim(),
      kind: "bands",
      exercises_json: null,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3.5 px-4 pb-3 pt-2.5">
        {!existing && last ? (
          <Rise index={0}>
            <button type="button" onClick={sameAsLast} aria-pressed={copied} className="chip press w-full justify-between" style={{ height: 48, padding: "0 16px", ...(copied ? {} : { background: "var(--card)", boxShadow: "var(--shadow-sm)" }) }}>
              <span className="flex min-w-0 items-center gap-2">
                <Refresh size={16} />
                <span className="font-semibold">{copied ? "Copied from last time" : "Same as last time"}</span>
              </span>
              <span className="min-w-0 truncate pl-2 text-xs" style={{ opacity: 0.7 }}>
                {last.muscles.join(" · ")}
                {last.minutes != null ? ` · ${last.minutes} min` : ""}
              </span>
            </button>
          </Rise>
        ) : null}
        <Rise index={0}>
          <Card>
            <p className="text-[13px] font-semibold muted">Muscles</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {MUSCLES.map((m) => (
                <Chip key={m} label={m} selected={muscles.includes(m)} onClick={() => toggle(m)} />
              ))}
            </div>
          </Card>
        </Rise>

        <Rise index={1}>
          <DateMinutes date={date} setDate={setDate} minutes={minutes} setMinutes={setMinutes} initialDate={initialDate}>
            <Hair />
            <SettingRow label="Band">
              <PillSwitch options={[...BAND_LEVELS]} value={band} onChange={setBand} label="Band level" />
            </SettingRow>
            <Hair />
            <SettingRow label="Resistance">
              <NumberField value={kg} onChange={setKg} unit="kg" label="Resistance in kilograms" decimal />
            </SettingRow>
          </DateMinutes>
        </Rise>

        <Rise index={2}>
          <Card>
            <label className="text-[13px] font-semibold muted" htmlFor="exercises">
              Exercises
            </label>
            <textarea id="exercises" className="field mt-1.5" rows={2} value={exercises} onChange={(e) => setExercises(e.target.value)} placeholder="Rows, chest press, lateral raise" />
          </Card>
        </Rise>

        <Rise index={3}>
          <Card>
            <label className="text-[13px] font-semibold muted" htmlFor="notes">
              Notes
            </label>
            <textarea id="notes" className="field mt-1.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rows felt heavy, try heavy band next time" />
          </Card>
        </Rise>
      </div>
      <Footer {...shared} error={localError ?? shared.error} onSave={save} />
    </>
  );
}
