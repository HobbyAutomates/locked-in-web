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
