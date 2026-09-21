"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { saveWorkout, deleteWorkout } from "@/lib/actions";
import { BAND_COLOR, BAND_LEVELS, MUSCLES, MUSCLE_COLOR, type BandLevel, type Muscle } from "@/lib/muscles";
import type { Workout } from "@/lib/types";

export default function WorkoutSheet({
  open,
  onClose,
  date,
  existing,
  last,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  existing?: Workout | null;
  last?: Workout | null;
}) {
  const seed = existing ?? last;
  const [muscles, setMuscles] = useState<Muscle[]>(existing?.muscles ?? []);
  const [band, setBand] = useState<BandLevel>((seed?.band_level as BandLevel) ?? "Medium");
  const [kg, setKg] = useState(seed?.resistance_kg?.toString() ?? "");
  const [minutes, setMinutes] = useState(seed?.minutes?.toString() ?? "30");
  const [exercises, setExercises] = useState(existing?.exercises ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [d, setD] = useState(existing?.date ?? date);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(m: Muscle) {
    setMuscles((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  function submit() {
    if (!muscles.length) return setErr("Pick at least one muscle group.");
    setErr(null);
    start(async () => {
      try {
        await saveWorkout({
          id: existing?.id,
          date: d,
          muscles,
          band_level: band,
          resistance_kg: kg ? Number(kg) : null,
          minutes: minutes ? Number(minutes) : null,
          exercises,
          notes,
        });
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function remove() {
    if (!existing || !confirm("Delete this session?")) return;
    start(async () => {
      await deleteWorkout(existing.id);
      onClose();
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={existing ? "Edit session" : "Log a session"}
            className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-surface border-t border-line rounded-t-3xl px-4 pt-3 max-h-[92vh] overflow-y-auto"
            style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="w-10 h-1.5 rounded-full bg-line mx-auto mb-4" />
            <h2 className="text-2xl font-extrabold mb-4">{existing ? "Edit session" : "Log a session"}</h2>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="col-span-3 sm:col-span-1">
                <label className="label" htmlFor="w-date">Date</label>
                <input id="w-date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="w-kg">kg</label>
                <input id="w-kg" type="number" inputMode="decimal" step="0.5" value={kg} onChange={(e) => setKg(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="w-min">Minutes</label>
                <input id="w-min" type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </div>
            </div>

            <span className="label">Muscle groups</span>
            <div className="flex flex-wrap gap-2 mb-4">
              {MUSCLES.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={muscles.includes(m)} onClick={() => toggle(m)}>
                  <i className="dot" style={{ background: MUSCLE_COLOR[m] }} />
                  {m}
                </button>
              ))}
            </div>

            <span className="label">Band level</span>
            <div className="flex gap-2 mb-4">
              {BAND_LEVELS.map((b) => (
                <button key={b} type="button" className="chip" aria-pressed={band === b} onClick={() => setBand(b)}>
                  <i className="dot" style={{ background: BAND_COLOR[b] }} />
                  {b}
                </button>
              ))}
            </div>

            <label className="label" htmlFor="w-ex">Exercises (optional)</label>
            <textarea id="w-ex" rows={3} placeholder={"Rows 4x12\nShoulder press 3x15"} value={exercises} onChange={(e) => setExercises(e.target.value)} className="mb-3" />
            <label className="label" htmlFor="w-notes">Notes (optional)</label>
            <input id="w-notes" type="text" placeholder="How it felt" value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-4" />

            {err && <p className="text-sm text-warn mb-3">{err}</p>}
            <div className="flex gap-2 justify-end">
              {existing && (
                <button type="button" className="btn btn-ghost mr-auto" onClick={remove} disabled={pending}>Delete</button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
                {pending ? "Saving…" : "Save session"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
