/**
 * Calories burned from the 2024 Compendium of Physical Activities MET table (bandlog.activities):
 * kcal = MET × body weight (kg) × hours. Intensity nudges the MET by ±15%. Mirrors the Android
 * app's util/Burn.kt so a session logged on either surface lands on the same number.
 */

export type Intensity = "low" | "medium" | "high";

/** Used when the profile has no weight yet. */
export const DEFAULT_WEIGHT_KG = 60;

/** Compendium 12150 "running, general". */
export const RUN_CODE = "12150";
export const RUN_MET = 8.3;

export const INTENSITIES: { key: Intensity; label: string; sub: string }[] = [
  { key: "high", label: "High", sub: "Training to failure, breathing heavily" },
  { key: "medium", label: "Medium", sub: "Breaking a sweat" },
  { key: "low", label: "Low", sub: "Not breaking a sweat" },
];

export const DURATIONS = [15, 30, 60, 90];

const round1 = (v: number) => Math.round(v * 10) / 10;

export function multiplier(intensity: string): number {
  return intensity === "low" ? 0.85 : intensity === "high" ? 1.15 : 1;
}

export function burnKcal(met: number, weightKg: number | null | undefined, minutes: number, intensity: string = "medium"): number {
  return round1((met * multiplier(intensity) * (weightKg ?? DEFAULT_WEIGHT_KG) * Math.max(0, minutes)) / 60);
}

// ---- band workouts: one row per level, intensity already baked into the MET ----

export function bandCode(level: string) {
  return level === "Light" ? "LI-BAND-L" : level === "Heavy" ? "LI-BAND-H" : "LI-BAND-M";
}
export function bandMet(level: string) {
  return level === "Light" ? 3.5 : level === "Heavy" ? 6 : 5;
}
export function bandIntensity(level: string): Intensity {
  return level === "Light" ? "low" : level === "Heavy" ? "high" : "medium";
}
export function bandLevel(intensity: string) {
  return intensity === "low" ? "Light" : intensity === "high" ? "Heavy" : "Medium";
}
export function bandKcal(level: string, weightKg: number | null | undefined, minutes: number) {
  return round1((bandMet(level) * (weightKg ?? DEFAULT_WEIGHT_KG) * Math.max(0, minutes)) / 60);
}

export function intensityLabel(intensity: string) {
  return intensity === "low" ? "Low" : intensity === "high" ? "High" : "Medium";
}
