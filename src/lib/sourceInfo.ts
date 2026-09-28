/**
 * v2.9 "Where's this from?" — the provenance of one logged / parsed / scanned item, shaped for the ⓘ
 * sheet. Pure (no DB, no React), shared by the parse / scan routes, /api/food-source, the web sheet
 * and scripts/check-variants.ts. Android mirrors it in util/Sources.kt.
 *
 * Which sources get a real link:
 *   usda   → FoodData Central food-details when the row carries its fdc id (foods.source_ref,
 *            schema_v32); otherwise an FDC search for the name.
 *   off    → the Open Food Facts product page for the barcode (foods.barcode, or the scan's digits).
 *   ifct   → the IFCT 2017 reference site (per-food pages aren't addressable; the IFCT code, when
 *            stored, is shown as text).
 *   dish   → the Indian Nutrient Databank paper the recipes come from.
 *   custom / ai / estimate → a label only (plus any web-search citations a label analysis captured).
 */

export type SourceKind = "ifct" | "usda" | "off" | "dish" | "custom" | "ai" | "estimate" | "label" | "web" | "user";
export type SourceLink = { label: string; url: string };
export type SourceInfo = {
  kind: SourceKind;
  /** "IFCT 2017 (ICMR-NIN)", "USDA FoodData Central", "AI estimate", … */
  label: string;
  /** One sentence on what that means for the number. */
  detail: string;
  links: SourceLink[];
};

export const IFCT_URL = "https://www.ifct2017.com/";
export const INDB_URL = "https://doi.org/10.1016/j.cdnut.2024.103790";

export function usdaUrl(fdcId: string): string {
  return `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(fdcId)}`;
}
export function usdaSearchUrl(name: string): string {
  return `https://fdc.nal.usda.gov/food-search?query=${encodeURIComponent(name.trim())}`;
}
export function offUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
}

/** Digits of an OFF barcode from a food id like "off-8901234567890", else null. */
function barcodeFromId(foodId: string | null | undefined): string | null {
  const m = /^off-(\d{8,14})$/.exec(foodId ?? "");
  return m ? m[1] : null;
}

/**
 * The provenance of an item. `source` is the foods row's dataset (custom | dish | ifct | usda |
 * usda_foundation | off | ai) when there is a row; `item_source` is the item's own table |
 * estimated | scan. `source_ref` is the dataset's own id (USDA fdc id, IFCT code) when stored.
 */
export function sourceInfoFor(input: {
  name: string;
  food_id?: string | null;
  source?: string | null;
  item_source?: string | null;
  barcode?: string | null;
  source_ref?: string | null;
}): SourceInfo {
  const name = input.name || "this food";
  const ref = (input.source_ref ?? "").trim() || null;
  const barcode = (input.barcode ?? "").replace(/\D/g, "") || barcodeFromId(input.food_id);
  if (input.item_source === "scan") {
    return barcode
      ? { kind: "off", label: "Open Food Facts", detail: "From the pack's barcode record, checked against the label rules.", links: [{ label: "Open Food Facts product page", url: offUrl(barcode) }] }
      : { kind: "label", label: "Nutrition label", detail: "Read off the pack's nutrition table, then sanity-checked.", links: [] };
  }
  const src = input.food_id ? (input.source ?? "").toLowerCase() : "";
  if (!input.food_id || input.item_source === "estimated" || src === "ai") {
    return src === "ai"
      ? { kind: "ai", label: "AI estimate", detail: "Looked up by the AI when the food table had no match, then sanity-checked (the macros have to add up to the calories).", links: [] }
      : { kind: "estimate", label: "AI estimate", detail: "Estimated by the AI from a typical recipe — no food-table row matched.", links: [] };
  }
  switch (src) {
    case "ifct":
      return {
        kind: "ifct",
        label: "IFCT 2017 (ICMR-NIN)",
        detail: `Indian Food Composition Tables 2017, National Institute of Nutrition, Hyderabad.${ref ? ` Code ${ref}.` : ""}`,
        links: [{ label: "IFCT 2017 reference (NIN)", url: IFCT_URL }],
      };
    case "usda":
    case "usda_foundation":
      return {
        kind: "usda",
        label: "USDA FoodData Central",
        detail: ref ? `USDA FoodData Central, FDC ID ${ref}.` : "USDA FoodData Central (SR Legacy / Foundation Foods).",
        links: [ref && /^\d+$/.test(ref) ? { label: "View on FoodData Central", url: usdaUrl(ref) } : { label: "Search FoodData Central", url: usdaSearchUrl(name) }],
      };
    case "off":
      return {
        kind: "off",
        label: "Open Food Facts",
        detail: "A packaged product's record on Open Food Facts.",
        links: barcode ? [{ label: "Open Food Facts product page", url: offUrl(barcode) }] : [],
      };
    case "dish":
      return {
        kind: "dish",
        label: "Locked In dish recipe",
        detail: "Worked out from a standard recipe in the Indian Nutrient Databank (INDB), per 100 g cooked.",
        links: [{ label: "Indian Nutrient Databank (INDB)", url: INDB_URL }],
      };
    default:
      return { kind: "custom", label: "Locked In food list", detail: "Hand-checked everyday values, per 100 g as usually eaten.", links: [] };
  }
}

/**
 * v2.15: numbers looked up on the web (webFood.ts). `links` are the pages the lookup read (max 3).
 * Older clients render any kind generically (label + detail + links), so this is backward compatible.
 */
export function webSourceInfo(input: { matched_name?: string; basis?: string; links: SourceLink[]; confidence?: string }): SourceInfo {
  const what = input.matched_name ? `“${input.matched_name}”` : "this food";
  const basis = input.basis ? ` (${input.basis})` : "";
  return {
    kind: "web",
    label: "Web sources",
    detail: `Looked up on the web for ${what}${basis}, per 100 g, then sanity-checked (the macros have to add up to the calories).${input.confidence === "low" ? " The sources didn't agree well." : ""}`,
    links: input.links.slice(0, 3),
  };
}

/** v2.15: the photo's own numbers, when the web lookup failed, timed out or didn't fit the photo. */
export function photoEstimateInfo(reason: "no_web" | "density" = "no_web"): SourceInfo {
  return {
    kind: "estimate",
    label: "AI estimate",
    detail:
      reason === "density"
        ? "The web numbers didn't fit what the photo shows (too dense or too light for this portion), so this keeps the AI's own estimate from the photo."
        : "Estimated by the AI from the photo — the web lookup didn't come back in time.",
    links: [],
  };
}

/** v2.15: the person typed their own numbers ("Correct the numbers"). */
export function userSourceInfo(source?: string | null): SourceInfo {
  const s = (source ?? "").trim();
  const isUrl = /^https?:\/\//i.test(s);
  return { kind: "user", label: "Your numbers", detail: s ? `You entered these${isUrl ? "" : ` (source: ${s.slice(0, 80)})`}.` : "You entered these numbers yourself.", links: isUrl ? [{ label: "Your source", url: s }] : [] };
}

/** A label / barcode scan report's provenance (nutrition_source + barcode), plus any research links. */
export function reportSourceInfo(report: { nutrition_source?: unknown; barcode?: unknown }, citations: SourceLink[] = []): SourceInfo {
  const barcode = typeof report.barcode === "string" ? report.barcode.replace(/\D/g, "") : "";
  const base: SourceInfo =
    report.nutrition_source === "openfoodfacts"
      ? { kind: "off", label: "Open Food Facts", detail: "Numbers from the product's Open Food Facts record, sanity-checked.", links: barcode ? [{ label: "Open Food Facts product page", url: offUrl(barcode) }] : [] }
      : report.nutrition_source === "label"
        ? { kind: "label", label: "Nutrition label", detail: "Numbers read off the pack's nutrition table, sanity-checked.", links: barcode ? [{ label: "Open Food Facts product page", url: offUrl(barcode) }] : [] }
        : { kind: "estimate", label: "No trusted numbers", detail: "The numbers couldn't be read or didn't check out — scan the nutrition table.", links: [] };
  return { ...base, links: [...base.links, ...citations.slice(0, 3)] };
}

/** "High" / "Medium" / "Low" from a 0–1 score (parse / meal items) or the plate's own word. */
export function confidenceLabel(c: number | string | null | undefined, itemSource?: string | null): string {
  if (typeof c === "string") return c === "high" ? "High" : c === "low" ? "Low" : "Medium";
  if (c == null || !Number.isFinite(c)) return itemSource === "estimated" ? "Low" : "High";
  return c >= 0.8 ? "High" : c >= 0.5 ? "Medium" : "Low";
}

/** Low confidence or a "Which one?" choice → the ⓘ reads "Check". */
export function needsCheck(item: { confidence?: number | string | null; source?: string | null; variants?: unknown[] | null }): boolean {
  if ((item.variants?.length ?? 0) > 1) return true;
  return confidenceLabel(item.confidence ?? null, item.source ?? null) === "Low";
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** "Numbers per 100 g: 297 kcal · P 9.8 · C 46 · F 7.5" from an item's own totals. */
export function per100Note(item: { grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }): string {
  if (!(item.grams > 0)) return "";
  const k = 100 / item.grams;
  return `Numbers per 100 g: ${Math.round(item.calories * k)} kcal · P ${r1(item.protein_g * k)} · C ${r1(item.carbs_g * k)} · F ${r1(item.fat_g * k)}`;
}
