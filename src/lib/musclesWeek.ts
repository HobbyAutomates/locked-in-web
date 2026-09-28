import { REGIONS, type Region } from "./muscles";
import type { RegionSets } from "./training";

/**
 * v2.17 "Muscles this week" (Progress, right after the weight card): the 18 map regions folded into
 * six plain-word groups for the one-line summary, "Chest, back, legs · 4 sessions". Pure; checked
 * by scripts/check-v217.ts. Android: the same groups and wording.
 */
export const MUSCLE_GROUPS: { key: string; label: string; regions: Region[] }[] = [
  { key: "chest", label: "Chest", regions: ["chest"] },
  { key: "back", label: "Back", regions: ["lats", "upper_back", "lower_back", "traps"] },
  { key: "shoulders", label: "Shoulders", regions: ["front_delts", "side_delts", "rear_delts"] },
  { key: "arms", label: "Arms", regions: ["biceps", "triceps", "forearms"] },
  { key: "core", label: "Core", regions: ["abs", "obliques"] },
  { key: "legs", label: "Legs", regions: ["quads", "hamstrings", "glutes", "calves", "adductors"] },
];

/** The groups with any sets this week, in MUSCLE_GROUPS order. */
export function trainedGroups(sets: Partial<RegionSets>): string[] {
  return MUSCLE_GROUPS.filter((g) => g.regions.some((r) => (sets[r] ?? 0) > 0)).map((g) => g.label);
}

/** "Chest, back, legs · 4 sessions"; just "2 sessions" when none map to a muscle; "Nothing trained yet this week". */
export function musclesWeekLine(sets: Partial<RegionSets>, sessions: number): string {
  const groups = trainedGroups(sets);
  const n = Math.max(0, Math.round(sessions));
  if (!groups.length && !n) return "Nothing trained yet this week";
  const count = `${n} session${n === 1 ? "" : "s"}`;
  if (!groups.length) return count;
  const words = groups.map((g, i) => (i ? g.toLowerCase() : g)).join(", ");
  return n ? `${words} · ${count}` : words;
}

/** Regions with any sets, in map order. */
export function trainedRegions(sets: Partial<RegionSets>): Region[] {
  return REGIONS.filter((r) => (sets[r] ?? 0) > 0);
}
