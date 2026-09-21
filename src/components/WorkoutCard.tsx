"use client";

import { BAND_COLOR, MUSCLE_COLOR, type BandLevel, type Muscle } from "@/lib/muscles";
import type { Workout } from "@/lib/types";

export default function WorkoutCard({ w, onEdit }: { w: Workout; onEdit?: () => void }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {w.muscles.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5 text-xs font-bold bg-surface rounded-full px-2.5 py-1">
            <i className="dot" style={{ background: MUSCLE_COLOR[m as Muscle] ?? "#94A3B8", width: 7, height: 7 }} />
            {m}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm muted">
        <span className="inline-flex items-center gap-1.5 text-ink font-bold">
          <i style={{ width: 18, height: 7, borderRadius: 4, background: BAND_COLOR[w.band_level as BandLevel] ?? "#94A3B8", display: "inline-block" }} />
          {w.band_level}
          {w.resistance_kg ? ` · ~${w.resistance_kg} kg` : ""}
        </span>
        {w.minutes ? <span>{w.minutes} min</span> : null}
        {onEdit && (
          <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={onEdit}>Edit</button>
        )}
      </div>
      {w.exercises && <pre className="whitespace-pre-wrap text-sm mt-2 font-[inherit]">{w.exercises}</pre>}
      {w.notes && <p className="text-sm muted mt-1">{w.notes}</p>}
    </div>
  );
}
