/**
 * The cache key for a food's picture (bandlog.food_images.key), shared by the server resolver and
 * the <FoodImage> client so both dedupe the same way: lowercase, trimmed, spaces collapsed, and
 * quantities stripped — "2 roti" → "roti", "1 katori dal tadka" → "dal tadka", "Paneer (200 g)" →
 * "paneer", "banana x2" → "banana". Android should send the display name; the server normalises.
 */
const UNIT = String.raw`(?:g|gm|gms|gram|grams|kg|mg|ml|l|ltr|litre|litres|liter|liters|oz|cup|cups|katori|katoris|bowl|bowls|plate|plates|piece|pieces|pc|pcs|slice|slices|tbsp|tsp|tablespoons?|teaspoons?|spoons?|scoop|scoops|glass|glasses|mug|mugs|serving|servings|packet|packets|pack|packs|nos?|handful|handfuls|small|medium|large|big|chhota|bada)`;
const NUM = String.raw`(?:\d+(?:[.,/]\d+)?|½|¼|¾|a|an|one|two|three|four|five|six|half|quarter|ek|do|teen|char|aadha|adha|dedh|dhai)`;
const LEAD = new RegExp(String.raw`^${NUM}(?:\s*(?:x\s*)?${UNIT}(?=\s|$)|\s+|$)(?:\s*${UNIT}(?=\s|$))?(?:\s*of\s+)?`, "u");
const TRAIL = new RegExp(String.raw`\s+(?:x\s*\d+(?:\.\d+)?|\d+(?:[.,]\d+)?\s*${UNIT}|${UNIT})$`, "u");

export function foodKey(name: string): string {
  let s = (name || "").normalize("NFKC").toLowerCase();
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  s = s.replace(/[“”"`’']/g, "");
  s = s.replace(/[^\p{L}\p{N}\p{M}&+\s-]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(LEAD, "").replace(TRAIL, "").replace(/\s+/g, " ").trim();
    if (!next || next === s) break;
    s = next;
  }
  return s.slice(0, 80);
}
