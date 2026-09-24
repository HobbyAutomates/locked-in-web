"use client";

import { useEffect, useState } from "react";
import { saveDescribedExercises, saveExercise, searchActivities } from "@/lib/actions";
import { DEFAULT_WEIGHT_KG, DURATIONS, QUICK_ACTIVITIES, bandCode, bandKcal, burnKcalPct, hasDistance, intensityBand, intensityLabel, pctMultiplier, pctToBandLevel, pctToIntensity } from "@/lib/burn";
import { postJson } from "@/lib/image";
import { looksLikeDescription } from "@/lib/mealText";
import type { Activity, DescribedExercise, ExerciseEntry } from "@/lib/types";
import { ActivityIcon, ChevronDown, Close, Flame, Search, Spinner } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, fmt } from "./ui";

/** The activity being logged: a quick chip, a recent one, or a row from the MET table. */
type Pick = { id: string; name: string; code: string | null; met: number; band?: boolean };
export type ExercisePick = Pick;

/** Default slider position: 40 % is exactly MET ×1.0, the old "Medium". */
const DEFAULT_PCT = 40;

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function activityName(a: Activity) {
  return a.description && a.description !== "general" ? `${cap(a.name)} · ${a.description}` : cap(a.name);
}
function nowHHMM() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

/**
 * The last few distinct activities this person logged (newest first), with the MET worked back out
 * of the saved burn so a tap re-prices it for new minutes.
 */
export function recentActivities(entries: ExerciseEntry[], weightKg: number | null, n = 5): Pick[] {
  const seen = new Set<string>();
  const out: Pick[] = [];
  for (const e of entries) {
    if (e.source === "workout" || !(e.minutes > 0) || !(e.kcal > 0)) continue;
    const key = e.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const mult = e.intensity_pct != null ? pctMultiplier(e.intensity_pct) : e.intensity === "low" ? 0.85 : e.intensity === "high" ? 1.15 : 1;
    const met = (e.kcal * 60) / (e.minutes * (weightKg ?? DEFAULT_WEIGHT_KG) * mult);
    out.push({ id: `recent-${key}`, name: cap(e.name), code: e.activity_code, met: Math.round(met * 10) / 10 });
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Log exercise → calories burned. One bar ("Search or describe your exercise…") with Recent and
 * quick picks underneath; typing searches the MET table, a longer description gets "Work it out".
 * Pick one, set the minutes, and "More" opens the Google-Fit-style details: start time, an
 * intensity slider (MET ×0.8 … ×1.3), distance for run / walk / cycle, steps and notes.
 */
export default function ExerciseForm({
  date,
  weightKg,
  onClose,
  recent = [],
  search = searchActivities,
}: {
  date: string;
  weightKg: number | null;
  onClose: () => void;
  recent?: Pick[];
  search?: (q: string) => Promise<Activity[]>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Activity[]>([]);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [pct, setPct] = useState(DEFAULT_PCT);
  const [more, setMore] = useState(false);
  const [startTime, setStartTime] = useState(nowHHMM);
  const [distance, setDistance] = useState("");
  const [steps, setSteps] = useState("");
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [described, setDescribed] = useState<DescribedExercise[]>([]);
  const [describing, setDescribing] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualKcal, setManualKcal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function choose(p: Pick) {
    setPick(p);
    setDescribed([]);
    setManual(false);
    setQuery("");
    setResults([]);
    setDistance("");
    setError(null);
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not work that out");
    } finally {
      setDescribing(false);
    }
  }

  function details() {
    if (!more) return {};
    const km = Number(distance);
    const st = Number(steps);
    return {
      started_at: /^\d{2}:\d{2}$/.test(startTime) ? `${date}T${startTime}:00+05:30` : null,
      intensity_pct: pct,
      distance_km: showDistance && km > 0 ? km : null,
      steps: st > 0 ? st : null,
      note: notes,
    };
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "described") await saveDescribedExercises(date, described);
      else if (mode === "manual") await saveExercise({ date, activity_code: null, name: manualName.trim() || "Exercise", minutes: Math.max(1, mins), intensity: "medium", kcal: Number(manualKcal), source: "manual" });
      else if (pick)
        await saveExercise({
          date,
          activity_code: pick.band ? bandCode(pctToBandLevel(pct)) : pick.code,
          name: pick.name,
          minutes: mins,
          intensity: pctToIntensity(pct),
          kcal: pickKcal,
          source: "manual",
          intensity_pct: pct,
          ...details(),
        });
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-5 pt-1.5">
        <div className="searchbar">
          <Search size={17} className="muted shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 300))} onKeyDown={(e) => e.key === "Enter" && description && !describing && void workItOut()} placeholder="Search or describe your exercise…" aria-label="Search or describe your exercise" />
          {typing && searching ? <Spinner size={14} /> : null}
          {query ? (
            <button type="button" aria-label="Clear" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full muted" onClick={() => setQuery("")}>
              <Close size={15} />
            </button>
          ) : null}
        </div>

        {recent.length ? (
          <div>
            <p className="px-1 text-[12px] font-bold muted">Recent</p>
            <div className="-mx-4 overflow-x-auto px-4 py-1" style={{ scrollbarWidth: "none" }}>
              <div className="flex w-max gap-1.5" role="radiogroup" aria-label="Recent activities">
                {recent.map((r) => chip(r, r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="-mx-4 overflow-x-auto px-4 py-1" style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max gap-1.5" role="radiogroup" aria-label="Quick activities">
            {QUICK_ACTIVITIES.map((q) => chip({ id: q.key, name: q.name, code: q.code, met: q.met, band: q.band }, q.label))}
          </div>
        </div>

        {description ? (
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
                  <PillButton soft height={44} onClick={() => setManual(true)}>
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

        <ErrorNote text={error} />

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
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d} type="button" aria-pressed={minutes === String(d)} className="chip press whitespace-nowrap" style={{ height: 36, padding: "0 6px", minWidth: 64 }} onClick={() => setMinutes(String(d))}>
                  {d} min
                </button>
              ))}
            </div>
            <p className="mt-3.5 flex flex-wrap items-center gap-x-1.5 text-[15px]">
              <span style={{ color: "var(--orange)" }} className="inline-flex">
                <Flame size={18} />
              </span>
              <span className="num font-extrabold">≈ {Math.round(pickKcal)} kcal</span>
              <span className="muted">
                · {mins} min · {pick.band ? `${pctToBandLevel(pct)} band` : band.label}
              </span>
            </p>

            <button type="button" aria-expanded={more} className="press mt-3 flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => setMore((v) => !v)}>
              More
              <span className="inline-flex items-center gap-1 text-xs font-medium muted">
                Time, intensity{showDistance ? ", distance" : ""}, steps, notes
                <ChevronDown size={16} style={{ transform: more ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </span>
            </button>

            {more ? (
              <div className="mt-1">
                <div className="flex items-center justify-between py-3">
                  <label htmlFor="ex-start" className="text-[15px] font-medium">
                    Start time
                  </label>
                  <input id="ex-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-[10px] px-2.5 py-1.5 text-[15px] font-semibold outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
                </div>
                <Hair />
                <div className="py-3">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="ex-intensity" className="text-[15px] font-medium">
                      Intensity
                    </label>
                    <span className="num text-[13px] font-bold">{pct}%</span>
                  </div>
                  <input id="ex-intensity" type="range" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-2 h-6 w-full" style={{ accentColor: "var(--orange)" }} aria-valuetext={`${band.label}: ${band.sub}`} />
                  <p className="text-[13px]">
                    <span className="font-bold">{band.label}:</span> <span className="muted">{band.sub}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] muted">Burn × {pctMultiplier(pct).toFixed(2)} · saved as {intensityLabel(pctToIntensity(pct))}</p>
                </div>
                {showDistance ? (
                  <>
                    <Hair />
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[15px] font-medium">Distance</span>
                      <NumberField value={distance} onChange={(v) => setDistance(v.slice(0, 6))} unit="km" label="Distance in kilometres" decimal />
                    </div>
                  </>
                ) : null}
                <Hair />
                <div className="flex items-center justify-between py-3">
                  <span className="text-[15px] font-medium">Steps</span>
                  <NumberField value={steps} onChange={(v) => setSteps(v.slice(0, 6))} unit="steps" label="Steps" />
                </div>
                <Hair />
                <div className="pt-3">
                  <label htmlFor="ex-notes" className="text-[15px] font-medium">
                    Notes
                  </label>
                  <textarea id="ex-notes" rows={2} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" className="field mt-1.5 resize-none py-2.5" />
                </div>
              </div>
            ) : null}
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
            <p className="mt-1 text-[13px] leading-[18px] muted">Tap a quick pick above, search the activity table, or describe it in words — like “45 min cricket then 10 min skipping” — and tap Work it out.</p>
          </div>
        ) : null}

        <PillButton soft height={42} className="!w-auto self-start !px-4 text-[13px]" style={{ minHeight: 42 }} onClick={() => setManual((m) => !m)}>
          {manual ? "Pick an activity instead" : "Enter calories instead"}
        </PillButton>
      </div>

      <div className="sticky bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
        <PillButton disabled={busy || mode === null || !(saveKcal > 0) || (mode !== "described" && mins <= 0)} onClick={() => void save()}>
          {busy ? "Saving…" : mode === null ? "Save" : `Save · ${fmt(Math.round(saveKcal))} kcal`}
        </PillButton>
      </div>
    </div>
  );
}
