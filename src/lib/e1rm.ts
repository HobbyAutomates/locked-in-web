/**
 * v2.13 PR charts (spec §12). Pure, so scripts/check-e1rm.ts runs it; Android's util/E1rm.kt is a
 * line-for-line port with the same test vectors.
 *
 * Estimated one-rep max, Epley: e1RM = w × (1 + reps / 30). Each session's "best set" is the set with
 * the highest e1RM (ties: the heavier weight, then more reps). A session is a PR when its best e1RM
 * beats every earlier session of that exercise. Bodyweight sets (no kg) are ranked by reps instead.
 */
import type { Workout, WorkoutSet } from "./types";

export function epley(kg: number, reps: number): number {
  if (!Number.isFinite(kg) || !Number.isFinite(reps) || kg <= 0 || reps <= 0) return 0;
  return kg * (1 + reps / 30);
}

/** One decimal, like the rest of the app. */
export const round1 = (v: number) => Math.round(v * 10) / 10;

export type BestSet = { kg: number | null; reps: number; e1rm: number };

/** The best set of a list (see header), or null when there's no set with reps. */
export function bestSet(sets: WorkoutSet[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of sets) {
    const reps = Math.round(Number(s.reps) || 0);
    if (reps <= 0) continue;
    const kg = s.kg == null || !(Number(s.kg) > 0) ? null : Number(s.kg);
    const e = kg == null ? 0 : epley(kg, reps);
    const cand: BestSet = { kg, reps, e1rm: round1(e) };
    if (!best) {
      best = cand;
      continue;
    }
    const better =
      cand.e1rm > best.e1rm ||
      (cand.e1rm === best.e1rm && (cand.kg ?? 0) > (best.kg ?? 0)) ||
      (cand.e1rm === best.e1rm && (cand.kg ?? 0) === (best.kg ?? 0) && cand.reps > best.reps);
    if (better) best = cand;
  }
  return best;
}

export type SessionPoint = { date: string; workoutId: string; best: BestSet; sets: number; volume: number; pr: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Every session of `exercise`, oldest first, with its best set and whether it set a PR. `weighted` is
 * false when no session ever had a load (then PRs are by reps).
 */
export function exerciseHistory(workouts: Pick<Workout, "id" | "date" | "exercises_json">[], exercise: string): { points: SessionPoint[]; weighted: boolean } {
  const n = norm(exercise);
  const rows: Omit<SessionPoint, "pr">[] = [];
  for (const w of workouts) {
    const sets: WorkoutSet[] = [];
    for (const x of w.exercises_json ?? []) if (norm(x.name) === n) sets.push(...x.sets);
    const best = bestSet(sets);
    if (!best) continue;
    const volume = sets.reduce((a, s) => a + (s.kg && s.kg > 0 ? s.kg * (Number(s.reps) || 0) : 0), 0);
    rows.push({ date: w.date, workoutId: w.id, best, sets: sets.filter((s) => (Number(s.reps) || 0) > 0).length, volume: round1(volume) });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.workoutId < b.workoutId ? -1 : 1));
  const weighted = rows.some((r) => r.best.kg != null);
  let top = -Infinity;
  const points = rows.map((r, i) => {
    const score = weighted ? r.best.e1rm : r.best.reps;
    const pr = i > 0 && score > top;
    top = Math.max(top, score);
    return { ...r, pr };
  });
  return { points, weighted };
}

/** The all-time best (highest e1RM, or reps for bodyweight) session, or null. */
export function personalBest(h: { points: SessionPoint[]; weighted: boolean }): SessionPoint | null {
  let best: SessionPoint | null = null;
  for (const p of h.points) {
    const s = h.weighted ? p.best.e1rm : p.best.reps;
    const b = best ? (h.weighted ? best.best.e1rm : best.best.reps) : -Infinity;
    if (s > b) best = p;
  }
  return best;
}

/** Exercise names with at least one logged set, most sessions first (the PR chart picker). */
export function loggedExercises(workouts: Pick<Workout, "exercises_json">[]): { name: string; sessions: number }[] {
  const count = new Map<string, { name: string; sessions: number }>();
  for (const w of workouts) {
    const seen = new Set<string>();
    for (const x of w.exercises_json ?? []) {
      const k = norm(x.name);
      if (!k || seen.has(k) || !x.sets.some((s) => (Number(s.reps) || 0) > 0)) continue;
      seen.add(k);
      const cur = count.get(k);
      if (cur) cur.sessions += 1;
      else count.set(k, { name: x.name, sessions: 1 });
    }
  }
  return [...count.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/** Did the sets just logged for `exercise` beat every earlier session? (Live workout's PR badge.) */
export function isNewPr(history: Pick<Workout, "id" | "date" | "exercises_json">[], exercise: string, sets: WorkoutSet[]): boolean {
  const now = bestSet(sets);
  if (!now) return false;
  const h = exerciseHistory(history, exercise);
  if (!h.points.length) return false;
  const pb = personalBest(h);
  if (!pb) return false;
  const weighted = h.weighted || now.kg != null;
  return weighted ? now.e1rm > (h.weighted ? pb.best.e1rm : 0) : now.reps > pb.best.reps;
}
