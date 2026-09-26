export const MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Other",
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_COLOR: Record<Muscle, string> = {
  Chest: "#E76F51",
  Back: "#2A9D8F",
  Shoulders: "#E0A100",
  Biceps: "#7C5CFC",
  Triceps: "#3B82F6",
  Forearms: "#0EA5A4",
  Core: "#E0559A",
  Glutes: "#F97316",
  Quads: "#43A047",
  Hamstrings: "#84CC16",
  Calves: "#A16207",
  Other: "#94A3B8",
};

export const BAND_LEVELS = ["Light", "Medium", "Heavy"] as const;
export type BandLevel = (typeof BAND_LEVELS)[number];
export const BAND_COLOR: Record<BandLevel, string> = { Light: "#F2C230", Medium: "#E5484D", Heavy: "#64748B" };

// ---------------------------------------------------------------------------------------------
// v2.13 muscle map (spec §12). The canonical exercise → primary / secondary mapping for the built-in
// exercise library (lib/exercises.ts), standard kinesiology. Android copies REGIONS and
// EXERCISE_MUSCLES verbatim into util/Muscles.kt, so keep this a plain data table: one line per
// exercise, names exactly as in EXERCISES, regions from REGIONS only.
// ---------------------------------------------------------------------------------------------

export const REGIONS = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "traps",
  "lats",
  "upper_back",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "adductors",
] as const;

export type Region = (typeof REGIONS)[number];

export const REGION_LABEL: Record<Region, string> = {
  chest: "Chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  traps: "Traps",
  lats: "Lats",
  upper_back: "Upper back",
  lower_back: "Lower back",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  adductors: "Adductors",
};

export type MuscleSplit = { primary: Region[]; secondary: Region[] };

export const EXERCISE_MUSCLES: Record<string, MuscleSplit> = {
  // Chest
  "Bench press": { primary: ["chest"], secondary: ["front_delts", "triceps"] },
  "Incline bench press": { primary: ["chest", "front_delts"], secondary: ["triceps"] },
  "Dumbbell bench press": { primary: ["chest"], secondary: ["front_delts", "triceps"] },
  "Incline dumbbell press": { primary: ["chest", "front_delts"], secondary: ["triceps"] },
  "Chest fly": { primary: ["chest"], secondary: ["front_delts"] },
  "Chest press machine": { primary: ["chest"], secondary: ["front_delts", "triceps"] },
  "Push-up": { primary: ["chest"], secondary: ["front_delts", "triceps", "abs"] },
  Dips: { primary: ["chest", "triceps"], secondary: ["front_delts"] },
  // Back
  Deadlift: { primary: ["hamstrings", "glutes", "lower_back"], secondary: ["traps", "quads", "forearms", "lats", "upper_back"] },
  "Romanian deadlift": { primary: ["hamstrings", "glutes"], secondary: ["lower_back", "forearms"] },
  "Pull-up": { primary: ["lats"], secondary: ["biceps", "upper_back", "rear_delts", "forearms"] },
  "Chin-up": { primary: ["lats", "biceps"], secondary: ["upper_back", "forearms"] },
  "Lat pulldown": { primary: ["lats"], secondary: ["biceps", "upper_back", "rear_delts"] },
  "Barbell row": { primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps", "lower_back", "forearms"] },
  "Dumbbell row": { primary: ["lats", "upper_back"], secondary: ["rear_delts", "biceps"] },
  "Seated cable row": { primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"] },
  "T-bar row": { primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps", "lower_back"] },
  "Inverted row": { primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"] },
  "Back extension": { primary: ["lower_back"], secondary: ["glutes", "hamstrings"] },
  // Shoulders
  "Overhead press": { primary: ["front_delts"], secondary: ["side_delts", "triceps", "traps"] },
  "Dumbbell shoulder press": { primary: ["front_delts"], secondary: ["side_delts", "triceps"] },
  "Lateral raise": { primary: ["side_delts"], secondary: ["traps"] },
  "Front raise": { primary: ["front_delts"], secondary: ["side_delts"] },
  "Rear delt fly": { primary: ["rear_delts"], secondary: ["upper_back"] },
  "Face pull": { primary: ["rear_delts"], secondary: ["upper_back", "traps"] },
  Shrug: { primary: ["traps"], secondary: ["forearms"] },
  "Pike push-up": { primary: ["front_delts"], secondary: ["triceps", "side_delts"] },
  // Arms
  "Barbell curl": { primary: ["biceps"], secondary: ["forearms"] },
  "Dumbbell curl": { primary: ["biceps"], secondary: ["forearms"] },
  "Hammer curl": { primary: ["biceps", "forearms"], secondary: [] },
  "Preacher curl": { primary: ["biceps"], secondary: [] },
  "Cable curl": { primary: ["biceps"], secondary: ["forearms"] },
  "Tricep pushdown": { primary: ["triceps"], secondary: [] },
  "Skull crusher": { primary: ["triceps"], secondary: [] },
  "Overhead tricep extension": { primary: ["triceps"], secondary: [] },
  "Close-grip bench press": { primary: ["triceps", "chest"], secondary: ["front_delts"] },
  "Diamond push-up": { primary: ["triceps"], secondary: ["chest", "front_delts"] },
  "Wrist curl": { primary: ["forearms"], secondary: [] },
  // Legs
  Squat: { primary: ["quads", "glutes"], secondary: ["adductors", "hamstrings", "lower_back"] },
  "Front squat": { primary: ["quads"], secondary: ["glutes", "abs", "upper_back"] },
  "Goblet squat": { primary: ["quads", "glutes"], secondary: ["adductors", "abs"] },
  "Bodyweight squat": { primary: ["quads", "glutes"], secondary: ["adductors"] },
  "Leg press": { primary: ["quads", "glutes"], secondary: ["adductors", "hamstrings"] },
  Lunge: { primary: ["quads", "glutes"], secondary: ["hamstrings", "adductors"] },
  "Bulgarian split squat": { primary: ["quads", "glutes"], secondary: ["adductors", "hamstrings"] },
  "Leg extension": { primary: ["quads"], secondary: [] },
  "Leg curl": { primary: ["hamstrings"], secondary: ["calves"] },
  "Hip thrust": { primary: ["glutes"], secondary: ["hamstrings"] },
  "Calf raise": { primary: ["calves"], secondary: [] },
  "Step-up": { primary: ["quads", "glutes"], secondary: ["hamstrings"] },
  "Jump squat": { primary: ["quads", "glutes"], secondary: ["calves"] },
  // Core
  Plank: { primary: ["abs"], secondary: ["obliques"] },
  Crunch: { primary: ["abs"], secondary: [] },
  "Sit-up": { primary: ["abs"], secondary: ["obliques"] },
  "Hanging leg raise": { primary: ["abs"], secondary: ["obliques", "forearms"] },
  "Russian twist": { primary: ["obliques"], secondary: ["abs"] },
  "Mountain climber": { primary: ["abs"], secondary: ["front_delts", "quads"] },
  "Cable crunch": { primary: ["abs"], secondary: ["obliques"] },
  "Ab wheel rollout": { primary: ["abs"], secondary: ["lats", "obliques"] },
  // Full body
  Burpee: { primary: ["quads", "chest"], secondary: ["front_delts", "triceps", "abs"] },
  "Kettlebell swing": { primary: ["glutes", "hamstrings"], secondary: ["lower_back", "front_delts", "abs"] },
  "Clean and press": { primary: ["front_delts", "glutes", "quads"], secondary: ["traps", "triceps", "hamstrings", "upper_back"] },
  "Farmer's walk": { primary: ["forearms", "traps"], secondary: ["abs", "obliques", "glutes"] },
  "Jumping jacks": { primary: ["calves"], secondary: ["glutes", "side_delts"] },
};

/** The older coarse muscle groups (workouts.muscles) → map regions, for exercises not in the table. */
export const LEGACY_REGIONS: Record<Muscle, Region[]> = {
  Chest: ["chest"],
  Back: ["lats", "upper_back"],
  Shoulders: ["front_delts", "side_delts"],
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Forearms: ["forearms"],
  Core: ["abs", "obliques"],
  Glutes: ["glutes"],
  Quads: ["quads"],
  Hamstrings: ["hamstrings"],
  Calves: ["calves"],
  Other: [],
};

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const BY_NORM = new Map(Object.entries(EXERCISE_MUSCLES).map(([k, v]) => [normName(k), v]));

/** Primary / secondary regions of an exercise by name (case and punctuation don't matter), or null. */
export function musclesForExercise(name: string): MuscleSplit | null {
  return BY_NORM.get(normName(name)) ?? null;
}
