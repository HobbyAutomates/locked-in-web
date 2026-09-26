/**
 * v2.13 training (spec §12): routines, templates, today's session, and the weekly "muscles trained"
 * count. Pure; scripts/check-muscles.ts covers it and Android's util/Training.kt ports it 1:1.
 */
import { EXERCISES, exerciseDef } from "./exercises";
import { LEGACY_REGIONS, REGIONS, musclesForExercise, type Muscle, type MuscleSplit, type Region } from "./muscles";
import { parseIso } from "./dates";
import type { Workout } from "./types";

// ---------------------------------------------------------------- regions of an exercise

/** Table first; else the library's coarse muscles (first = primary, rest = secondary); else nothing. */
export function regionsFor(name: string): MuscleSplit {
  const hit = musclesForExercise(name);
  if (hit) return hit;
  const def = exerciseDef(name);
  if (!def) return { primary: [], secondary: [] };
  const [first, ...rest] = def.muscles;
  const primary = first ? LEGACY_REGIONS[first] : [];
  const secondary = rest.flatMap((m) => LEGACY_REGIONS[m]).filter((r) => !primary.includes(r));
  return { primary, secondary: [...new Set(secondary)] };
}

// ---------------------------------------------------------------- weekly sets per muscle

/** A primary muscle gets 1 set per working set, a secondary muscle half a set (the usual convention). */
export const SECONDARY_WEIGHT = 0.5;
/** A band session has no per-exercise sets: each muscle it lists counts as this many sets. */
export const BAND_SESSION_SETS = 3;
/** Evidence-based hypertrophy volume per muscle per week (Schoenfeld 2017; Israetel MEV–MRV). */
export const WEEKLY_SETS_LOW = 10;
export const WEEKLY_SETS_HIGH = 20;

export type RegionSets = Record<Region, number>;

export function emptyRegionSets(): RegionSets {
  return Object.fromEntries(REGIONS.map((r) => [r, 0])) as RegionSets;
}

/** Sets per region over workouts dated from..to (inclusive). */
export function regionSets(workouts: Pick<Workout, "date" | "muscles" | "kind" | "exercises_json">[], from: string, to: string): RegionSets {
  const out = emptyRegionSets();
  for (const w of workouts) {
    if (w.date < from || w.date > to) continue;
    const list = w.exercises_json ?? [];
    if (list.length) {
      for (const x of list) {
        const n = x.sets.filter((s) => (Number(s.reps) || 0) > 0).length;
        if (!n) continue;
        const split = regionsFor(x.name);
        for (const r of split.primary) out[r] += n;
        for (const r of split.secondary) out[r] += n * SECONDARY_WEIGHT;
      }
    } else if ((w.kind ?? "bands") === "bands") {
      const regions = new Set<Region>();
      for (const m of w.muscles ?? []) for (const r of LEGACY_REGIONS[m as Muscle] ?? []) regions.add(r);
      for (const r of regions) out[r] += BAND_SESSION_SETS;
    }
  }
  for (const r of REGIONS) out[r] = Math.round(out[r] * 10) / 10;
  return out;
}

export type VolumeBand = "none" | "low" | "good" | "high";

export function volumeBand(sets: number): VolumeBand {
  if (sets <= 0) return "none";
  if (sets < WEEKLY_SETS_LOW) return "low";
  if (sets <= WEEKLY_SETS_HIGH) return "good";
  return "high";
}

/** 0..1 heat for the map: 20 sets (the top of the guideline) is full colour. */
export function heat(sets: number): number {
  return Math.max(0, Math.min(1, sets / WEEKLY_SETS_HIGH));
}

// ---------------------------------------------------------------- routines

export type RoutineExercise = { name: string; sets: number; reps: number; rest_s: number; muscles: Region[] };
/** weekday: 1 = Monday … 7 = Sunday, or null (not pinned to a day). */
export type RoutineDay = { weekday: number | null; name: string; exercises: RoutineExercise[] };
export type Routine = { id: string; name: string; days: RoutineDay[]; active: boolean; updated_at: string | null };

export const DEFAULT_REST_S = 90;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

export function makeExercise(name: string, sets = 3, reps = 10, rest_s = DEFAULT_REST_S): RoutineExercise {
  return { name, sets, reps, rest_s, muscles: regionsFor(name).primary };
}

/** Cleans a routines.days value from the database (or a form) into well-formed days. */
export function normalizeDays(raw: unknown): RoutineDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 7).map((d, i) => {
    const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const wd = o.weekday == null ? null : clampInt(o.weekday, 1, 7, 1);
    const exercises = (Array.isArray(o.exercises) ? o.exercises : [])
      .slice(0, 20)
      .map((x) => {
        const e = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        const name = String(e.name ?? "").trim().slice(0, 60);
        return { name, sets: clampInt(e.sets, 1, 10, 3), reps: clampInt(e.reps, 1, 100, 10), rest_s: clampInt(e.rest_s, 15, 600, DEFAULT_REST_S), muscles: regionsFor(name).primary };
      })
      .filter((e) => e.name);
    return { weekday: wd, name: String(o.name ?? "").trim().slice(0, 40) || `Day ${i + 1}`, exercises };
  });
}

/** 1 = Monday … 7 = Sunday for a yyyy-MM-dd date. */
export function isoWeekday(date: string): number {
  const d = parseIso(date).getDay();
  return d === 0 ? 7 : d;
}

/** The day of `routine` pinned to `date`'s weekday, or null (rest day / nothing pinned). */
export function todaysDay(routine: Pick<Routine, "days"> | null, date: string): { index: number; day: RoutineDay } | null {
  if (!routine) return null;
  const wd = isoWeekday(date);
  const index = routine.days.findIndex((d) => d.weekday === wd && d.exercises.length > 0);
  return index >= 0 ? { index, day: routine.days[index] } : null;
}

/** Primary + secondary regions a routine day trains (for its muscle map). */
export function dayRegions(day: RoutineDay): MuscleSplit {
  const primary = new Set<Region>();
  const secondary = new Set<Region>();
  for (const x of day.exercises) {
    const s = regionsFor(x.name);
    s.primary.forEach((r) => primary.add(r));
    s.secondary.forEach((r) => secondary.add(r));
  }
  return { primary: [...primary], secondary: [...secondary].filter((r) => !primary.has(r)) };
}

const day = (weekday: number | null, name: string, list: [string, number, number, number?][]): RoutineDay => ({
  weekday,
  name,
  exercises: list.map(([n, s, r, rest]) => makeExercise(n, s, r, rest ?? DEFAULT_REST_S)),
});

const PUSH: [string, number, number, number?][] = [
  ["Bench press", 4, 6, 150],
  ["Overhead press", 3, 8, 120],
  ["Incline dumbbell press", 3, 10],
  ["Lateral raise", 3, 15, 60],
  ["Tricep pushdown", 3, 12, 60],
];
const PULL: [string, number, number, number?][] = [
  ["Deadlift", 3, 5, 180],
  ["Pull-up", 3, 8, 120],
  ["Barbell row", 3, 10],
  ["Face pull", 3, 15, 60],
  ["Barbell curl", 3, 12, 60],
];
const LEGS: [string, number, number, number?][] = [
  ["Squat", 4, 6, 180],
  ["Romanian deadlift", 3, 10, 120],
  ["Leg press", 3, 12],
  ["Leg curl", 3, 12, 60],
  ["Calf raise", 4, 15, 60],
];

/** The four starter templates (spec §12). Weekdays: 1 = Monday. */
export const TEMPLATES: { key: string; name: string; sub: string; days: RoutineDay[] }[] = [
  {
    key: "ppl",
    name: "Push / Pull / Legs",
    sub: "6 days · each muscle twice a week",
    days: [day(1, "Push", PUSH), day(2, "Pull", PULL), day(3, "Legs", LEGS), day(4, "Push", PUSH), day(5, "Pull", PULL), day(6, "Legs", LEGS)],
  },
  {
    key: "upper_lower",
    name: "Upper / Lower",
    sub: "4 days · balanced and simple",
    days: [
      day(1, "Upper", [["Bench press", 4, 6, 150], ["Barbell row", 4, 8, 120], ["Overhead press", 3, 8, 120], ["Lat pulldown", 3, 10], ["Dumbbell curl", 2, 12, 60], ["Tricep pushdown", 2, 12, 60]]),
      day(2, "Lower", [["Squat", 4, 6, 180], ["Romanian deadlift", 3, 8, 120], ["Leg press", 3, 12], ["Leg curl", 3, 12, 60], ["Calf raise", 3, 15, 60]]),
      day(4, "Upper", [["Incline bench press", 4, 8, 120], ["Seated cable row", 3, 10], ["Dumbbell shoulder press", 3, 10], ["Pull-up", 3, 8, 120], ["Hammer curl", 2, 12, 60], ["Skull crusher", 2, 12, 60]]),
      day(5, "Lower", [["Deadlift", 3, 5, 180], ["Bulgarian split squat", 3, 10], ["Hip thrust", 3, 10], ["Leg extension", 3, 12, 60], ["Hanging leg raise", 3, 12, 60]]),
    ],
  },
  {
    key: "full_body",
    name: "Full body 3×",
    sub: "3 days · great for beginners",
    days: [
      day(1, "Full body A", [["Squat", 3, 8, 150], ["Bench press", 3, 8, 150], ["Barbell row", 3, 10], ["Plank", 3, 30, 60]]),
      day(3, "Full body B", [["Deadlift", 3, 5, 180], ["Overhead press", 3, 8, 120], ["Lat pulldown", 3, 10], ["Lunge", 3, 10]]),
      day(5, "Full body C", [["Leg press", 3, 12], ["Dumbbell bench press", 3, 10], ["Dumbbell row", 3, 10], ["Hanging leg raise", 3, 12, 60]]),
    ],
  },
  {
    key: "bro_split",
    name: "Bro split",
    sub: "5 days · one muscle group a day",
    days: [
      day(1, "Chest", [["Bench press", 4, 8, 150], ["Incline dumbbell press", 3, 10], ["Chest fly", 3, 12, 60], ["Dips", 3, 10]]),
      day(2, "Back", [["Deadlift", 3, 5, 180], ["Pull-up", 3, 8, 120], ["Seated cable row", 3, 10], ["Dumbbell row", 3, 10]]),
      day(3, "Shoulders", [["Overhead press", 4, 8, 120], ["Lateral raise", 4, 15, 60], ["Rear delt fly", 3, 15, 60], ["Shrug", 3, 12, 60]]),
      day(4, "Arms", [["Barbell curl", 3, 10, 60], ["Close-grip bench press", 3, 8], ["Hammer curl", 3, 12, 60], ["Overhead tricep extension", 3, 12, 60]]),
      day(5, "Legs", [["Squat", 4, 6, 180], ["Leg press", 3, 12], ["Leg curl", 3, 12, 60], ["Calf raise", 4, 15, 60]]),
    ],
  },
];

/** Every template exercise must be in the library (checked by scripts/check-muscles.ts). */
export function templateNamesMissing(): string[] {
  const names = new Set(EXERCISES.map((e) => e.name));
  return [...new Set(TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((x) => x.name))))].filter((n) => !names.has(n));
}

/** Total working sets in a day (the Today's session card). */
export function daySets(d: RoutineDay): number {
  return d.exercises.reduce((a, x) => a + x.sets, 0);
}

/** Rough minutes: 40 s per set, the rests between sets, 2 min to set up each exercise; rounded to 5. */
export function dayMinutes(d: RoutineDay): number {
  const secs = d.exercises.reduce((a, x) => a + 120 + x.sets * 40 + Math.max(0, x.sets - 1) * x.rest_s, 0);
  return Math.max(5, Math.round(secs / 60 / 5) * 5);
}
