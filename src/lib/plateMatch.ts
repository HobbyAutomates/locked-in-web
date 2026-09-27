import { isAcceptableMatch, microsFor, type FoodHit } from "@/lib/foodSearch";
import { sourceInfoFor } from "@/lib/sourceInfo";
import type { PlateItem } from "@/lib/types";

/** Injected so scripts/check-match.ts can exercise this offline (no DB, no model). */
export type PlateMatchDeps = {
  search: (name: string, limit: number) => Promise<FoodHit[]>;
  live: (name: string) => Promise<FoodHit | null>;
};

/**
 * Cross-validate ONE plate item against the food table (keep the model's grams, take the table's
 * per-100 g). Used by `plateFromEstimate`, so both the standalone plateFlow and the fused
 * classifier path (/api/scan's `plate_estimate`) go through exactly the same rule:
 *
 *   A hit is only accepted when isAcceptableMatch says it's really the same food — a single
 *   ingredient like "cucumber" must never be replaced by a composite dish's numbers just because the
 *   dish's name happens to share a word ("cold cucumber cream soup"). When there's no acceptable
 *   table row, fall back to a live AI nutrition lookup (liveFood.ts) rather than silently keeping a
 *   table match that doesn't fit; if that also comes up empty, the model's own estimate stands.
 */
/**
 * v2.15 energy-density guard. The model saw the photo, so its own kcal per 100 g already knows what
 * the food looks like (soaked, with milk, a sandwich, a gravy). A lookup by NAME can't: "chocolate
 * oats/muesli with milk" came back as dry muesli (~380 kcal/100 g) and turned a 252 kcal bowl into
 * 684. So a replacement per-100 g must stay within a band of the model's own: tight for the live AI
 * lookup (it's only a name), looser for a real food-table row (it's usually more accurate).
 */
export const DENSITY_BAND = { live: [0.67, 1.5], table: [0.5, 2] } as const;
export function densityOk(modelKcalPer100: number, matchKcalPer100: number, kind: "live" | "table"): boolean {
  if (!(modelKcalPer100 > 0) || !(matchKcalPer100 > 0)) return true; // nothing to compare against
  const r = matchKcalPer100 / modelKcalPer100;
  const [lo, hi] = DENSITY_BAND[kind];
  return r >= lo && r <= hi;
}

export async function crossValidatePlateItem(it: PlateItem, deps: PlateMatchDeps): Promise<PlateItem> {
  const modelPer100 = it.grams > 0 ? (it.calories / it.grams) * 100 : 0;
  const hits = await deps.search(it.name, 3).catch(() => [] as FoodHit[]);
  const top = hits[0];
  let match: FoodHit | null = top && isAcceptableMatch(it.name, top) && densityOk(modelPer100, top.calories, "table") ? top : null;
  if (!match) {
    const live = await deps.live(it.name).catch(() => null);
    match = live && densityOk(modelPer100, live.calories, "live") ? live : null;
  }
  if (!match) return it;
  const k = it.grams / 100;
  return {
    ...it,
    calories: Math.round(match.calories * k),
    protein_g: Math.round(match.protein_g * k * 10) / 10,
    carbs_g: Math.round(match.carbs_g * k * 10) / 10,
    fat_g: Math.round(match.fat_g * k * 10) / 10,
    micros: { ...it.micros, ...microsFor(match, it.grams) },
    source: match.source === "ai" ? "estimated" : "table",
    food_id: match.source === "ai" ? null : match.id,
    // v2.9: provenance for the ⓘ sheet (metadata only — the numbers above are the rule).
    source_info: sourceInfoFor({ name: match.name, food_id: match.id, source: match.source, item_source: "table" }),
  };
}
