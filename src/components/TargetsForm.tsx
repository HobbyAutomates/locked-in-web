"use client";

import { useState, useTransition } from "react";
import { saveTargets } from "@/lib/actions";
import type { Profile } from "@/lib/types";

export default function TargetsForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      try {
        await saveTargets(p);
        setMsg("Saved.");
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <div>
        <label className="label" htmlFor="t-week">Workouts per week</label>
        <input id="t-week" type="number" inputMode="numeric" min={1} max={14} value={p.weekly_workout_target} onChange={(e) => setP({ ...p, weekly_workout_target: Number(e.target.value) || 1 })} />
      </div>
      <div>
        <label className="label" htmlFor="t-protein">Daily protein (g)</label>
        <input id="t-protein" type="number" inputMode="numeric" min={0} value={p.protein_target_g} onChange={(e) => setP({ ...p, protein_target_g: Number(e.target.value) || 0 })} />
      </div>
      <div>
        <label className="label" htmlFor="t-cal">Daily calories (kcal)</label>
        <input id="t-cal" type="number" inputMode="numeric" min={0} value={p.calorie_target} onChange={(e) => setP({ ...p, calorie_target: Number(e.target.value) || 0 })} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm muted">{msg}</span>
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save targets"}</button>
      </div>
    </form>
  );
}
