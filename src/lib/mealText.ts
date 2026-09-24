/**
 * Does the Add-food bar hold a description of a meal (worth sending to the parser) rather than a
 * food name to search for? Three or more words, a comma, a number with a unit ("150 g", "2 roti",
 * "1 katori") or any Devanagari all count.
 */
const UNIT = /\d+(?:[.,]\d+)?\s*(?:g|gm|gms|gram|grams|ml|l|kg|katori|katoris|roti|rotis|chapati|chapatis|cup|cups|bowl|bowls|tbsp|tsp|scoop|scoops|piece|pieces|pc|pcs|slice|slices|glass|glasses|plate|plates|egg|eggs|idli|idlis|dosa|dosas|paratha|parathas|spoon|spoons)\b/i;

export function looksLikeSentence(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[ऀ-ॿ]/.test(t)) return true;
  if (t.includes(",")) return true;
  if (UNIT.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length >= 3;
}

/** Three or more words: an exercise description for describe-exercise rather than a search. */
export function looksLikeDescription(text: string): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length >= 3;
}
