import type { Muscle } from "./muscles";
import type { Workout, WorkoutExercise, WorkoutKind } from "./types";

/**
 * v2.5: the built-in exercise list behind Log → Workout → Gym / Bodyweight ("Add exercise").
 * `bw` = done with body weight (kg is optional / added load). Muscles feed the workout's muscle
 * list so Progress → rest-by-muscle keeps working for gym sessions too.
 */
export type ExerciseDef = { name: string; muscles: Muscle[]; bw?: boolean; aliases?: string[] };

export const EXERCISES: ExerciseDef[] = [
  // Chest
  { name: "Bench press", muscles: ["Chest", "Triceps", "Shoulders"], aliases: ["flat bench", "barbell bench"] },
  { name: "Incline bench press", muscles: ["Chest", "Shoulders", "Triceps"], aliases: ["incline press"] },
  { name: "Dumbbell bench press", muscles: ["Chest", "Triceps"], aliases: ["db press"] },
  { name: "Incline dumbbell press", muscles: ["Chest", "Shoulders"] },
  { name: "Chest fly", muscles: ["Chest"], aliases: ["pec fly", "pec deck", "cable fly"] },
  { name: "Chest press machine", muscles: ["Chest", "Triceps"] },
  { name: "Push-up", muscles: ["Chest", "Triceps", "Shoulders"], bw: true, aliases: ["pushup", "push ups"] },
  { name: "Dips", muscles: ["Chest", "Triceps"], bw: true, aliases: ["dip"] },
  // Back
  { name: "Deadlift", muscles: ["Back", "Hamstrings", "Glutes"] },
  { name: "Romanian deadlift", muscles: ["Hamstrings", "Glutes", "Back"], aliases: ["rdl"] },
  { name: "Pull-up", muscles: ["Back", "Biceps"], bw: true, aliases: ["pullup", "pull ups"] },
  { name: "Chin-up", muscles: ["Back", "Biceps"], bw: true, aliases: ["chinup"] },
  { name: "Lat pulldown", muscles: ["Back", "Biceps"], aliases: ["pulldown"] },
  { name: "Barbell row", muscles: ["Back", "Biceps"], aliases: ["bent over row"] },
  { name: "Dumbbell row", muscles: ["Back", "Biceps"], aliases: ["one arm row"] },
  { name: "Seated cable row", muscles: ["Back", "Biceps"], aliases: ["cable row"] },
  { name: "T-bar row", muscles: ["Back"] },
  { name: "Inverted row", muscles: ["Back", "Biceps"], bw: true, aliases: ["australian pull up"] },
  { name: "Back extension", muscles: ["Back", "Glutes"], bw: true, aliases: ["hyperextension"] },
  // Shoulders
  { name: "Overhead press", muscles: ["Shoulders", "Triceps"], aliases: ["ohp", "military press", "shoulder press"] },
  { name: "Dumbbell shoulder press", muscles: ["Shoulders", "Triceps"] },
  { name: "Lateral raise", muscles: ["Shoulders"], aliases: ["side raise"] },
  { name: "Front raise", muscles: ["Shoulders"] },
  { name: "Rear delt fly", muscles: ["Shoulders", "Back"], aliases: ["reverse fly"] },
  { name: "Face pull", muscles: ["Shoulders", "Back"] },
  { name: "Shrug", muscles: ["Back"], aliases: ["shrugs"] },
  { name: "Pike push-up", muscles: ["Shoulders", "Triceps"], bw: true },
  // Arms
  { name: "Barbell curl", muscles: ["Biceps"], aliases: ["bicep curl"] },
  { name: "Dumbbell curl", muscles: ["Biceps"], aliases: ["db curl"] },
  { name: "Hammer curl", muscles: ["Biceps", "Forearms"] },
  { name: "Preacher curl", muscles: ["Biceps"] },
  { name: "Cable curl", muscles: ["Biceps"] },
  { name: "Tricep pushdown", muscles: ["Triceps"], aliases: ["pushdown", "rope pushdown"] },
  { name: "Skull crusher", muscles: ["Triceps"], aliases: ["lying tricep extension"] },
  { name: "Overhead tricep extension", muscles: ["Triceps"] },
  { name: "Close-grip bench press", muscles: ["Triceps", "Chest"] },
  { name: "Diamond push-up", muscles: ["Triceps", "Chest"], bw: true },
  { name: "Wrist curl", muscles: ["Forearms"] },
  // Legs
  { name: "Squat", muscles: ["Quads", "Glutes"], aliases: ["back squat", "barbell squat"] },
  { name: "Front squat", muscles: ["Quads", "Glutes"] },
  { name: "Goblet squat", muscles: ["Quads", "Glutes"] },
  { name: "Bodyweight squat", muscles: ["Quads", "Glutes"], bw: true, aliases: ["air squat"] },
  { name: "Leg press", muscles: ["Quads", "Glutes"] },
  { name: "Lunge", muscles: ["Quads", "Glutes"], bw: true, aliases: ["lunges", "walking lunge"] },
  { name: "Bulgarian split squat", muscles: ["Quads", "Glutes"], bw: true },
  { name: "Leg extension", muscles: ["Quads"] },
  { name: "Leg curl", muscles: ["Hamstrings"], aliases: ["hamstring curl"] },
  { name: "Hip thrust", muscles: ["Glutes", "Hamstrings"], aliases: ["glute bridge"] },
  { name: "Calf raise", muscles: ["Calves"], bw: true, aliases: ["calf raises"] },
  { name: "Step-up", muscles: ["Quads", "Glutes"], bw: true },
  { name: "Jump squat", muscles: ["Quads", "Glutes", "Calves"], bw: true },
  // Core
  { name: "Plank", muscles: ["Core"], bw: true },
  { name: "Crunch", muscles: ["Core"], bw: true, aliases: ["crunches"] },
  { name: "Sit-up", muscles: ["Core"], bw: true, aliases: ["situps"] },
  { name: "Hanging leg raise", muscles: ["Core"], bw: true, aliases: ["leg raise"] },
  { name: "Russian twist", muscles: ["Core"], bw: true },
  { name: "Mountain climber", muscles: ["Core", "Shoulders"], bw: true, aliases: ["mountain climbers"] },
  { name: "Cable crunch", muscles: ["Core"] },
  { name: "Ab wheel rollout", muscles: ["Core"], bw: true },
  // Full body
  { name: "Burpee", muscles: ["Quads", "Chest", "Core"], bw: true, aliases: ["burpees"] },
  { name: "Kettlebell swing", muscles: ["Glutes", "Hamstrings", "Back"] },
  { name: "Clean and press", muscles: ["Shoulders", "Back", "Quads"] },
  { name: "Farmer's walk", muscles: ["Forearms", "Back", "Core"], aliases: ["farmers carry"] },
  { name: "Jumping jacks", muscles: ["Other"], bw: true },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Exercises matching `q` (name or alias, word-prefix), bodyweight moves first on the Bodyweight tab. */
export function searchExercises(q: string, kind: WorkoutKind, limit = 8): ExerciseDef[] {
  const n = norm(q);
  const pool = kind === "bodyweight" ? [...EXERCISES.filter((e) => e.bw), ...EXERCISES.filter((e) => !e.bw)] : EXERCISES;
  if (!n) return pool.slice(0, limit);
  const score = (e: ExerciseDef) => {
    const names = [e.name, ...(e.aliases ?? [])].map(norm);
    if (names.some((x) => x === n)) return 3;
    if (names.some((x) => x.startsWith(n))) return 2;
    if (names.some((x) => x.split(" ").some((w) => w.startsWith(n)) || x.includes(n))) return 1;
    return 0;
  };
  return pool
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
}

/** The popular picks shown before typing. */
export const POPULAR: Record<"gym" | "bodyweight", string[]> = {
  gym: ["Bench press", "Squat", "Deadlift", "Lat pulldown", "Overhead press", "Barbell row", "Dumbbell curl", "Tricep pushdown", "Leg press"],
  bodyweight: ["Push-up", "Pull-up", "Bodyweight squat", "Plank", "Lunge", "Dips", "Burpee", "Crunch", "Mountain climber"],
};

export function exerciseDef(name: string): ExerciseDef | undefined {
  const n = norm(name);
  return EXERCISES.find((e) => norm(e.name) === n);
}

/** Muscles a list of exercises trains (in the app's muscle order); "Other" when none are known. */
export function musclesOf(list: WorkoutExercise[], order: readonly Muscle[]): Muscle[] {
  const set = new Set<Muscle>();
  for (const x of list) for (const m of exerciseDef(x.name)?.muscles ?? []) set.add(m);
  const out = order.filter((m) => set.has(m));
  return out.length ? out : ["Other"];
}

/** Last time's sets for an exercise, from the newest session that had it. */
export function lastSets(history: Workout[], name: string): WorkoutExercise["sets"] | null {
  const n = norm(name);
  for (const w of history) {
    const hit = (w.exercises_json ?? []).find((x) => norm(x.name) === n);
    if (hit && hit.sets.length) return hit.sets;
  }
  return null;
}

/** "Bench press 3×8 @ 40 kg, Pull-up 3×10" — the legacy `exercises` text column, for old app versions. */
export function exercisesText(list: WorkoutExercise[]): string {
  return list
    .map((x) => {
      if (!x.sets.length) return x.name;
      const reps = x.sets.map((s) => s.reps);
      const same = reps.every((r) => r === reps[0]);
      const kg = Math.max(0, ...x.sets.map((s) => s.kg ?? 0));
      return `${x.name} ${same ? `${x.sets.length}×${reps[0]}` : reps.join("/")}${kg > 0 ? ` @ ${kg} kg` : ""}`;
    })
    .join(", ");
}

export const KIND_LABEL: Record<WorkoutKind, string> = { gym: "Gym", bodyweight: "Bodyweight", bands: "Bands", cardio: "Cardio", sport: "Sport", yoga: "Yoga" };

/** Home / Calendar row title: "Gym · 5 exercises", "Bands · Chest · Back". */
export function workoutTitle(w: Workout): string {
  const kind = (w.kind ?? "bands") as WorkoutKind;
  if (kind === "gym" || kind === "bodyweight") {
    const n = w.exercises_json?.length ?? 0;
    return `${KIND_LABEL[kind]} · ${n} exercise${n === 1 ? "" : "s"}`;
  }
  return [KIND_LABEL[kind], ...w.muscles].join(" · ");
}
