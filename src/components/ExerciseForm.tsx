"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDescribedExercises, saveExercise, searchActivities } from "@/lib/actions";
import { DEFAULT_WEIGHT_KG, DURATIONS, INTENSITIES, RUN_CODE, RUN_MET, bandCode, bandKcal, bandLevel, burnKcal, intensityLabel, type Intensity } from "@/lib/burn";
import type { Activity, DescribedExercise } from "@/lib/types";
import { Dumbbell, Flame, Keypad, Run, Spinner, TextLines, Trash } from "./icons";
import { Card, CardButton, Chip, ErrorNote, Hair, NumberField, PillButton, Rise, fmt } from "./ui";

type Mode = null | "run" | "bands" | "activity" | "describe" | "manual";

async function describeExercise(text: string): Promise<DescribedExercise[]> {
  const res = await fetch("/api/describe-exercise", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Could not work that out (${res.status})`);
  return ((await res.json()) as { items: DescribedExercise[] }).items ?? [];
}

/**
 * Log exercise → calories burned, Cal AI-style. Four ways in (Run, Weight lifting / Bands,
 * Describe, Manual) plus a searchable activity list backed by the MET table. Run / Bands / an
 * activity go through the intensity + duration picker with the burn computed live.
 */
export default function ExerciseForm({ date, weightKg, onClose }: { date: string; weightKg: number | null; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [minutes, setMinutes] = useState("30");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Activity[]>([]);
  const [searching, setSearching] = useState(false);
  const [describeText, setDescribeText] = useState("");
  const [described, setDescribed] = useState<DescribedExercise[]>([]);
  const [describing, setDescribing] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualKcal, setManualKcal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search; a blank query shows the popular set so the list is never empty.
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () => {
        setSearching(true);
        searchActivities(query)
          .then((r) => live && setResults(r))
          .catch(() => live && setResults([]))
          .finally(() => live && setSearching(false));
      },
      query.trim() ? 220 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const mins = Number(minutes) || 0;
  const kcal =
    mode === "run" ? burnKcal(RUN_MET, weightKg, mins, intensity) : mode === "bands" ? bandKcal(bandLevel(intensity), weightKg, mins) : mode === "activity" && activity ? burnKcal(activity.met, weightKg, mins, intensity) : 0;
  const title = mode === "run" ? "Run" : mode === "bands" ? "Weight lifting / Bands" : activityLabel(activity);
  const Icon = mode === "run" ? Run : mode === "bands" ? Dumbbell : Flame;

  async function saveOne(input: { activity_code: string | null; name: string; minutes: number; intensity: Intensity; kcal: number }) {
    setBusy(true);
    setError(null);
    try {
      await saveExercise({ ...input, date, source: "manual" });
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  async function runDescribe() {
    setDescribing(true);
    setError(null);
    try {
      const items = await describeExercise(describeText.trim());
      setDescribed(items);
      if (!items.length) setError("Couldn't find an activity in that — try naming the sport or movement.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not work that out");
    } finally {
      setDescribing(false);
    }
  }

  async function saveDescribed() {
    setBusy(true);
    setError(null);
    try {
      await saveDescribedExercises(date, described);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  const back = () => {
    setMode(null);
    setError(null);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1.5">
        {mode === null ? (
          <>
            <Rise index={0}>
              <div className="grid grid-cols-2 gap-2.5">
                <OptionCard icon={<Run size={22} />} title="Run" sub="Running, jogging, sprinting" onClick={() => { setIntensity("medium"); setMode("run"); }} />
                <OptionCard icon={<Dumbbell size={22} />} title="Weight lifting / Bands" sub="Machines, free weights, bands" onClick={() => { setIntensity("medium"); setMode("bands"); }} />
                <OptionCard icon={<TextLines size={22} />} title="Describe" sub="Write your workout in text" onClick={() => setMode("describe")} />
                <OptionCard icon={<Keypad size={22} />} title="Manual" sub="Enter exactly how many calories you burned" onClick={() => setMode("manual")} />
              </div>
            </Rise>
            <Rise index={1}>
              <Card padding={0}>
                <div className="px-4 pb-1 pt-3.5">
                  <p className="text-[13px] font-semibold muted">Or pick an activity</p>
                  <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--card2)" }}>
                    <input
                      className="w-full bg-transparent text-[15px] outline-none"
                      style={{ border: 0, color: "var(--ink)" }}
                      value={query}
                      onChange={(e) => setQuery(e.target.value.slice(0, 40))}
                      placeholder="Cricket, badminton, walking, yoga, stairs…"
                      aria-label="Search activities"
                    />
                    {searching ? <Spinner size={14} /> : null}
                  </div>
                </div>
                <div className="px-4">
                  {results.length === 0 && !searching ? <p className="py-3.5 text-[13px] muted">Nothing matches “{query}” — try Describe instead.</p> : null}
                  {results.map((a, i) => (
                    <div key={a.code}>
                      {i > 0 ? <Hair /> : null}
                      <button
                        type="button"
                        className="press flex w-full items-center gap-3 py-3 text-left"
                        style={{ background: "none", border: 0, color: "var(--ink)" }}
                        onClick={() => { setActivity(a); setIntensity("medium"); setMode("activity"); }}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-semibold">{cap(a.name)}</span>
                          {a.description && a.description !== "general" ? <span className="truncate text-xs muted">{a.description}</span> : null}
                        </span>
                        <span className="shrink-0 text-xs font-semibold muted">{Math.round(burnKcal(a.met, weightKg, 30))} kcal / 30 min</span>
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            </Rise>
          </>
        ) : null}

        {mode === "run" || mode === "bands" || mode === "activity" ? (
          <>
            <Rise index={0}>
              <CardButton onClick={back} padding={14} ariaLabel="Change activity">
                <div className="flex items-center gap-3">
                  <span className="tile" style={{ background: "var(--card2)", color: "var(--ink)" }}>
                    <Icon size={26} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-bold">{cap(title)}</span>
                    <span className="text-xs muted">Tap to change</span>
                  </span>
                </div>
              </CardButton>
            </Rise>
            <Rise index={1}>
              <Card padding={0}>
                <div className="px-4">
                  <p className="pb-1 pt-3.5 text-[13px] font-semibold muted">Intensity</p>
                  {INTENSITIES.map((o, i) => {
                    const sel = intensity === o.key;
                    return (
                      <div key={o.key}>
                        {i > 0 ? <Hair /> : null}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => setIntensity(o.key)}
                          className="press flex w-full items-center gap-3 py-3 text-left"
                          style={{ background: "none", border: 0, color: "var(--ink)" }}
                        >
                          <span
                            className="grid shrink-0 place-items-center rounded-full"
                            style={{ width: 22, height: 22, background: sel ? "var(--btn)" : "transparent", border: sel ? "none" : "1.5px solid var(--hair)" }}
                          >
                            {sel ? <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--btn-ink)" }} /> : null}
                          </span>
                          <span className="flex flex-col">
                            <span className="text-[15px]" style={{ fontWeight: sel ? 700 : 500 }}>{o.label}</span>
                            <span className="text-xs muted">{o.sub}</span>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </Rise>
            <Rise index={2}>
              <Card>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold muted">Duration</p>
                  <NumberField value={minutes} onChange={(v) => setMinutes(v.slice(0, 3))} unit="min" label="Duration in minutes" />
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-2">
                  {DURATIONS.map((d) => (
                    <Chip key={d} label={`${d} min`} selected={minutes === String(d)} onClick={() => setMinutes(String(d))} />
                  ))}
                </div>
              </Card>
            </Rise>
            <Rise index={3}>
              <Card padding={20}>
                <div className="flex items-center gap-3">
                  <span style={{ color: "var(--orange)" }}>
                    <Flame size={30} />
                  </span>
                  <span className="flex flex-col">
                    <span className="num text-4xl font-extrabold leading-none" style={{ letterSpacing: "-0.03em" }}>{Math.round(kcal)}</span>
                    <span className="mt-1 text-xs muted">
                      calories burned · {mins} min at {fmt(weightKg ?? DEFAULT_WEIGHT_KG)} kg
                    </span>
                  </span>
                </div>
                {weightKg == null ? <p className="mt-2 text-xs muted">Add your weight in the Locked In app (Profile → Personal details) for an exact number — using 60 kg for now.</p> : null}
              </Card>
            </Rise>
            <ErrorNote text={error} />
          </>
        ) : null}

        {mode === "describe" ? (
          <>
            <Rise index={0}>
              <Card>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
                    <TextLines size={18} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold">Describe your workout</span>
                    <span className="block text-xs muted">Activities, how long, how hard</span>
                  </span>
                </div>
                <textarea
                  className="field mt-3"
                  rows={3}
                  value={describeText}
                  aria-label="Describe your workout"
                  onChange={(e) => setDescribeText(e.target.value)}
                  placeholder="Played badminton for an hour then walked home 20 min"
                />
                <div className="mt-3">
                  <PillButton onClick={runDescribe} disabled={!describeText.trim() || describing} height={48}>
                    {describing ? "Working out the burn…" : "Work out the burn"}
                  </PillButton>
                </div>
                {describing ? (
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                    <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "var(--ink)" }} />
                  </div>
                ) : null}
              </Card>
            </Rise>
            <ErrorNote text={error} />
            {described.length ? (
              <>
                <Rise index={1}>
                  <p className="px-1 text-[13px] font-semibold muted">Review · remove anything that&apos;s wrong</p>
                </Rise>
                <Rise index={2}>
                  <Card padding={0}>
                    <div className="px-4">
                      {described.map((it, idx) => (
                        <div key={`${it.name}-${idx}`}>
                          {idx > 0 ? <Hair /> : null}
                          <div className="flex items-center gap-3 py-3">
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-[15px] font-semibold">{cap(it.name)}</span>
                              <span className="text-xs muted">
                                Intensity: {intensityLabel(it.intensity)} · {it.minutes} mins
                              </span>
                            </span>
                            <span className="flex items-center gap-1 text-[15px] font-bold">
                              <Flame size={14} />
                              {Math.round(it.kcal)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${it.name}`}
                              className="press grid h-8 w-8 place-items-center rounded-full"
                              style={{ color: "var(--muted)", background: "none", border: 0 }}
                              onClick={() => setDescribed((cur) => cur.filter((_, i) => i !== idx))}
                            >
                              <Trash size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </Rise>
              </>
            ) : null}
          </>
        ) : null}

        {mode === "manual" ? (
          <>
            <Rise index={0}>
              <Card padding={0}>
                <div className="px-4">
                  <div className="py-3">
                    <label className="text-[13px] font-semibold muted" htmlFor="manual-name">
                      What did you do?
                    </label>
                    <input
                      id="manual-name"
                      className="mt-1.5 w-full bg-transparent text-[15px] outline-none"
                      style={{ border: 0, color: "var(--ink)" }}
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value.slice(0, 60))}
                      placeholder="Football, swimming, gym class…"
                    />
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
            </Rise>
            <ErrorNote text={error} />
          </>
        ) : null}
      </div>

      {mode === "run" || mode === "bands" || mode === "activity" ? (
        <div className="sticky bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
          <PillButton
            disabled={busy || mins <= 0 || kcal <= 0}
            onClick={() =>
              saveOne({
                activity_code: mode === "run" ? RUN_CODE : mode === "bands" ? bandCode(bandLevel(intensity)) : activity?.code ?? null,
                name: mode === "run" ? "Running" : mode === "bands" ? "Weight lifting / Bands" : activityLabel(activity),
                minutes: mins,
                intensity,
                kcal,
              })
            }
          >
            {busy ? "Saving…" : `Save · ${Math.round(kcal)} kcal`}
          </PillButton>
        </div>
      ) : null}
      {mode === "describe" && described.length ? (
        <div className="sticky bottom-0 flex items-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
          <span className="flex flex-col">
            <span className="num text-xl font-extrabold" style={{ letterSpacing: "-0.025em" }}>{Math.round(described.reduce((a, i) => a + i.kcal, 0))} kcal</span>
            <span className="text-xs muted">{described.reduce((a, i) => a + i.minutes, 0)} mins</span>
          </span>
          <PillButton className="flex-1" disabled={busy} onClick={saveDescribed}>
            {busy ? "Saving…" : described.length === 1 ? "Save" : `Save ${described.length} activities`}
          </PillButton>
        </div>
      ) : null}
      {mode === "manual" ? (
        <div className="sticky bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
          <PillButton
            disabled={busy || !(Number(manualKcal) > 0)}
            onClick={() => saveOne({ activity_code: null, name: manualName.trim() || "Exercise", minutes: Math.max(1, mins), intensity: "medium", kcal: Number(manualKcal) })}
          >
            {busy ? "Saving…" : "Save"}
          </PillButton>
        </div>
      ) : null}
    </div>
  );
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function activityLabel(a: Activity | null) {
  if (!a) return "Activity";
  return a.description && a.description !== "general" ? `${a.name} · ${a.description}` : a.name;
}

/** One of the four Cal AI-style entry cards: icon tile, title, one-line hint. */
function OptionCard({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <CardButton onClick={onClick} padding={14}>
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--card2)", color: "var(--ink)" }}>
        {icon}
      </span>
      <span className="mt-2.5 block text-[15px] font-bold leading-tight">{title}</span>
      <span className="mt-0.5 block text-xs muted leading-snug">{sub}</span>
    </CardButton>
  );
}
