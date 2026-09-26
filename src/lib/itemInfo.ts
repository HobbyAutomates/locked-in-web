import { confidenceLabel } from "./sourceInfo";
import { isRecipeItem } from "./recipes";

/**
 * v2.13 edit-meal item cards (spec §14): what the richer ⓘ sheet and the item card say about one
 * row — AI estimate vs database match, the confidence with a one-line why, and a gram range.
 * Pure; Android: util/ItemInfo.kt.
 */

export type ItemLike = {
  name: string;
  food_id: string | null;
  grams: number;
  source: string;
  confidence: number | string | null;
  unit?: string | null;
  cooked_in?: string | null;
  grams_low?: number | null;
  grams_high?: number | null;
};

export type Origin = "database" | "ai" | "scan" | "recipe";

export function originOf(it: ItemLike): Origin {
  if (isRecipeItem(it)) return "recipe";
  if (it.source === "scan") return "scan";
  if (it.source === "estimated" || !it.food_id) return "ai";
  return "database";
}

export const ORIGIN_LABEL: Record<Origin, string> = {
  database: "Database match",
  ai: "AI estimate",
  scan: "From the label",
  recipe: "Your recipe",
};

export type Level = "High" | "Medium" | "Low";

export function levelOf(it: ItemLike): Level {
  if (originOf(it) === "recipe") return "High";
  return confidenceLabel(it.confidence ?? null, it.source) as Level;
}

/** One line on why the confidence is what it is. */
export function confidenceWhy(it: ItemLike): string {
  const o = originOf(it);
  const level = levelOf(it);
  if (o === "recipe") return "Worked out from your own recipe's ingredients.";
  if (o === "scan") return "Read off the pack's nutrition table, so only the amount can differ.";
  if (o === "database") {
    if (it.cooked_in === "restaurant") return "A food-table match with extra oil for a restaurant portion; the oil is the big unknown.";
    return level === "High" ? "Matched to a row in the food table; only the amount is an estimate." : "Matched to a similar food in the table; the exact dish may differ.";
  }
  if (level === "High") return "A common dish the AI recognised clearly; home recipes still vary a little.";
  if (level === "Medium") return "A typical recipe: oil, ghee and portion size can move it either way.";
  return "Hard to tell from the words or the photo, so worth a quick check.";
}

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

/** How far the amount could be off, as a share of the grams, by confidence (no model range). */
export const RANGE_SHARE: Record<Level, number> = { High: 0.1, Medium: 0.25, Low: 0.4 };

/**
 * A likely gram range: the model's own when the row came with one (plate photos), else ± a share of
 * the grams by confidence. A database row weighed or counted exactly gets ± 10 %.
 */
export function gramRange(it: ItemLike): { low: number; high: number; fromModel: boolean } {
  const g = Number(it.grams) || 0;
  if (it.grams_low != null && it.grams_high != null && it.grams_high >= it.grams_low && it.grams_high > 0) return { low: round5(it.grams_low), high: round5(it.grams_high), fromModel: true };
  const share = originOf(it) === "recipe" ? 0.1 : RANGE_SHARE[levelOf(it)];
  return { low: round5(g * (1 - share)), high: round5(g * (1 + share)), fromModel: false };
}

export function gramRangeText(it: ItemLike): string {
  const r = gramRange(it);
  return r.low === r.high ? `${r.low} g` : `${r.low}–${r.high} g`;
}
