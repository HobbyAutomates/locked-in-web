/**
 * v2.13 body measurements and progress photos (spec §11). Pure helpers; the data loaders are in
 * platform-data.ts and the writes in platformActions.ts.
 */
import { daysBetween } from "./dates";
import type { WeightEntry } from "./types";

export const MEASURES = [
  { key: "waist_cm", label: "Waist", unit: "cm" },
  { key: "chest_cm", label: "Chest", unit: "cm" },
  { key: "hips_cm", label: "Hips", unit: "cm" },
  { key: "neck_cm", label: "Neck", unit: "cm" },
  { key: "arm_cm", label: "Arm", unit: "cm" },
  { key: "thigh_cm", label: "Thigh", unit: "cm" },
  { key: "calf_cm", label: "Calf", unit: "cm" },
  { key: "body_fat_pct", label: "Body fat", unit: "%" },
] as const;

export type MeasureKey = (typeof MEASURES)[number]["key"];

export type Measurement = { id: string; date: string; note: string } & Record<MeasureKey, number | null>;

/** Sensible ranges (cm / %). Outside them the entry sheet asks for a re-check; the DB checks body fat 2–70. */
export const MEASURE_RANGE: Record<MeasureKey, [number, number]> = {
  waist_cm: [40, 200],
  chest_cm: [50, 200],
  hips_cm: [50, 200],
  neck_cm: [20, 70],
  arm_cm: [15, 70],
  thigh_cm: [25, 110],
  calf_cm: [20, 70],
  body_fat_pct: [2, 70],
};

const num1 = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

export function parseMeasurement(r: Record<string, unknown>): Measurement {
  const out = { id: String(r.id ?? ""), date: String(r.date ?? "").slice(0, 10), note: typeof r.note === "string" ? r.note : "" } as Measurement;
  for (const m of MEASURES) out[m.key] = num1(r[m.key]);
  return out;
}

/** Validates an entry: at least one value, every value inside its range. Returns an error or null. */
export function measurementError(values: Partial<Record<MeasureKey, number | null>>): string | null {
  let any = false;
  for (const m of MEASURES) {
    const v = values[m.key];
    if (v == null) continue;
    any = true;
    const [lo, hi] = MEASURE_RANGE[m.key];
    if (!(v >= lo && v <= hi)) return `${m.label} should be between ${lo} and ${hi} ${m.unit}`;
  }
  return any ? null : "Enter at least one measurement";
}

/** The newest waist (by date, then entry order), else the profile's saved waist, else null. */
export function latestWaist(list: Pick<Measurement, "date" | "waist_cm">[], fallback: number | null): number | null {
  let best: { date: string; v: number } | null = null;
  for (const m of list) if (m.waist_cm != null && (!best || m.date >= best.date)) best = { date: m.date, v: m.waist_cm };
  return best?.v ?? fallback;
}

/** One measure over time, oldest first (several a day: the last one wins). */
export function series(list: Measurement[], key: MeasureKey): { date: string; value: number }[] {
  const byDate = new Map<string, number>();
  const asc = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const m of asc) if (m[key] != null) byDate.set(m.date, m[key] as number);
  return [...byDate.entries()].map(([date, value]) => ({ date, value }));
}

// ---------------------------------------------------------------- photos

export const POSES = ["front", "side", "back", "other"] as const;
export type Pose = (typeof POSES)[number];
export const POSE_LABEL: Record<Pose, string> = { front: "Front", side: "Side", back: "Back", other: "Other" };

export type Photo = { id: string; date: string; path: string; note: string; url: string | null; weight_kg: number | null; pose: Pose | null };

export function parsePose(v: unknown): Pose | null {
  return POSES.includes(v as Pose) ? (v as Pose) : null;
}

/** "September 2026" groups, newest month first, photos newest first inside each. */
export function byMonth<T extends { date: string }>(photos: T[]): { key: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  const sorted = [...photos].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const p of sorted) {
    const k = p.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const [y, m] = key.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return { key, label, items };
  });
}

/** Weight on a photo: its own weight_kg, else the nearest weigh-in within 7 days of its date. */
export function photoWeight(p: Pick<Photo, "date" | "weight_kg">, weights: Pick<WeightEntry, "date" | "weight_kg">[]): number | null {
  if (p.weight_kg != null) return p.weight_kg;
  let best: { d: number; kg: number } | null = null;
  for (const w of weights) {
    const d = Math.abs(daysBetween(w.date, p.date));
    if (d <= 7 && (!best || d < best.d)) best = { d, kg: w.weight_kg };
  }
  return best?.kg ?? null;
}

/** Before/after facts: the older photo is "before" whichever order they were picked in. */
export function compare<T extends Pick<Photo, "date" | "weight_kg">>(a: T, b: T, weights: Pick<WeightEntry, "date" | "weight_kg">[]): { before: T; after: T; days: number; weightDelta: number | null } {
  const [before, after] = a.date <= b.date ? [a, b] : [b, a];
  const wb = photoWeight(before, weights);
  const wa = photoWeight(after, weights);
  return { before, after, days: daysBetween(before.date, after.date), weightDelta: wb != null && wa != null ? Math.round((wa - wb) * 10) / 10 : null };
}
