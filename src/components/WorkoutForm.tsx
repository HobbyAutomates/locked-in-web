"use client";

import { useRef, useState } from "react";
import { deleteWorkout, saveWorkout } from "@/lib/actions";
import { DURATIONS } from "@/lib/burn";
import { POPULAR, exerciseDef, exercisesText, lastSets, musclesOf, searchExercises } from "@/lib/exercises";
import { BAND_LEVELS, MUSCLES } from "@/lib/muscles";
import type { ExerciseEntry, Workout, WorkoutExercise, WorkoutKind } from "@/lib/types";
import ExerciseForm, { isCardioName, recentActivities, type ActivityGroup } from "./ExerciseForm";
import { Band, Bat, Close, Dumbbell, Flame, Plus, Pushup, Refresh, Run, Search, Yoga } from "./icons";
import { EditorDelete, MoreOptions, SAME_AS_LAST, SameAsLastChip, useEditorDelete } from "./LogBits";
import { Card, Chip, ErrorNote, Hair, NumberField, PillButton, PillSwitch, Rise, SettingRow, fmt } from "./ui";

/** v2.8 Log activity: one flow, the type picked inline. */
export type ActivityType = "gym" | "bodyweight" | "bands" | "cardio" | "sport" | "yoga" | "other";

const TYPES: { key: ActivityType; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { key: "gym", label: "Gym", Icon: Dumbbell },
  { key: "bodyweight", label: "Body­weight", Icon: Pushup },
  { key: "bands", label: "Bands", Icon: Band },
  { key: "cardio", label: "Cardio / Run", Icon: Run },
  { key: "sport", label: "Sport", Icon: Bat },
  { key: "yoga", label: "Yoga", Icon: Yoga },
  { key: "other", label: "Other", Icon: Flame },
];

type Payload = Parameters<typeof saveWorkout>[0];

const byDateDesc = (a: Workout, b: Workout) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Your own runs / activities (not workout burns or Health Connect). */
function ownRows(entries: ExerciseEntry[]) {
  return entries.filter((e) => (e.source === "manual" || e.source === "describe") && e.minutes > 0 && e.kcal > 0);
}

/**
 * The type Log activity opens on: whatever you logged most recently (a workout's kind, or Cardio /
 * Other for a run or activity), Gym for a first-timer.
 */
export function defaultActivityType(workouts: Workout[], entries: ExerciseEntry[]): ActivityType {
  const w = [...workouts].sort(byDateDesc)[0];
  const e = ownRows(entries)[0];
  if (e && (!w || e.date >= w.date)) return isCardioName(e.name, e.activity_code) ? "cardio" : "other";
  return w ? ((w.kind ?? "bands") as ActivityType) : "gym";
}

/**
 * v2.8 Log activity (replaces the Workout / Exercise split): Gym · Bodyweight · Bands · Cardio / Run
 * · Sport · Yoga · Other, picked inline. Gym, Bodyweight, Bands, Sport and Yoga save to `workouts`
 * (streaks); Cardio / Run and Other save to `exercise_log`. The same component edits a logged
 * workout (`existing`) or a logged run / activity (`editingExercise`).
 */
export default function WorkoutForm({
  existing,
  editingExercise = null,
  initialDate,
  target,
  onClose,
  onCreated,
  weightKg = null,
  workouts = [],
  entries = [],
  history = [],
  initialType,
}: {
  existing: Workout | null;
  /** v2.8: a logged run / activity row to edit. */
  editingExercise?: ExerciseEntry | null;
  initialDate: string;
  target: number;
  onClose: () => void;
  /** After a brand-new session saves (Home celebrates the streak). */
  onCreated: () => void;
  weightKg?: number | null;
  /** Recent workouts of every kind (for "Same as last time" and the default type). */
  workouts?: Workout[];
  /** Recent exercise_log rows (60 days), newest first. */
  entries?: ExerciseEntry[];
  /** Recent gym / bodyweight sessions: the set grid's "last time" ghost values. */
  history?: Workout[];
  initialType?: ActivityType;
}) {
  const editingKind = existing ? ((existing.kind ?? "bands") as WorkoutKind) : null;
  const [type, setType] = useState<ActivityType>(
    editingKind ?? (editingExercise ? (isCardioName(editingExercise.name, editingExercise.activity_code) ? "cardio" : "other") : (initialType ?? defaultActivityType(workouts, entries))),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Saves a workout; on success leaves the form. Returns the error text (or null). */
  async function persist(payload: Payload): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await saveWorkout(payload);
      if (!res.ok) {
        console.error("[WorkoutForm] save failed:", res.error);
        setError(res.error);
        setBusy(false);
        return res.error;
      }
      const done = existing ? onClose : onCreated;
      if (res.warning) {
        // Saved, but the auto-burn row didn't make it: say so here instead of leaving silently.
        console.error("[WorkoutForm] saved with a warning:", res.warning);
        setError(res.warning);
        setTimeout(done, 2500);
        return null;
      }
      done();
      return null;
    } catch (e) {
      console.error("[WorkoutForm] save threw:", e);
      const msg = e instanceof Error && e.message ? `Couldn't save the workout: ${e.message}` : "Couldn't save the workout — check your connection and try again.";
      setError(msg);
      setBusy(false);
      return msg;
    }
  }

  const lastOf = (k: WorkoutKind) => workouts.filter((w) => (w.kind ?? "bands") === k && w.id !== existing?.id).sort(byDateDesc)[0] ?? null;
  const burnOf = (w: Workout | null) => (w ? (entries.find((e) => e.source === "workout" && e.note === w.id) ?? null) : null);
  const own = ownRows(entries);
  const lastExercise = (g: ActivityGroup): ExerciseEntry | null => {
    if (g === "sport" || g === "yoga") {
      const w = lastOf(g);
      const b = burnOf(w);
      return b && w ? { ...b, name: w.exercises || b.name, minutes: w.minutes ?? b.minutes } : null;
    }
    return own.find((e) => (g === "cardio") === isCardioName(e.name, e.activity_code)) ?? null;
  };

  // An existing session can move between Gym / Bodyweight / Bands; nothing else switches type in an editor.
  const liftEdit = editingKind === "gym" || editingKind === "bodyweight" || editingKind === "bands";
  const types = existing ? (liftEdit ? TYPES.filter((k) => k.key === "gym" || k.key === "bodyweight" || k.key === "bands") : []) : editingExercise ? [] : TYPES;
  const del = useEditorDelete(async () => {
    if (!existing) return;
    const res = await deleteWorkout(existing.id);
    if (!res.ok) throw new Error(res.error);
  }, onClose);
  const shared = { existing, initialDate, busy, error: error ?? del.error, target, persist, del };

  return (
    <div className="flex flex-1 flex-col">
      {types.length ? (
        <div className="px-4 pb-1 pt-1.5">
          <div className={`grid gap-2 ${types.length > 3 ? "grid-cols-4" : "grid-cols-3"}`} role="radiogroup" aria-label="Activity type">
            {types.map(({ key, label, Icon }) => {
              const on = type === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setType(key);
                    setError(null);
                  }}
                  className="press flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2"
                  style={{ minHeight: 58, background: on ? "var(--btn)" : "var(--card)", color: on ? "var(--btn-ink)" : "var(--ink)", boxShadow: on ? "none" : "var(--shadow-sm)", border: 0 }}
                >
                  <Icon size={19} />
                  <span className="w-full text-center text-[11.5px] font-semibold leading-tight" style={{ hyphens: "manual" }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {existing && !liftEdit ? (
        <KindEditForm {...shared} existing={existing} burn={burnOf(existing)} />
      ) : type === "cardio" || type === "other" || type === "sport" || type === "yoga" ? (
        <ExerciseForm
          key={type}
          date={initialDate}
          weightKg={weightKg}
          onClose={onClose}
          group={type}
          editing={editingExercise}
          last={editingExercise ? null : lastExercise(type)}
          recent={type === "other" ? recentActivities(entries.filter((e) => !isCardioName(e.name, e.activity_code)), weightKg ?? null, 8) : []}
          saveAsWorkout={type === "sport" || type === "yoga" ? { kind: type, persist } : undefined}
        />
      ) : type === "bands" ? (
        <BandsForm {...shared} last={lastOf("bands")} />
      ) : (
        <LiftForm key={type} {...shared} kind={type} history={history} last={lastOf(type)} />
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
  persist: (p: Payload) => Promise<string | null>;
  del: ReturnType<typeof useEditorDelete>;
};

function Footer({ existing, busy, error, target, del, onSave, label = "Save workout" }: Shared & { onSave: () => void; label?: string }) {
  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <ErrorNote text={error} />
        <p className="text-xs muted">Target {target} sessions a week.</p>
        {existing ? <EditorDelete label="Delete workout" del={del} disabled={busy} /> : null}
      </div>
      <div className="sticky bottom-0 mt-auto px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
        <PillButton onClick={onSave} disabled={busy || del.pending}>
          {busy ? "Saving…" : label}
        </PillButton>
      </div>
    </>
  );
}

function DateRow({ date, setDate, initialDate }: { date: string; setDate: (v: string) => void; initialDate: string }) {
  return (
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
  );
}

function DurationRow({ minutes, setMinutes }: { minutes: string; setMinutes: (v: string) => void }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium">Duration</span>
        <NumberField value={minutes} onChange={(v) => setMinutes(v.slice(0, 3))} unit="min" label="Duration in minutes" />
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Duration">
        {DURATIONS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={minutes === String(d)} className="chip press justify-center whitespace-nowrap" style={{ height: 34, padding: "0 6px" }} onClick={() => setMinutes(String(d))}>
            {d} min
          </button>
        ))}
      </div>
    </div>
  );
}

function NotesField({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="py-3">
      <label className="text-[13px] font-semibold muted" htmlFor={id}>
        Notes
      </label>
      <textarea id={id} className="field mt-1.5" rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ---- Sport / Yoga (and older Cardio) sessions: editing a saved one ----

/** A saved Sport / Yoga / Cardio workout: minutes (the burn follows them), date and notes, or delete. */
function KindEditForm({ existing, burn, ...shared }: Shared & { existing: Workout; burn: ExerciseEntry | null }) {
  const [minutes, setMinutes] = useState(String(existing.minutes ?? burn?.minutes ?? 30));
  const [date, setDate] = useState(existing.date);
  const [notes, setNotes] = useState(existing.notes ?? "");
  const [more, setMore] = useState(false);
  const mins = Number(minutes) || 0;
  const kcal = burn ? (burn.minutes > 0 ? (burn.kcal / burn.minutes) * mins : burn.kcal) : null;
  const name = existing.exercises || burn?.name || (existing.kind ?? "Workout");

  function save() {
    void shared.persist({
      id: existing.id,
      date,
      muscles: existing.muscles ?? [],
      band_level: existing.band_level ?? "Medium",
      resistance_kg: null,
      minutes: Math.max(1, mins),
      exercises: existing.exercises ?? "",
      notes: notes.trim(),
      kind: (existing.kind ?? "sport") as WorkoutKind,
      exercises_json: null,
      burn: burn && kcal != null ? { activity_code: burn.activity_code, name: burn.name, intensity: burn.intensity, kcal, intensity_pct: burn.intensity_pct ?? null, started_at: burn.started_at ?? null, distance_km: burn.distance_km ?? null, steps: burn.steps ?? null } : null,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-3 pt-2.5">
        <Card padding={0}>
          <div className="px-4">
            <p className="py-3.5 text-[17px] font-bold">{name.charAt(0).toUpperCase() + name.slice(1)}</p>
            <Hair />
            <DurationRow minutes={minutes} setMinutes={setMinutes} />
            {kcal != null ? (
              <>
                <Hair />
                <SettingRow label="Burned">
                  <span className="num text-[15px] font-bold">{Math.round(kcal)} kcal</span>
                </SettingRow>
              </>
            ) : null}
          </div>
        </Card>
        <MoreOptions open={more} onToggle={() => setMore((v) => !v)} hint="Date, notes">
          <DateRow date={date} setDate={setDate} initialDate={existing.date} />
          <Hair />
          <NotesField id="kind-notes" value={notes} onChange={setNotes} placeholder="How did it feel?" />
        </MoreOptions>
      </div>
      <Footer {...shared} existing={existing} onSave={save} label="Save" />
    </>
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

function LiftForm({ kind, history, last, ...shared }: Shared & { kind: "gym" | "bodyweight"; history: Workout[]; last: Workout | null }) {
  const { existing, initialDate } = shared;
  const [date, setDate] = useState(existing?.date ?? initialDate);
  const [minutes, setMinutes] = useState(existing?.minutes != null ? String(existing.minutes) : "45");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [rows, setRows] = useState<LiftRow[]>(() => toRows(existing?.exercises_json));
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
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

  /** "Same as last time": last session's exercises and sets, all still editable. */
  function sameAsLast() {
    if (!last?.exercises_json?.length) return;
    setRows(toRows(last.exercises_json).map((r) => ({ ...r, key: seq.current++ })));
    if (last.minutes != null) setMinutes(String(last.minutes));
    setCopied(true);
    setLocalError(null);
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
        {!existing && last?.exercises_json?.length ? (
          <div className="flex">
            <SameAsLastChip applied={copied} onClick={sameAsLast} detail={last.exercises_json.map((x) => x.name).slice(0, 3).join(", ")} />
          </div>
        ) : null}
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
                      <Refresh size={13} /> <span className="whitespace-nowrap">{SAME_AS_LAST}</span>
                    </button>
                  ) : null}
                </div>
              </Card>
            </Rise>
          );
        })}

        <Card padding={0}>
          <div className="px-4">
            <DurationRow minutes={minutes} setMinutes={setMinutes} />
          </div>
        </Card>

        <MoreOptions open={more} onToggle={() => setMore((v) => !v)} hint="Date, notes">
          <DateRow date={date} setDate={setDate} initialDate={initialDate} />
          <Hair />
          <NotesField id="lift-notes" value={notes} onChange={setNotes} placeholder="Felt strong on bench — go up next time" />
        </MoreOptions>
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
  const [more, setMore] = useState(false);
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
          <div className="flex">
            <SameAsLastChip applied={copied} onClick={sameAsLast} detail={`${last.muscles.join(" · ")}${last.minutes != null ? ` · ${last.minutes} min` : ""}`} />
          </div>
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
          <Card padding={0}>
            <div className="px-4">
              <SettingRow label="Band">
                <PillSwitch options={[...BAND_LEVELS]} value={band} onChange={setBand} label="Band level" />
              </SettingRow>
              <Hair />
              <DurationRow minutes={minutes} setMinutes={setMinutes} />
            </div>
          </Card>
        </Rise>

        <MoreOptions open={more} onToggle={() => setMore((v) => !v)} hint="Resistance, exercises, date, notes">
          <SettingRow label="Resistance">
            <NumberField value={kg} onChange={setKg} unit="kg" label="Resistance in kilograms" decimal />
          </SettingRow>
          <Hair />
          <div className="py-3">
            <label className="text-[13px] font-semibold muted" htmlFor="exercises">
              Exercises
            </label>
            <textarea id="exercises" className="field mt-1.5" rows={2} value={exercises} onChange={(e) => setExercises(e.target.value)} placeholder="Rows, chest press, lateral raise" />
          </div>
          <Hair />
          <DateRow date={date} setDate={setDate} initialDate={initialDate} />
          <Hair />
          <NotesField id="notes" value={notes} onChange={setNotes} placeholder="Rows felt heavy, try heavy band next time" />
        </MoreOptions>
      </div>
      <Footer {...shared} error={localError ?? shared.error} onSave={save} />
    </>
  );
}
