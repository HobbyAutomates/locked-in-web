import type { MealItem, WorkoutExercise, WorkoutKind } from "./types";

/** v2.6: what each squad tab shows (the `kinds` argument of group_feed). Photos appear in both. */
export const CHAT_KINDS = ["message", "photo"];
export const FEED_KINDS = ["meal", "workout", "pr", "photo"];

export const WEB_URL = "https://web-production-ff1cf.up.railway.app";

/** The invite link for a squad code: https://…/join/<code>. */
export function inviteLink(code: string) {
  return `${WEB_URL}/join/${code}`;
}

/**
 * v2.6: the text of the automatic squad-feed posts. The author's name is not in the body — the
 * feed shows it above ("Ayaan · logged a meal"), and Android builds the same strings.
 */

const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** "Dal + 2 roti + Curd · 420 kcal" (at most three foods, then "+ 2 more"). */
export function mealPostBody(items: Pick<MealItem, "name" | "calories" | "servings" | "grams">[], rawText = ""): string {
  const kcal = Math.round(items.reduce((a, i) => a + Number(i.calories || 0), 0));
  const names = items
    .filter((i) => Number(i.grams) > 0)
    .map((i, idx) => {
      const n = String(i.name ?? "").trim();
      const s = Number(i.servings ?? 0);
      const label = s > 0 && s !== 1 ? `${trimNum(s)} ${n.toLowerCase()}` : idx === 0 ? n : n.toLowerCase();
      return label.charAt(0).toUpperCase() + label.slice(1);
    })
    .filter(Boolean);
  const shown = names.slice(0, 3).join(" + ");
  const more = names.length > 3 ? ` + ${names.length - 3} more` : "";
  const what = shown || rawText.trim().slice(0, 80) || "a meal";
  return kcal > 0 ? `${what}${more} · ${kcal.toLocaleString("en-IN")} kcal` : `${what}${more}`;
}

const KIND_LABEL: Record<WorkoutKind, string> = { gym: "Gym", bodyweight: "Bodyweight", bands: "Bands", cardio: "Cardio", sport: "Sport", yoga: "Yoga" };

/** "Gym · 5 exercises · 42 min" or "Bands · Chest, Back · 30 min". */
export function workoutPostBody(kind: WorkoutKind, exercises: WorkoutExercise[] | null, muscles: string[], minutes: number | null): string {
  const parts = [KIND_LABEL[kind] ?? "Workout"];
  if (exercises?.length) parts.push(`${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`);
  else if (muscles.length) parts.push(muscles.slice(0, 3).join(", "));
  if (minutes && minutes > 0) parts.push(`${minutes} min`);
  return parts.join(" · ");
}

type Best = { kg: number; reps: number };

function bestSet(x: WorkoutExercise): Best | null {
  let best: Best | null = null;
  for (const s of x.sets ?? []) {
    const kg = Number(s.kg ?? 0);
    const reps = Number(s.reps ?? 0);
    if (!(reps > 0) || !(kg > 0)) continue;
    if (!best || kg > best.kg || (kg === best.kg && reps > best.reps)) best = { kg, reps };
  }
  return best;
}

/**
 * New gym PRs in `current` against every earlier session's best (same exercise name, any case):
 * heavier, or the same weight for more reps. An exercise with no history is not a PR (first
 * sessions would all be "PRs"). Returns "🏆 Bench press 45 kg × 8 · Squat 60 kg × 5", or null.
 */
export function prPostBody(current: WorkoutExercise[], previous: (WorkoutExercise[] | null)[]): string | null {
  const prior = new Map<string, Best>();
  for (const list of previous) {
    for (const x of list ?? []) {
      const b = bestSet(x);
      if (!b) continue;
      const key = x.name.trim().toLowerCase();
      const cur = prior.get(key);
      if (!cur || b.kg > cur.kg || (b.kg === cur.kg && b.reps > cur.reps)) prior.set(key, b);
    }
  }
  const lines: string[] = [];
  for (const x of current) {
    const b = bestSet(x);
    const was = prior.get(x.name.trim().toLowerCase());
    if (!b || !was) continue;
    if (b.kg > was.kg || (b.kg === was.kg && b.reps > was.reps)) lines.push(`${x.name.trim()} ${trimNum(b.kg)} kg × ${b.reps}`);
  }
  return lines.length ? `🏆 ${lines.slice(0, 3).join(" · ")}` : null;
}
