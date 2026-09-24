"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteWorkout, saveWorkout } from "@/lib/actions";
import { BAND_LEVELS, MUSCLES } from "@/lib/muscles";
import type { Workout } from "@/lib/types";
import { Refresh } from "./icons";
import { Card, Chip, ErrorNote, Hair, NumberField, PillButton, PillSwitch, Rise, SettingRow, fmt } from "./ui";

export default function WorkoutForm({
  existing,
  last = null,
  initialDate,
  target,
  onClose,
}: {
  existing: Workout | null;
  /** The most recent workout: "Same as last time" copies it into a new one. */
  last?: Workout | null;
  initialDate: string;
  target: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(existing?.date ?? initialDate);
  const [muscles, setMuscles] = useState<string[]>(existing?.muscles ?? []);
  const [band, setBand] = useState<string>(existing?.band_level ?? "Medium");
  const [kg, setKg] = useState(existing?.resistance_kg != null ? fmt(Number(existing.resistance_kg)) : "9");
  const [minutes, setMinutes] = useState(existing?.minutes != null ? String(existing.minutes) : "30");
  const [exercises, setExercises] = useState(existing?.exercises ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  /** Pre-fill everything but the date from the most recent workout. */
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

  async function save() {
    if (muscles.length === 0) return setError("Pick at least one muscle");
    setBusy(true);
    setError(null);
    try {
      await saveWorkout({
        id: existing?.id,
        date,
        muscles: MUSCLES.filter((m) => muscles.includes(m)),
        band_level: band,
        resistance_kg: kg ? Number(kg) : null,
        minutes: minutes ? Number(minutes) : null,
        exercises: exercises.trim(),
        notes: notes.trim(),
      });
      // A new session earns the streak celebration on Home; edits just go back.
      router.push(existing ? "/" : "/?celebrate=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteWorkout(existing.id);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1.5">
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
              <Hair />
              <SettingRow label="Band">
                <PillSwitch options={[...BAND_LEVELS]} value={band} onChange={setBand} label="Band level" />
              </SettingRow>
              <Hair />
              <SettingRow label="Resistance">
                <NumberField value={kg} onChange={setKg} unit="kg" label="Resistance in kilograms" decimal />
              </SettingRow>
              <Hair />
              <SettingRow label="Duration">
                <NumberField value={minutes} onChange={setMinutes} unit="min" label="Duration in minutes" />
              </SettingRow>
            </div>
          </Card>
        </Rise>

        <Rise index={2}>
          <Card>
            <label className="text-[13px] font-semibold muted" htmlFor="exercises">
              Exercises
            </label>
            <textarea
              id="exercises"
              className="field mt-1.5"
              rows={2}
              value={exercises}
              onChange={(e) => setExercises(e.target.value)}
              placeholder="Rows, chest press, lateral raise"
            />
          </Card>
        </Rise>

        <Rise index={3}>
          <Card>
            <label className="text-[13px] font-semibold muted" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              className="field mt-1.5"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Rows felt heavy, try heavy band next time"
            />
          </Card>
        </Rise>

        <ErrorNote text={error} />
        <p className="text-xs muted">Target {target} sessions a week.</p>

        {existing ? (
          <button type="button" onClick={remove} disabled={busy} className="press py-2 text-[15px] font-semibold" style={{ color: "var(--red)", background: "none", border: 0 }}>
            Delete workout
          </button>
        ) : null}
      </div>

      <div className="sticky bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
        <PillButton onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save workout"}
        </PillButton>
      </div>
    </div>
  );
}
