"use client";

import { useMemo, useState } from "react";
import { longDate, parseIso } from "@/lib/dates";
import { MUSCLE_COLOR, type Muscle } from "@/lib/muscles";
import type { Workout } from "@/lib/types";
import WorkoutCard from "./WorkoutCard";
import WorkoutSheet from "./WorkoutSheet";

const pad = (n: number) => String(n).padStart(2, "0");

export default function CalendarView({ today, workouts, mealDates }: { today: string; workouts: Workout[]; mealDates: string[] }) {
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => {
    const d = parseIso(today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workout | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Set<Muscle>>();
    for (const w of workouts) {
      const s = map.get(w.date) ?? new Set<Muscle>();
      w.muscles.forEach((m) => s.add(m as Muscle));
      map.set(w.date, s);
    }
    return map;
  }, [workouts]);
  const mealSet = useMemo(() => new Set(mealDates), [mealDates]);

  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const label = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const dayWorkouts = workouts.filter((w) => w.date === selected);

  return (
    <>
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}>‹</button>
          <h2 className="text-lg font-bold">{label}</h2>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Next month" onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}>›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[11px] font-bold muted tracking-wide">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const id = `${cursor.y}-${pad(cursor.m + 1)}-${pad(i + 1)}`;
            const ms = byDate.get(id);
            const sel = id === selected;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                aria-label={`${longDate(id)}${ms ? ", trained " + Array.from(ms).join(", ") : ""}`}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border text-sm
                  ${sel ? "bg-ink text-bg border-ink" : ms ? "bg-surface-2 border-transparent font-bold" : "bg-transparent border-transparent"}
                  ${id === today && !sel ? "!border-accent" : ""}`}
              >
                <span className="num">{i + 1}</span>
                <span className="flex gap-0.5 min-h-[6px] flex-wrap justify-center">
                  {ms && Array.from(ms).slice(0, 4).map((m) => <i key={m} className="dot" style={{ width: 5, height: 5, background: MUSCLE_COLOR[m] }} />)}
                  {mealSet.has(id) && <i className="dot" style={{ width: 5, height: 5, background: sel ? "var(--bg)" : "var(--ok)", opacity: 0.8 }} />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{longDate(selected)}</h2>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => { setEditing(null); setOpen(true); }}>Log</button>
        </div>
        {dayWorkouts.length === 0 ? (
          <p className="muted text-sm">No session on this day.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {dayWorkouts.map((w) => <WorkoutCard key={w.id} w={w} onEdit={() => { setEditing(w); setOpen(true); }} />)}
          </div>
        )}
      </section>

      {open && (
        <WorkoutSheet key={editing?.id ?? selected} open={open} onClose={() => setOpen(false)} date={selected} existing={editing} last={workouts[0] ?? null} />
      )}
    </>
  );
}
