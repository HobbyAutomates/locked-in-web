"use client";

import { useState } from "react";
import WorkoutSheet from "./WorkoutSheet";
import WorkoutCard from "./WorkoutCard";
import type { Workout } from "@/lib/types";

export default function TodayWorkout({ date, todays, last }: { date: string; todays: Workout[]; last: Workout | null }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workout | null>(null);

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Workout</h2>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => { setEditing(null); setOpen(true); }}>
          Log session
        </button>
      </div>
      {todays.length === 0 ? (
        <p className="muted text-sm">Nothing logged today.{last ? ` Last session: ${last.muscles.join(", ")} on ${last.date}.` : ""}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {todays.map((w) => (
            <WorkoutCard key={w.id} w={w} onEdit={() => { setEditing(w); setOpen(true); }} />
          ))}
        </div>
      )}
      {open && (
        <WorkoutSheet key={editing?.id ?? "new"} open={open} onClose={() => setOpen(false)} date={date} existing={editing} last={last} />
      )}
    </section>
  );
}
