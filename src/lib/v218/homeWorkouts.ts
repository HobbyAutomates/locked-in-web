import { DEFAULT_REST_S, makeExercise, type RoutineDay } from "../training";

/**
 * v2.18 C1 home and hostel workouts: no-equipment and band-only plans (beginner / intermediate)
 * that drop into the routine planner like the gym templates. Every exercise is in the library
 * (lib/exercises.ts) so the muscle map and PR charts work. Android: util/HomeWorkouts.kt.
 * Timed moves (plank) use reps as seconds, like the gym templates.
 */

export type HomeTemplate = { key: string; name: string; sub: string; equipment: "none" | "band"; level: "beginner" | "intermediate"; days: RoutineDay[] };

type Row = [string, number, number, number?];
const day = (weekday: number, name: string, list: Row[]): RoutineDay => ({ weekday, name, exercises: list.map(([n, s, r, rest]) => makeExercise(n, s, r, rest ?? DEFAULT_REST_S)) });

export const HOME_TEMPLATES: HomeTemplate[] = [
  {
    key: "home_beginner",
    name: "Hostel room · beginner",
    sub: "3 days · no equipment · 25 min",
    equipment: "none",
    level: "beginner",
    days: [
      day(1, "Full body A", [["Bodyweight squat", 3, 12, 60], ["Push-up", 3, 8, 75], ["Glute bridge", 3, 12, 60], ["Plank", 3, 30, 45]]),
      day(3, "Full body B", [["Lunge", 3, 10, 60], ["Pike push-up", 3, 6, 75], ["Superman", 3, 12, 45], ["Mountain climber", 3, 20, 45]]),
      day(5, "Full body C", [["Step-up", 3, 10, 60], ["Diamond push-up", 3, 6, 75], ["Glute bridge", 3, 15, 60], ["Crunch", 3, 15, 45]]),
    ],
  },
  {
    key: "home_intermediate",
    name: "No-equipment · intermediate",
    sub: "4 days · upper / lower · 35 min",
    equipment: "none",
    level: "intermediate",
    days: [
      day(1, "Upper", [["Push-up", 4, 15, 75], ["Pike push-up", 4, 10, 75], ["Dips", 3, 10, 75], ["Diamond push-up", 3, 12, 60], ["Plank", 3, 45, 45]]),
      day(2, "Lower", [["Bulgarian split squat", 4, 10, 75], ["Jump squat", 3, 12, 75], ["Glute bridge", 4, 15, 60], ["Calf raise", 4, 20, 45]]),
      day(4, "Upper + core", [["Push-up", 4, 12, 75], ["Inverted row", 4, 10, 75], ["Pike push-up", 3, 10, 75], ["Russian twist", 3, 20, 45], ["Mountain climber", 3, 30, 45]]),
      day(5, "Lower + conditioning", [["Lunge", 4, 12, 75], ["Step-up", 3, 12, 60], ["Burpee", 4, 10, 90], ["Superman", 3, 15, 45]]),
    ],
  },
  {
    key: "band_beginner",
    name: "Band only · beginner",
    sub: "3 days · one resistance band · 30 min",
    equipment: "band",
    level: "beginner",
    days: [
      day(1, "Full body A", [["Band squat", 3, 12, 60], ["Band row", 3, 12, 60], ["Band chest press", 3, 12, 60], ["Band pull-apart", 3, 15, 45]]),
      day(3, "Full body B", [["Band lateral walk", 3, 12, 45], ["Band overhead press", 3, 10, 60], ["Band curl", 3, 12, 45], ["Band tricep extension", 3, 12, 45]]),
      day(5, "Full body C", [["Band squat", 3, 15, 60], ["Band row", 3, 15, 60], ["Push-up", 3, 8, 75], ["Glute bridge", 3, 15, 45]]),
    ],
  },
  {
    key: "band_intermediate",
    name: "Band + bodyweight · intermediate",
    sub: "4 days · push / pull / legs / full · 40 min",
    equipment: "band",
    level: "intermediate",
    days: [
      day(1, "Push", [["Band chest press", 4, 12, 75], ["Push-up", 4, 15, 75], ["Band overhead press", 3, 12, 60], ["Band tricep extension", 3, 15, 45]]),
      day(2, "Pull", [["Band row", 4, 12, 75], ["Inverted row", 3, 10, 75], ["Band pull-apart", 3, 20, 45], ["Band curl", 3, 15, 45]]),
      day(4, "Legs", [["Band squat", 4, 15, 75], ["Bulgarian split squat", 3, 10, 75], ["Band lateral walk", 3, 15, 45], ["Glute bridge", 4, 15, 45]]),
      day(6, "Full body", [["Burpee", 3, 10, 90], ["Band row", 3, 15, 60], ["Push-up", 3, 15, 60], ["Lunge", 3, 12, 60], ["Plank", 3, 45, 45]]),
    ],
  },
];

export const isHomeTemplate = (key: string) => HOME_TEMPLATES.some((t) => t.key === key);
