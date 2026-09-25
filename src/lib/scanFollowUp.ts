import type { PlateItem } from "@/lib/types";

/**
 * v2.8: client-side follow-up effects and gram-range math for the plate result.
 *
 * When a plate scan's `follow_up` is answered, the client applies one of a small, fixed set of
 * deterministic multipliers — never a second model call — so answering a quick-reply chip is
 * instant and offline-safe. Unknown effect strings (a future vocabulary the client doesn't know
 * yet, or a model hallucination that slipped past `cleanFollowUp` in scanFlows.ts) are ignored:
 * the items come back unchanged.
 */

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Curries, gravies and fried items — the ones a restaurant serves oilier than a home kitchen. */
const CURRY_OR_FRIED = /\b(curry|kadai|kadhai|masala|makhani|korma|gravy|fry|fried|pakora|bhaji|bajji|cutlet|tikka|65|manchurian|biryani|dal|daal|dhal|sabzi|sabji)\b/i;

function scaleMicros(micros: PlateItem["micros"], k: number): PlateItem["micros"] {
  const out: PlateItem["micros"] = {};
  for (const [key, v] of Object.entries(micros ?? {})) if (v != null) out[key as keyof PlateItem["micros"]] = round1(v * k);
  return out;
}

/** Scale every number on an item (grams, range, macros, micros) by the same factor — used by smaller/bigger. */
function scaleWhole(it: PlateItem, k: number): PlateItem {
  return {
    ...it,
    grams: Math.max(1, Math.round(it.grams * k)),
    grams_low: it.grams_low != null ? Math.max(1, Math.round(it.grams_low * k)) : it.grams_low,
    grams_high: it.grams_high != null ? Math.max(1, Math.round(it.grams_high * k)) : it.grams_high,
    calories: Math.round(it.calories * k),
    protein_g: round1(it.protein_g * k),
    carbs_g: round1(it.carbs_g * k),
    fat_g: round1(it.fat_g * k),
    micros: scaleMicros(it.micros, k),
  };
}

/** The single item a follow-up option that "names" an item (e.g. "Add ghee to the dal?") refers to:
 *  whichever item's name appears in the question text, else the biggest item on the plate. */
function targetIndex(items: PlateItem[], question: string | undefined): number {
  const q = (question ?? "").toLowerCase();
  const named = items.findIndex((it) => it.name && q.includes(it.name.toLowerCase()));
  if (named >= 0) return named;
  let best = 0;
  for (let i = 1; i < items.length; i++) if (items[i].calories > items[best].calories) best = i;
  return best;
}

/** The fixed effect vocabulary — see V28_SPEC.md. Anything else is a no-op. */
export const FOLLOW_UP_EFFECTS = ["restaurant", "homemade", "add_ghee", "no_oil", "smaller", "bigger"] as const;

/**
 * Apply one follow-up effect deterministically. `question` is only used by `add_ghee` to find
 * "the item it names" (falls back to the largest item when the question doesn't name one).
 */
export function applyFollowUpEffect(items: PlateItem[], effect: string, question?: string): PlateItem[] {
  if (!items.length) return items;
  switch (effect) {
    case "restaurant":
      // ×1.25 fat and kcal on curries and fried items only.
      return items.map((it) => (CURRY_OR_FRIED.test(it.name) ? { ...it, fat_g: round1(it.fat_g * 1.25), calories: Math.round(it.calories * 1.25) } : it));
    case "homemade":
      // No change.
      return items;
    case "add_ghee": {
      // +45 kcal and +5 g fat on the item the question names.
      const idx = targetIndex(items, question);
      return items.map((it, i) => (i === idx ? { ...it, calories: it.calories + 45, fat_g: round1(it.fat_g + 5) } : it));
    }
    case "no_oil": {
      // -35% fat on every item, with the removed fat's calories (9 kcal/g) taken off too.
      return items.map((it) => {
        const newFat = round1(it.fat_g * 0.65);
        const removedKcal = Math.round((it.fat_g - newFat) * 9);
        return { ...it, fat_g: newFat, calories: Math.max(0, it.calories - removedKcal) };
      });
    }
    case "smaller":
      // ×0.8 grams on all items.
      return items.map((it) => scaleWhole(it, 0.8));
    case "bigger":
      // ×1.25 grams on all items.
      return items.map((it) => scaleWhole(it, 1.25));
    default:
      // Unknown effects are ignored.
      return items;
  }
}

/** One item's gram range as shown in the UI: "150 g (120–190)", or just "150 g" with no range. */
export function gramsRangeLabel(it: Pick<PlateItem, "grams" | "grams_low" | "grams_high">): string {
  const grams = Math.round(it.grams);
  if (it.grams_low == null || it.grams_high == null || it.grams_high <= it.grams_low) return `${grams} g`;
  return `${grams} g (${Math.round(it.grams_low)}–${Math.round(it.grams_high)})`;
}

export type KcalTotal = { center: number; low: number; high: number; plusMinus: number };

/**
 * The plate's total kcal with an uncertainty band, from each item's gram range at its own
 * kcal-per-gram rate: center is the sum of the items' point estimates (what's shown today), low/high
 * scale each item's calories by its own grams_low/grams_high, and plusMinus is half the spread —
 * "~620 kcal ±90". Items without a range contribute the same number to every bound.
 */
export function totalKcalRange(items: Pick<PlateItem, "grams" | "grams_low" | "grams_high" | "calories">[]): KcalTotal {
  let center = 0;
  let low = 0;
  let high = 0;
  for (const it of items) {
    center += it.calories;
    const rate = it.grams > 0 ? it.calories / it.grams : 0;
    const g_low = it.grams_low ?? it.grams;
    const g_high = it.grams_high ?? it.grams;
    low += rate * g_low;
    high += rate * g_high;
  }
  center = Math.round(center);
  low = Math.round(low);
  high = Math.round(high);
  return { center, low, high, plusMinus: Math.round((high - low) / 2) };
}
