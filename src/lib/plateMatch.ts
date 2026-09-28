import { isAcceptableMatch, microsFor, type FoodHit } from "@/lib/foodSearch";
import { photoEstimateInfo, sourceInfoFor, webSourceInfo, type SourceLink } from "@/lib/sourceInfo";
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
export const DENSITY_BAND = { live: [0.67, 1.5], table: [0.5, 2], web: [0.5, 2] } as const;
export function densityOk(modelKcalPer100: number, matchKcalPer100: number, kind: "live" | "table" | "web"): boolean {
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

// ---------------------------------------------------------------------------------------------
// v2.15: photos go to the internet, never to bandlog.foods.
// ---------------------------------------------------------------------------------------------

/** What the web lookup (webFood.ts) hands back — per 100 g, plus its sources. */
export type WebHit = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  matched_name?: string;
  basis?: string;
  sources: SourceLink[];
  confidence: "high" | "medium" | "low";
};
export type PlateWebDeps = { web: (name: string, context: string) => Promise<WebHit | null> };

const RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * One photo item → the web's per-100 g at the model's grams. The density guard still applies (the
 * web answers for a NAME; the photo shows what's actually there): a web result outside 0.5–2× the
 * model's own kcal/100 g is dropped, the model's numbers stand and the item is flagged low
 * confidence. No web answer (timeout, error) → the model's numbers, labelled "AI estimate".
 */
export async function webCheckPlateItem(it: PlateItem, deps: PlateWebDeps, context = ""): Promise<PlateItem> {
  const modelPer100 = it.grams > 0 ? (it.calories / it.grams) * 100 : 0;
  const web = await deps.web(it.name, context).catch(() => null);
  if (!web) return { ...it, source: "estimated", food_id: null, source_info: photoEstimateInfo("no_web") };
  if (!densityOk(modelPer100, web.calories, "web")) {
    return { ...it, source: "estimated", food_id: null, confidence: "low", source_info: photoEstimateInfo("density") };
  }
  const k = it.grams / 100;
  const r1 = (v: number) => Math.round(v * k * 10) / 10;
  const micros = { ...it.micros };
  if (web.fiber_g != null) micros.fiber_g = r1(web.fiber_g);
  if (web.sugar_g != null) micros.sugar_g = r1(web.sugar_g);
  if (web.sodium_mg != null) micros.sodium_mg = r1(web.sodium_mg);
  return {
    ...it,
    calories: Math.round(web.calories * k),
    protein_g: r1(web.protein_g),
    carbs_g: r1(web.carbs_g),
    fat_g: r1(web.fat_g),
    micros,
    // The photo's portion confidence caps the item's; a shaky web answer lowers it.
    confidence: RANK[web.confidence] < RANK[it.confidence] ? web.confidence : it.confidence,
    source: "estimated",
    food_id: null,
    source_urls: web.sources.map((s) => s.url),
    source_info: webSourceInfo({ matched_name: web.matched_name, basis: web.basis, links: web.sources, confidence: web.confidence }),
  };
}
