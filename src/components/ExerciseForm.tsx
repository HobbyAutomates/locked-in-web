"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDescribedExercises, saveExercise, searchActivities } from "@/lib/actions";
import { DEFAULT_WEIGHT_KG, DURATIONS, INTENSITIES, QUICK_ACTIVITIES, bandCode, bandKcal, bandLevel, burnKcal, intensityLabel, type Intensity } from "@/lib/burn";
import { postJson } from "@/lib/image";
import { looksLikeDescription } from "@/lib/mealText";
import type { Activity, DescribedExercise } from "@/lib/types";
import { Close, Flame, Search, Spinner } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, fmt } from "./ui";

/** The activity being logged: a quick chip or a row from the MET table. */
type Pick = { id: string; name: string; code: string | null; met: number; band?: boolean };

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function activityName(a: Activity) {
  return a.description && a.description !== "general" ? `${cap(a.name)} · ${a.description}` : cap(a.name);
}

/**
 * Log exercise → calories burned. One bar ("Search or describe your exercise…") with quick chips
 * underneath; typing searches the MET table, a longer description gets "Work it out". Pick one,
 * set the minutes (and intensity behind "Adjust"), save. "Enter calories instead" is the manual way.
 */
export default function ExerciseForm({ date, weightKg, onClose, search = searchActivities }: { date: string; weightKg: number | null; onClose: () => void; search?: (q: string) => Promise<Activity[]> }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Activity[]>([]);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [adjust, setAdjust] = useState(false);
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
  const kcalFor = (p: Pick, m: number) => (p.band ? bandKcal(bandLevel(intensity), weightKg, m) : burnKcal(p.met, weightKg, m, intensity));
  const pickKcal = pick ? kcalFor(pick, mins) : 0;
  const describedKcal = described.reduce((a, i) => a + i.kcal, 0);
  const mode: "manual" | "described" | "pick" | null = manual ? "manual" : described.length ? "described" : pick ? "pick" : null;
  const saveKcal = mode === "manual" ? Number(manualKcal) || 0 : mode === "described" ? describedKcal : pickKcal;

  function choose(p: Pick) {
    setPick(p);
    setDescribed([]);
    setManual(false);
    setQuery("");
    setResults([]);
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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "described") await saveDescribedExercises(date, described);
      else if (mode === "manual") await saveExercise({ date, activity_code: null, name: manualName.trim() || "Exercise", minutes: Math.max(1, mins), intensity: "medium", kcal: Number(manualKcal), source: "manual" });
      else if (pick) await saveExercise({ date, activity_code: pick.band ? bandCode(bandLevel(intensity)) : pick.code, name: pick.name, minutes: mins, intensity, kcal: pickKcal, source: "manual" });
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

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

        <div className="-mx-4 overflow-x-auto px-4 py-1" style={{ scrollbarWidth: "none" }}>
          <div className="flex w-max gap-1.5" role="radiogroup" aria-label="Quick activities">
            {QUICK_ACTIVITIES.map((q) => (
              <button key={q.key} type="button" role="radio" aria-checked={mode === "pick" && pick?.id === q.key} className="chip press" style={{ height: 36 }} onClick={() => choose({ id: q.key, name: q.name, code: q.code, met: q.met, band: q.band })}>
                {q.label}
              </button>
            ))}
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
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold">{cap(a.name)}</span>
                      {a.description && a.description !== "general" ? <span className="truncate text-xs muted">{a.description}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs font-semibold muted">≈ {Math.round(burnKcal(a.met, weightKg, 30))} kcal / 30 min</span>
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
              <p className="min-w-0 truncate text-[17px] font-bold">{pick.name}</p>
              <NumberField value={minutes} onChange={(v) => setMinutes(v.slice(0, 3))} unit="min" label="Duration in minutes" />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d} type="button" aria-pressed={minutes === String(d)} className="chip press" style={{ height: 36, padding: "0 6px" }} onClick={() => setMinutes(String(d))}>
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
                · {mins} min · {intensityLabel(intensity)} ·
              </span>
              <button type="button" aria-expanded={adjust} className="hit press font-semibold underline" onClick={() => setAdjust((v) => !v)}>
                Adjust
              </button>
            </p>
            {adjust ? (
              <div className="mt-2.5 flex gap-1.5" role="radiogroup" aria-label="Intensity">
                {INTENSITIES.map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={intensity === o.key} title={o.sub} className="chip press flex-1" style={{ height: 36 }} onClick={() => setIntensity(o.key)}>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
            {adjust ? <p className="mt-1.5 text-xs muted">{INTENSITIES.find((o) => o.key === intensity)?.sub}</p> : null}
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

        {mode === null && !typing && !description ? <p className="px-1 text-[13px] muted">Tap an activity above, search for one, or describe what you did.</p> : null}

        <button type="button" className="hit press self-start py-1 text-[13px] font-semibold muted" onClick={() => setManual((m) => !m)}>
          {manual ? "Pick an activity instead" : "Enter calories instead"}
        </button>
      </div>

      <div className="sticky bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
        <PillButton disabled={busy || mode === null || !(saveKcal > 0) || (mode !== "described" && mins <= 0)} onClick={() => void save()}>
          {busy ? "Saving…" : mode === null ? "Save" : `Save · ${fmt(Math.round(saveKcal))} kcal`}
        </PillButton>
      </div>
    </div>
  );
}
