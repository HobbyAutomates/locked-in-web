/**
 * v2.2 scan display names. A scan must never be called "<UNKNOWN>" or nothing: the model's name,
 * else the Open Food Facts name, else the first ingredient, else "Unnamed label" / "Plate photo".
 * Used when a scan is saved (web scanFlows) and again when History reads old rows.
 */

const PLACEHOLDER = /^[<\[(]*\s*(unknown( product)?|n\/?a|none|null|undefined|unnamed|not readable|unreadable|-+|\?+)\s*[>\])]*$/i;

/** The name as-is when it's a real name, "" when it's blank or a placeholder like "<UNKNOWN>". */
export function realName(name: unknown): string {
  const s = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  return !s || PLACEHOLDER.test(s) ? "" : s.slice(0, 120);
}

/** "Ingredients: Whole wheat flour (62%), sugar, …" -> "Whole wheat flour". "" when there is none. */
export function firstIngredient(text: unknown): string {
  if (typeof text !== "string" || !text) return "";
  // A label transcript has an "Ingredients:" heading; an OFF ingredients_text is the bare list.
  const m = text.match(/ingredients?\s*(?:list)?\s*[:\-–—]\s*([^\n]+)/i);
  const body = m ? m[1] : !text.trim().includes("\n") ? text : "";
  if (!body) return "";
  const first = (body.split(/[,;.(\[:]/)[0] ?? "")
    .replace(/\d+(\.\d+)?\s*%/g, "")
    .replace(/[*_#"]/g, "")
    .trim();
  if (first.length < 2) return "";
  const clipped = first.length > 40 ? first.slice(0, 40).trim() : first;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

export type ScanNameKind = "label" | "barcode" | "photo" | "plate";

/** The name to store / show for a scan, following the fallback chain above. */
export function scanName(kind: ScanNameKind | string | null | undefined, candidates: { model?: unknown; off?: unknown; ingredients?: unknown }): string {
  return realName(candidates.model) || realName(candidates.off) || firstIngredient(candidates.ingredients) || (kind === "photo" || kind === "plate" ? "Plate photo" : "Unnamed label");
}
