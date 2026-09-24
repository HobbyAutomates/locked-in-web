/**
 * v2.7: deterministic "plain water" extraction — runs BEFORE the LLM parse so a dictated "I had 2
 * glasses of water" (or "500 ml paani", "पानी का एक गिलास") never becomes a food item. Handles
 * English, Hinglish and Devanagari number words, glass / cup / bottle / litre / ml units and
 * simple ranges, and is careful to leave "coconut water", "watermelon", "water chestnut /
 * singhara" and "rose water" alone — those are foods, not the drink.
 */

export type WaterPhrase = { ml: number; glasses: number; phrase: string };

/** Phrases where "water" is part of a food name, not the drink — masked before matching. */
const EXCLUDES: RegExp[] = [
  /coconut\s*water/gi,
  /rose\s*water/gi,
  /water\s*chestnut/gi,
  /watermelon/gi,
  /singhara/gi,
  /jal\s*jeera/gi,
  /नारियल\s*पानी/gi, // coconut water
  /गुलाब\s*जल/gi, // rose water
  /जल\s*जीरा/gi, // jal jeera
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  couple: 2,
  dozen: 12,
  half: 0.5,
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  chhah: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  aadha: 0.5,
  adha: 0.5,
  aadhi: 0.5,
  dedh: 1.5,
  dhai: 2.5,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  आधा: 0.5,
  आधी: 0.5,
  डेढ़: 1.5,
  ढाई: 2.5,
};

const DEVANAGARI_DIGITS: Record<string, string> = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

function numFromWord(w: string): number | null {
  const lower = w.toLowerCase();
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  const latin = w.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);
  const n = Number(latin);
  return Number.isFinite(n) ? n : null;
}

const NUM = "(?:\\d+(?:\\.\\d+)?|[०-९]+|a|an|one|two|three|four|five|couple|dozen|half|ek|do|teen|tin|char|chaar|paanch|panch|chhe|chhah|saat|aath|nau|das|aadha|adha|aadhi|dedh|dhai|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|आधा|आधी|डेढ़|ढाई)";
const UNIT = "(?:glass(?:es)?|gilas|ग्लास|गिलास|cups?|bottles?|botal(?:en)?|बोतल(?:ें)?|litres?|liters?|ltrs?|l|लीटर|lit(?:er|re)?|ml|mls?|millilitres?|मिली(?:लीटर)?)";
const WATER = "(?:water|paani|pani|पानी|jal|जल|neer|नीर)";

// JS \b only knows ASCII word chars, so Devanagari needs its own boundary — a manual lookaround
// that treats Latin letters/digits AND the Devanagari block as "word" characters.
const BL = "(?<![A-Za-z0-9\\u0900-\\u097F])";
const BR = "(?![A-Za-z0-9\\u0900-\\u097F])";

/** "2 glasses of water", "500 ml paani", "do glass paani (piya)" — quantity/unit before the word. */
const RE_FORWARD = new RegExp(`${BL}(?:(${NUM})\\s*(?:(?:-|to|se)\\s*(${NUM})\\s*)?)?(${UNIT})?\\s*(?:of\\s+|ka\\s+|ki\\s+|के\\s+|का\\s+|की\\s+)?(${WATER})${BR}`, "gi");
/** "पानी का एक गिलास" — Devanagari commonly puts the water word first. */
const RE_REVERSE = new RegExp(`${BL}(${WATER})\\s*(?:का\\s+|की\\s+|के\\s+)(?:(${NUM})\\s*)?(${UNIT})?${BR}`, "gi");

/** ml per ONE of this unit (litre / ml scale with the number itself, handled by the caller). */
function unitBaseMl(unit: string | undefined, glassMl: number): number {
  if (!unit) return glassMl; // bare "2 water" (rare) — treat as glasses
  const u = unit.toLowerCase();
  if (/^(glass|glasses|gilas|ग्लास|गिलास)$/.test(u)) return glassMl;
  if (/^cups?$/.test(u)) return 200;
  if (/^(bottle|bottles|botal|botalen|बोतल|बोतलें)$/.test(u)) return 1000; // "bottle ≈ 1 L"
  if (/^(litres?|liters?|ltrs?|l|लीटर|liter|litre)$/.test(u)) return 1000;
  if (/^(ml|mls|millilitres?|मिली|मिलीलीटर)$/.test(u)) return 1;
  return glassMl;
}

/** Round to the nearest half-glass for a readable "glasses" count. */
function toGlasses(ml: number, glassMl: number): number {
  if (!(glassMl > 0)) return 0;
  return Math.round((ml / glassMl) * 2) / 2;
}

/**
 * Finds every plain-water mention in `text`, converts each to ml (using `glassMl` for bare
 * "glass"), and returns the combined amount plus the text with those phrases removed. When
 * nothing but whitespace/punctuation is left, `remainder` is "".
 */
export function extractWater(text: string, glassMl = 250): { water: WaterPhrase | null; remainder: string } {
  if (!text || !text.trim()) return { water: null, remainder: text };

  let masked = text;
  for (const re of EXCLUDES) masked = masked.replace(re, (m) => "\u0000".repeat(m.length));

  type Candidate = { start: number; end: number; ml: number };
  const candidates: Candidate[] = [];

  function collect(re: RegExp, order: "forward" | "reverse") {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
      const whole = m[0];
      if (!whole.trim()) continue; // guard against a pathological zero-length match
      const [n1, n2, unit] = order === "forward" ? [m[1], m[2], m[3]] : [m[2], undefined, m[3]];
      const a = n1 ? numFromWord(n1) : null;
      const b = n2 ? numFromWord(n2) : null;
      const count = a != null && b != null ? (a + b) / 2 : a != null ? a : 1;
      const ml = count * unitBaseMl(unit, glassMl);
      if (!(ml > 0)) continue;
      candidates.push({ start: m.index, end: m.index + whole.length, ml });
    }
  }
  collect(RE_FORWARD, "forward");
  collect(RE_REVERSE, "reverse");

  // Greedily keep non-overlapping matches, longest (most specific) first at each start point.
  candidates.sort((x, y) => x.start - y.start || y.end - y.start - (x.end - x.start));
  let totalMl = 0;
  const phrases: string[] = [];
  const spans: { start: number; end: number }[] = [];
  let lastEnd = -1;
  for (const c of candidates) {
    if (c.start < lastEnd) continue;
    totalMl += c.ml;
    phrases.push(text.slice(c.start, c.end).trim());
    spans.push({ start: c.start, end: c.end });
    lastEnd = c.end;
  }

  if (!spans.length) return { water: null, remainder: text };

  // Strip the matched spans out of the ORIGINAL text (indices line up 1:1 with `masked`).
  let remainder = "";
  let cursor = 0;
  for (const { start, end } of spans) {
    remainder += text.slice(cursor, start);
    cursor = end;
  }
  remainder += text.slice(cursor);
  remainder = remainder
    // Leftover dictation filler right next to a stripped water phrase ("… paani piya" → "… piya").
    .replace(/\b(piya|piye|pee|pia|pi|drank|liya|pia|पिया|पी|पिये)\b/gi, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[\s,।]+|[\s,।]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const ml = Math.round(totalMl);
  return {
    water: { ml, glasses: toGlasses(ml, glassMl), phrase: phrases.join(", ") },
    remainder,
  };
}
