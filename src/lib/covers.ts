/**
 * v2.16 profile covers (boards CoverPicker + CoverPresets): 17 vector motifs x light / dark = 34.
 * The ids are shared with Android (docs/v216-shared.md) and stored in `profiles.cover_preset`
 * (schema_v40). #01 "plates-light" is today's plates cover and the default; an unknown or empty id
 * falls back to it. Pure data, no React.
 */

export type CoverCategory = "iron" | "cardio" | "outdoor" | "studio" | "minimal";

export const COVER_CATEGORIES: { key: CoverCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "iron", label: "Iron" },
  { key: "cardio", label: "Cardio" },
  { key: "outdoor", label: "Outdoor" },
  { key: "studio", label: "Studio" },
  { key: "minimal", label: "Minimal" },
];

/** The 17 motifs in board order. Each one comes as #(2k+1) light and #(2k+2) dark. */
const MOTIFS: { slug: string; name: string; category: CoverCategory }[] = [
  { slug: "plates", name: "Plates", category: "iron" },
  { slug: "dumbbells", name: "Dumbbells", category: "iron" },
  { slug: "barbell", name: "Barbell", category: "iron" },
  { slug: "kettlebells", name: "Kettlebells", category: "iron" },
  { slug: "track", name: "Track", category: "cardio" },
  { slug: "chalk", name: "Chalk", category: "studio" },
  { slug: "ropes", name: "Battle ropes", category: "cardio" },
  { slug: "summit", name: "Summit", category: "outdoor" },
  { slug: "pool", name: "Pool lanes", category: "outdoor" },
  { slug: "heartbeat", name: "Heartbeat", category: "cardio" },
  { slug: "trail", name: "Trail map", category: "outdoor" },
  { slug: "grid", name: "Studio grid", category: "minimal" },
  { slug: "yoga", name: "Yoga mat", category: "studio" },
  { slug: "rings", name: "Rings", category: "studio" },
  { slug: "ride", name: "Ride", category: "cardio" },
  { slug: "court", name: "Court", category: "outdoor" },
  { slug: "ember", name: "Ember", category: "minimal" },
];

export type CoverPreset = {
  /** Stable id stored in profiles.cover_preset, e.g. "plates-light". */
  id: string;
  /** 1-based board number (1..34). */
  n: number;
  name: string;
  tone: "light" | "dark";
  category: CoverCategory;
};

export const COVER_PRESETS: CoverPreset[] = MOTIFS.flatMap((m, k) =>
  (["light", "dark"] as const).map((tone, j) => ({ id: `${m.slug}-${tone}`, n: 2 * k + j + 1, name: m.name, tone, category: m.category })),
);

export const DEFAULT_COVER = "plates-light";

/** The preset for a stored id; anything unknown (or null) is the default plates cover. */
export function coverPreset(id: string | null | undefined): CoverPreset {
  return COVER_PRESETS.find((c) => c.id === id) ?? COVER_PRESETS[0];
}

export function isCoverId(id: unknown): id is string {
  return typeof id === "string" && COVER_PRESETS.some((c) => c.id === id);
}

/** Local fallback until schema_v40 is applied (and a cache for a fast first paint). */
export const COVER_STORAGE_KEY = "li-cover-preset";
