"use client";

import { useEffect, useState } from "react";
import { deleteExercise, saveDescribedExercises, saveExercise, searchActivities, type saveWorkout } from "@/lib/actions";
import { updateExercise } from "@/lib/activityActions";
import { DEFAULT_WEIGHT_KG, DURATIONS, RUN_CODE, bandCode, bandKcal, burnKcalPct, hasDistance, intensityBand, intensityLabel, pctMultiplier, pctToBandLevel, pctToIntensity } from "@/lib/burn";
import { postJson } from "@/lib/image";
import { looksLikeDescription } from "@/lib/mealText";
import type { Activity, DescribedExercise, ExerciseEntry } from "@/lib/types";
import { ActivityIcon, Close, Flame, Search, Spinner } from "./icons";
import { EditorDelete, IntensityChips, MoreOptions, SameAsLastChip, useEditorDelete } from "./LogBits";
import { Card, ErrorNote, Hair, NumberField, PillButton, fmt } from "./ui";

/** The activity being logged: a quick chip, a recent one, or a row from the MET table. */
type Pick = { id: string; name: string; code: string | null; met: number; band?: boolean; label?: string };
export type ExercisePick = Pick;

/** v2.8 Log activity types that price a burn from the MET table. */
export type ActivityGroup = "cardio" | "sport" | "yoga" | "other";

/** Default intensity: 40 % is exactly MET ×1.0, the old "Medium" (Moderate). */
const DEFAULT_PCT = 40;

/** Quick picks per type (same labels and METs as Android's ExerciseForm). */
export const GROUP_QUICK: Record<ActivityGroup, Pick[]> = {
  cardio: [
    { id: "run", label: "Run", name: "Running", code: RUN_CODE, met: 8.3 },
    { id: "walk", label: "Walk", name: "Walking", code: "LI-17190", met: 3.5 },
    { id: "cycle", label: "Cycle", name: "Cycling", code: "01015", met: 7.5 },
    { id: "swim", label: "Swim", name: "Swimming", code: null, met: 6 },
    { id: "skipping", label: "Skipping", name: "Jump rope", code: "LI-15551", met: 11 },
    { id: "stairs", label: "Stairs", name: "Stair climbing", code: "LI-17133", met: 8.8 },
    { id: "elliptical", label: "Elliptical", name: "Elliptical trainer", code: "02090", met: 5 },
    { id: "rowing", label: "Rowing", name: "Rowing machine", code: "02080", met: 7 },
    { id: "hiit", label: "HIIT", name: "HIIT / circuit", code: null, met: 8 },
    { id: "dance", label: "Dance", name: "Dancing", code: null, met: 5 },
  ],
  sport: [
    { id: "cricket", label: "Cricket", name: "Cricket", code: "LI-15150", met: 4.8 },
    { id: "badminton", label: "Badminton", name: "Badminton", code: "LI-15030", met: 5.5 },
    { id: "football", label: "Football", name: "Football", code: "15610", met: 7 },
    { id: "tennis", label: "Tennis", name: "Tennis", code: "15675", met: 7.3 },
    { id: "basketball", label: "Basketball", name: "Basketball", code: "15055", met: 6.5 },
    { id: "table-tennis", label: "Table tennis", name: "Table tennis", code: "15660", met: 4 },
    { id: "volleyball", label: "Volleyball", name: "Volleyball", code: "15710", met: 4 },
    { id: "kabaddi", label: "Kabaddi", name: "Kabaddi", code: null, met: 6 },
    { id: "squash", label: "Squash", name: "Squash", code: "15652", met: 7.3 },
  ],
  yoga: [
    { id: "yoga", label: "Yoga", name: "Yoga", code: "LI-02101", met: 2.5 },
    { id: "stretching", label: "Stretching", name: "Stretching", code: "02170", met: 2.3 },
    { id: "pilates", label: "Pilates", name: "Pilates", code: "02165", met: 3 },
    { id: "surya", label: "Surya namaskar", name: "Surya namaskar", code: null, met: 3.8 },
  ],
  other: [
    { id: "walk", label: "Walk", name: "Walking", code: "LI-17190", met: 3.5 },
    { id: "run", label: "Run", name: "Running", code: RUN_CODE, met: 8.3 },
    { id: "cycle", label: "Cycle", name: "Cycling", code: "01015", met: 7.5 },
    { id: "swim", label: "Swim", name: "Swimming", code: null, met: 6 },
    { id: "cricket", label: "Cricket", name: "Cricket", code: "LI-15150", met: 4.8 },
    { id: "badminton", label: "Badminton", name: "Badminton", code: "LI-15030", met: 5.5 },
    { id: "football", label: "Football", name: "Football", code: "15610", met: 7 },
    { id: "skipping", label: "Skipping", name: "Jump rope", code: "LI-15551", met: 11 },
    { id: "stairs", label: "Stairs", name: "Stair climbing", code: "LI-17133", met: 8.8 },
    { id: "dance", label: "Dance", name: "Dancing", code: null, met: 5 },
  ],
};

const PLACEHOLDER: Record<ActivityGroup, string> = {
  cardio: "Search cardio or describe your run…",
  sport: "Search a sport — cricket, football…",
  yoga: "Search yoga, stretching, pilates…",
  other: "Search or describe your activity…",
};

/** Runs, walks, rides and friends: the Cardio / Run type (everything else logged by hand is Other). */
export function isCardioName(name: string, code?: string | null) {
  if (code && GROUP_QUICK.cardio.some((q) => q.code === code)) return true;
  return /\b(run|running|jog|walk|walking|hik|cycl|bicycl|bike|spin|swim|skip|jump rope|stair|ellip|row|treadmill|hiit|circuit|danc|cardio)/i.test(name);
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function activityName(a: Activity) {
  return a.description && a.description !== "general" ? `${cap(a.name)} · ${a.description}` : cap(a.name);
}
function nowHHMM() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
function hhmmOf(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
function pctOf(e: ExerciseEntry) {
  return e.intensity_pct ?? (e.intensity === "low" ? 15 : e.intensity === "high" ? 70 : DEFAULT_PCT);
}

/** Backs the MET out of a saved row so a tap re-prices it for new minutes / intensity. */
export function metOfEntry(e: { kcal: number; minutes: number; intensity: string; intensity_pct?: number | null }, weightKg: number | null) {
  const mult = e.intensity_pct != null ? pctMultiplier(e.intensity_pct) : e.intensity === "low" ? 0.85 : e.intensity === "high" ? 1.15 : 1;
  const met = e.minutes > 0 ? (e.kcal * 60) / (e.minutes * (weightKg ?? DEFAULT_WEIGHT_KG) * mult) : 0;
  return met >= 1 && met <= 25 ? Math.round(met * 10) / 10 : 4;
}

/** Entered by hand: a name and a number, no activity to re-price. */
function isHandEntered(e: ExerciseEntry) {
  return e.source === "manual" && !e.activity_code && e.intensity_pct == null;
}

/**
 * The last few distinct activities this person logged (newest first), with the MET worked back out
 * of the saved burn so a tap re-prices it for new minutes.
 */
export function recentActivities(entries: ExerciseEntry[], weightKg: number | null, n = 5): Pick[] {
  const seen = new Set<string>();
  const out: Pick[] = [];
  for (const e of entries) {
    if (e.source === "workout" || e.source === "health" || !(e.minutes > 0) || !(e.kcal > 0)) continue;
    const key = e.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `recent-${key}`, name: cap(e.name), code: e.activity_code, met: metOfEntry(e, weightKg), band: (e.activity_code ?? "").startsWith("LI-BAND") });
    if (out.length >= n) break;
  }
  return out;
}

/** What a Sport / Yoga session saves as: a workout of that kind, its burn riding on it. */
export type WorkoutSave = (p: Parameters<typeof saveWorkout>[0]) => Promise<string | null>;

/**
 * v2.8 activity form (Log activity → Cardio / Run, Sport, Yoga, Other, and the editor for a logged
 * run or activity). One bar to search the MET table or describe it ("Work it out"), a "Same as
 * last time" chip in front of the quick picks, then duration chips, intensity chips and Save.
 * "More options" holds start time, distance, steps, notes and "Enter calories instead".
 * Cardio / Other save to exercise_log; Sport / Yoga save through `saveAsWorkout`.
 */
export default function ExerciseForm({
  date,
  weightKg,
  onClose,
  group = "other",
  recent = [],
  last = null,
  editing = null,
  saveAsWorkout,
  search = searchActivities,
}: {
  date: string;
  weightKg: number | null;
  onClose: () => void;
  group?: ActivityGroup;
  /** Recent activities (Other only). */
  recent?: Pick[];
  /** The most recent row of this type: "Same as last time" fills it in. */
  last?: ExerciseEntry | null;
  /** v2.8: a logged row to edit in place. */
  editing?: ExerciseEntry | null;
  /** Sport / Yoga: save as a workout of that kind. */
  saveAsWorkout?: { kind: "sport" | "yoga"; persist: WorkoutSave };
  search?: (q: string) => Promise<Activity[]>;
}) {
  const hand = editing ? isHandEntered(editing) : false;
  const editPick: Pick | null = editing && !hand ? { id: "edit", name: cap(editing.name), code: editing.activity_code, met: metOfEntry(editing, weightKg), band: (editing.activity_code ?? "").startsWith("LI-BAND") } : null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Activity[]>([]);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState<Pick | null>(editPick ?? (group === "yoga" && !editing ? GROUP_QUICK.yoga[0] : null));
  const [pct, setPct] = useState(editing ? pctOf(editing) : DEFAULT_PCT);
  const [more, setMore] = useState(false);
  const [startTime, setStartTime] = useState(() => hhmmOf(editing?.started_at) ?? nowHHMM());
  const [distance, setDistance] = useState(editing?.distance_km != null ? fmt(editing.distance_km) : "");
  const [steps, setSteps] = useState(editing?.steps != null ? String(editing.steps) : "");
  const [notes, setNotes] = useState(editing && editing.source !== "workout" ? editing.note : "");
  const [minutes, setMinutes] = useState(editing ? String(editing.minutes) : "30");
  const [described, setDescribed] = useState<DescribedExercise[]>([]);
  const [describing, setDescribing] = useState(false);
  const [manual, setManual] = useState(hand);
  const [manualName, setManualName] = useState(hand && editing ? editing.name : "");
  const [manualKcal, setManualKcal] = useState(hand && editing ? String(Math.round(editing.kcal)) : "");
  const [sameApplied, setSameApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = useEditorDelete(() => (editing ? deleteExercise(editing.id) : Promise.resolve()), onClose);

  const typing = query.trim().length >= 2;
  const description = looksLikeDescription(query);

  // Debounced activity search while typing.
  useEffect(() => {
    if (!typing) return;
    let live = true;
    const t = setTimeout(() => {
      setSearching(true);
      search(query)
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, typing, search]);

  const mins = Number(minutes) || 0;
  const kcalFor = (p: Pick, m: number) => (p.band ? bandKcal(pctToBandLevel(pct), weightKg, m) : burnKcalPct(p.met, weightKg, m, pct));
  const pickKcal = pick ? kcalFor(pick, mins) : 0;
  const describedKcal = described.reduce((a, i) => a + i.kcal, 0);
  const mode: "manual" | "described" | "pick" | null = manual ? "manual" : described.length ? "described" : pick ? "pick" : null;
  const saveKcal = mode === "manual" ? Number(manualKcal) || 0 : mode === "described" ? describedKcal : pickKcal;
  const band = intensityBand(pct);
  const showDistance = !!pick && !pick.band && (hasDistance(pick.id) || hasDistance(pick.name));
  const quick = GROUP_QUICK[group];

  function choose(p: Pick, withMinutes?: number) {
    setPick(p);
    setDescribed([]);
    setManual(false);
    setQuery("");
    setResults([]);
    setDistance("");
    setError(null);
    setSameApplied(false);
    if (withMinutes && withMinutes > 0) setMinutes(String(withMinutes));
  }

  function sameAsLast() {
    if (!last) return;
    if (isHandEntered(last)) {
      setManual(true);
      setPick(null);
      setManualName(last.name);
      setManualKcal(String(Math.round(last.kcal)));
      setMinutes(String(last.minutes));
    } else {
      choose({ id: `last-${last.name.toLowerCase()}`, name: cap(last.name), code: last.activity_code, met: metOfEntry(last, weightKg), band: (last.activity_code ?? "").startsWith("LI-BAND") }, last.minutes);
      setPct(pctOf(last));
    }
    setSameApplied(true);
  }

  async function workItOut() {
    setDescribing(true);
    setError(null);
    try {
      const r = await postJson<{ items: DescribedExercise[] }>("/api/describe-exercise", { text: query.trim() });
      setDescribed(r.items ?? []);
      if (!r.items?.length) setError("Couldn't find an activity in that — try naming the sport or movement.");
      else {
        setPick(null);
        setManual(false);
        setQuery("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not work that out");
    } finally {
      setDescribing(false);
    }
  }

  function details() {
    const km = Number(distance);
    const st = Number(steps);
    return {
      started_at: /^\d{2}:\d{2}$/.test(startTime) ? `${editing?.date ?? date}T${startTime}:00+05:30` : null,
      intensity_pct: pct,
      distance_km: showDistance && km > 0 ? km : null,
      steps: st > 0 ? st : null,
    };
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const code = pick ? (pick.band ? bandCode(pctToBandLevel(pct)) : pick.code) : null;
      if (saveAsWorkout && !editing) {
        // Sport / Yoga: a workout of that kind (counts for streaks), its burn riding on it.
        const name = mode === "manual" ? manualName.trim() || cap(saveAsWorkout.kind) : mode === "described" ? described.map((d) => cap(d.name)).join(", ") : (pick?.name ?? "");
        const total = mode === "described" ? described.reduce((a, d) => a + d.minutes, 0) : Math.max(1, mins);
        const err = await saveAsWorkout.persist({
          date,
          muscles: [],
          band_level: "Medium",
          resistance_kg: null,
          minutes: total,
          exercises: name,
          notes: notes.trim(),
          kind: saveAsWorkout.kind,
          exercises_json: null,
          burn:
            mode === "pick"
              ? { activity_code: code, name, intensity: pctToIntensity(pct), kcal: pickKcal, ...details() }
              : { activity_code: mode === "described" ? (described[0]?.activity_code ?? null) : null, name, intensity: "medium", kcal: saveKcal },
        });
        // On success the form navigates away; only a failure comes back here.
        if (err) {
          setError(err);
          setBusy(false);
        }
        return;
      }
      if (editing) {
        if (mode === "manual") await updateExercise(editing.id, { activity_code: null, name: manualName.trim() || "Exercise", minutes: Math.max(1, mins), intensity: "medium", kcal: Number(manualKcal), note: notes });
        else if (pick) await updateExercise(editing.id, { activity_code: code, name: pick.name, minutes: mins, intensity: pctToIntensity(pct), kcal: pickKcal, note: notes, ...details() });
      } else if (mode === "described") await saveDescribedExercises(date, described);
      else if (mode === "manual") await saveExercise({ date, activity_code: null, name: manualName.trim() || "Exercise", minutes: Math.max(1, mins), intensity: "medium", kcal: Number(manualKcal), source: "manual", note: notes });
      else if (pick) await saveExercise({ date, activity_code: code, name: pick.name, minutes: mins, intensity: pctToIntensity(pct), kcal: pickKcal, source: "manual", note: notes, ...details() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  const chip = (p: Pick, label: string) => (
    <button key={p.id} type="button" role="radio" aria-checked={mode === "pick" && pick?.id === p.id} className="chip press gap-1.5 whitespace-nowrap" style={{ height: 36 }} onClick={() => choose(p)}>
      <ActivityIcon activity={`${p.id} ${p.code ?? ""} ${p.name}`} size={15} />
      {label}
    </button>
  );

  const moreHint = [pick ? "Time" : null, showDistance ? "distance" : null, pick ? "steps" : null, "notes", "calories"].filter(Boolean).join(", ");

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-5 pt-1.5">
        <div className="searchbar">
          <Search size={17} className="muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 300))} onKeyDown={(e) => e.key === "Enter" && description && !describing && void workItOut()} placeholder={editing ? "Change the activity…" : PLACEHOLDER[group]} aria-label="Search or describe your activity" />
          {typing && searching ? <Spinner size={14} /> : null}
          {query ? (
            <button type="button" aria-label="Clear" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full muted" onClick={() => setQuery("")}>
              <Close size={15} />
            </button>
          ) : null}
        </div>

        {!typing ? (
          <div className="-mx-4 overflow-x-auto px-4 py-1" style={{ scrollbarWidth: "none" }}>
            <div className="flex w-max gap-1.5" role="radiogroup" aria-label="Quick activities">
              {!editing && last ? <SameAsLastChip applied={sameApplied} onClick={sameAsLast} detail={`${cap(last.name)} · ${last.minutes} min`} /> : null}
              {quick.map((q) => chip(q, q.label ?? q.name))}
            </div>
          </div>
        ) : null}

        {!typing && recent.length && group === "other" && !editing ? (
          <div>
            <p className="px-1 text-[12px] font-bold muted">Recent</p>
            <div className="-mx-4 overflow-x-auto px-4 py-1" style={{ scrollbarWidth: "none" }}>
              <div className="flex w-max gap-1.5" role="radiogroup" aria-label="Recent activities">
                {recent.map((r) => chip(r, r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name))}
              </div>
            </div>
          </div>
        ) : null}

        {description && !editing ? (
          <PillButton height={48} disabled={describing} onClick={() => void workItOut()}>
            {describing ? "Working it out…" : "Work it out"}
          </PillButton>
        ) : null}

        {typing && !(description && results.length === 0) ? (
          <Card padding={0}>
            <div className="px-4">
              {results.length === 0 && !searching ? (
                <div className="flex flex-col items-start gap-2.5 py-3.5">
                  <p className="text-[15px]">Nothing in the activity table matches “{query.trim()}”.</p>
                  <PillButton
                    soft
                    height={44}
                    onClick={() => {
                      setManual(true);
                      setManualName(query.trim());
                      setQuery("");
                      setPick(null);
                    }}
                  >
                    Enter calories instead
                  </PillButton>
                </div>
              ) : null}
              {results.map((a, i) => (
                <div key={a.code}>
                  {i > 0 ? <Hair /> : null}
                  <button type="button" className="press flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => choose({ id: a.code, name: activityName(a), code: a.code, met: a.met })}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
                      <ActivityIcon activity={`${a.code} ${a.name}`} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold">{cap(a.name)}</span>
                      {a.description && a.description !== "general" ? <span className="truncate text-xs muted">{a.description}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold muted">≈ {Math.round(burnKcalPct(a.met, weightKg, 30, DEFAULT_PCT))} kcal / 30 min</span>
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <ErrorNote text={error ?? del.error} />

        {mode === "pick" && pick ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-[17px] font-bold">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
                  <ActivityIcon activity={`${pick.id} ${pick.code ?? ""} ${pick.name}`} size={16} />
                </span>
                <span className="truncate">{pick.name}</span>
              </p>
              <NumberField value={minutes} onChange={(v) => setMinutes(v.slice(0, 3))} unit="min" label="Duration in minutes" />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Duration">
              {DURATIONS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={minutes === String(d)} className="chip press justify-center whitespace-nowrap" style={{ height: 36, padding: "0 6px" }} onClick={() => setMinutes(String(d))}>
                  {d} min
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] font-semibold muted">Intensity</p>
            <div className="mt-1.5">
              <IntensityChips pct={pct} onChange={setPct} />
            </div>
            <p className="mt-3.5 flex flex-wrap items-center gap-x-1.5 text-[15px]">
              <span style={{ color: "var(--orange)" }} className="inline-flex">
                <Flame size={18} />
              </span>
              <span className="num font-extrabold">≈ {Math.round(pickKcal)} kcal</span>
              <span className="muted">
                · {mins} min · {pick.band ? `${pctToBandLevel(pct)} band` : `${band.label}: ${band.sub}`}
              </span>
            </p>
            {weightKg == null ? <p className="mt-2 text-xs muted">Using {DEFAULT_WEIGHT_KG} kg — add your weight in Profile for an exact number.</p> : null}
          </Card>
        ) : null}

        {mode === "described" ? (
          <Card padding={0}>
            <div className="px-4">
              {described.map((it, idx) => (
                <div key={`${it.name}-${idx}`}>
                  {idx > 0 ? <Hair /> : null}
                  <div className="flex items-center gap-3 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
                      <ActivityIcon activity={`${it.activity_code ?? ""} ${it.name}`} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold">{cap(it.name)}</span>
                      <span className="text-xs muted">
                        {it.minutes} min · {intensityLabel(it.intensity)}
                      </span>
                    </span>
                    <span className="num text-[15px] font-bold">{Math.round(it.kcal)} kcal</span>
                    <button type="button" aria-label={`Remove ${it.name}`} className="hit press grid h-8 w-8 place-items-center rounded-full" style={{ color: "var(--muted)" }} onClick={() => setDescribed((cur) => cur.filter((_, i) => i !== idx))}>
                      <Close size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {manual ? (
          <Card padding={0}>
            <div className="px-4">
              <div className="py-3">
                <label className="text-[13px] font-semibold muted" htmlFor="manual-name">
                  What did you do?
                </label>
                <input id="manual-name" className="mt-1.5 w-full bg-transparent text-[15px] outline-none" style={{ border: 0, color: "var(--ink)" }} value={manualName} onChange={(e) => setManualName(e.target.value.slice(0, 60))} placeholder="Football, swimming, gym class…" />
              </div>
              <Hair />
              <div className="flex items-center justify-between py-3">
                <span className="text-[15px] font-medium">Calories burned</span>
                <NumberField value={manualKcal} onChange={(v) => setManualKcal(v.slice(0, 4))} unit="kcal" label="Calories burned" />
              </div>
              <Hair />
              <div className="flex items-center justify-between py-3">
                <span className="text-[15px] font-medium">Duration</span>
                <NumberField value={minutes} onChange={(v) => setMinutes(v.slice(0, 3))} unit="min" label="Duration in minutes" />
              </div>
            </div>
          </Card>
        ) : null}

        {mode === null && !typing && !description ? (
          <div className="rounded-[20px] px-4 py-3.5" style={{ background: "var(--card2)" }}>
            <p className="text-[15px] font-bold">What did you do?</p>
            <p className="mt-1 text-[13px] leading-[18px] muted">Tap a pick above, search the activity table, or describe it — like “45 min cricket then 10 min skipping” — and tap Work it out.</p>
          </div>
        ) : null}

        {mode !== "described" ? (
          <MoreOptions open={more} onToggle={() => setMore((v) => !v)} hint={moreHint}>
            {mode === "pick" ? (
              <>
                <div className="flex items-center justify-between py-3">
                  <label htmlFor="ex-start" className="text-[15px] font-medium">
                    Start time
                  </label>
                  <input id="ex-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-[10px] px-2.5 py-1.5 text-[15px] font-semibold outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
                </div>
                <Hair />
                {showDistance ? (
                  <>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[15px] font-medium">Distance</span>
                      <NumberField value={distance} onChange={(v) => setDistance(v.slice(0, 6))} unit="km" label="Distance in kilometres" decimal />
                    </div>
                    <Hair />
                  </>
                ) : null}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[15px] font-medium">Steps</span>
                  <NumberField value={steps} onChange={(v) => setSteps(v.slice(0, 6))} unit="steps" label="Steps" />
                </div>
                <Hair />
              </>
            ) : null}
            <div className="py-3">
              <label htmlFor="ex-notes" className="text-[15px] font-medium">
                Notes
              </label>
              <textarea id="ex-notes" rows={2} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" className="field mt-1.5 resize-none py-2.5" />
            </div>
            <PillButton
              soft
              height={42}
              className="!w-auto !px-4 text-[13px]"
              style={{ minHeight: 42 }}
              onClick={() => {
                setManual((m) => !m);
                setSameApplied(false);
                if (!manual && pick && !manualName) setManualName(pick.name);
              }}
            >
              {manual ? "Pick an activity instead" : "Enter calories instead"}
            </PillButton>
          </MoreOptions>
        ) : null}

        {editing ? <EditorDelete label="Delete activity" del={del} disabled={busy} /> : null}
      </div>

      <div className="sticky bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
        <PillButton disabled={busy || del.pending || mode === null || !(saveKcal > 0) || (mode !== "described" && mins <= 0)} onClick={() => void save()}>
          {busy ? "Saving…" : mode === null ? "Save" : `Save · ${fmt(Math.round(saveKcal))} kcal`}
        </PillButton>
      </div>
    </div>
  );
}
