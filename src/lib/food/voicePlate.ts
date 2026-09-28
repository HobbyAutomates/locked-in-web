import type { PlateItem } from "@/lib/types";

/**
 * v2.18 A1 photo + voice logging, the pure half. What the person says while (or after) taking a plate
 * photo — "2 roti, less oil, extra dal", "do roti aur thoda chawal", "no papad, plus a glass of chaas" —
 * is parsed into amounts and oil cues and merged into the photo's items deterministically:
 *
 *   applyVoiceAmounts   counts ("2 roti" → 2 × the photo's own grams per roti), units ("1 katori
 *                       rice" → 150 g), extra / less / half / double / none, and foods the photo
 *                       didn't show (added at a typical portion, flagged `from_voice`, looked up on
 *                       the web by the caller like every other item).
 *   applyVoiceOil       "less oil" (−30 % fat on oily dishes), "no oil / bina ghee" (−60 %),
 *                       "extra ghee / with butter" (+5 g fat on the dish it names, else the biggest).
 *
 * Amounts run BEFORE the web check (the web keeps the grams and prices them); oil runs AFTER it (the
 * web's per-100 g would otherwise overwrite the fat change). The merge is "set", not "add": saying
 * "2 roti" on a plate that already shows 2 changes nothing. Android: util/VoicePlate.kt (same rules,
 * same tests in scripts/check-v218-food.ts ↔ VoicePlateTest.kt).
 */

export type VoiceMod = "set" | "extra" | "double" | "less" | "half" | "none";
export type VoiceSeg = {
  raw: string;
  /** The food words as spoken, synonyms folded ("chapati" → "roti"), or null for a pure oil cue. */
  food: string | null;
  count: number | null;
  /** Grams of ONE unit when the person named one ("katori" 150, "glass" 250), or an explicit gram amount. */
  unitGrams: number | null;
  unitLabel: string | null;
  mod: VoiceMod;
};
export type OilCue = { level: "less" | "none" | "extra"; food: string | null };
export type VoiceParse = { segments: VoiceSeg[]; oil: OilCue[] };
export type VoiceMerge = { items: PlateItem[]; changes: string[]; added: number[] };

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, dozen: 12,
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
  dedh: 1.5, dhai: 2.5, sawa: 1.25,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "डेढ़": 1.5, "ढाई": 2.5,
};

/** grams of one unit; "piece"-like units are null (the food's own piece weight is used). */
const UNITS: Record<string, { grams: number | null; label: string }> = {
  katori: { grams: 150, label: "katori" }, katoris: { grams: 150, label: "katori" }, "कटोरी": { grams: 150, label: "katori" },
  bowl: { grams: 200, label: "bowl" }, bowls: { grams: 200, label: "bowl" },
  plate: { grams: 250, label: "plate" }, plates: { grams: 250, label: "plate" },
  glass: { grams: 250, label: "glass" }, glasses: { grams: 250, label: "glass" }, "गिलास": { grams: 250, label: "glass" },
  cup: { grams: 150, label: "cup" }, cups: { grams: 150, label: "cup" },
  spoon: { grams: 15, label: "spoon" }, spoons: { grams: 15, label: "spoon" }, tbsp: { grams: 15, label: "tbsp" }, chammach: { grams: 15, label: "spoon" }, chamach: { grams: 15, label: "spoon" }, "चम्मच": { grams: 15, label: "spoon" },
  tsp: { grams: 5, label: "tsp" }, teaspoon: { grams: 5, label: "tsp" },
  ladle: { grams: 60, label: "ladle" }, karchi: { grams: 60, label: "ladle" },
  scoop: { grams: 30, label: "scoop" }, scoops: { grams: 30, label: "scoop" },
  handful: { grams: 30, label: "handful" },
  slice: { grams: 30, label: "slice" }, slices: { grams: 30, label: "slice" },
  piece: { grams: null, label: "piece" }, pieces: { grams: null, label: "piece" }, pc: { grams: null, label: "piece" }, pcs: { grams: null, label: "piece" }, tukda: { grams: null, label: "piece" },
};
const GRAM_WORDS = new Set(["g", "gm", "gms", "gram", "grams", "ml"]);

/** Typical one-piece weights (the same numbers as quantity.ts PIECE_GRAMS). */
export const PIECES: Record<string, number> = {
  roti: 40, paratha: 80, naan: 90, kulcha: 80, puri: 25, bhatura: 70, idli: 40, dosa: 100, uttapam: 120, vada: 50, appam: 60,
  dhokla: 30, samosa: 60, kachori: 50, momo: 25, egg: 50, toast: 30, bread: 30, ladoo: 40, cookie: 12, biscuit: 10, banana: 120,
  apple: 180, orange: 130, papad: 12, pakora: 20, cutlet: 60, kebab: 40, tikki: 60, thepla: 50, chilla: 70,
};

const SYNONYMS: Record<string, string> = {
  chapati: "roti", chapatti: "roti", phulka: "roti", fulka: "roti", rotis: "roti", chapatis: "roti", "रोटी": "roti",
  daal: "dal", dhal: "dal", "दाल": "dal",
  chawal: "rice", chaawal: "rice", bhaat: "rice", bhat: "rice", "चावल": "rice",
  dahi: "curd", yogurt: "curd", yoghurt: "curd", "दही": "curd",
  sabji: "sabzi", subzi: "sabzi", subji: "sabzi", sabjee: "sabzi", bhaji: "sabzi", "सब्जी": "sabzi",
  anda: "egg", ande: "egg", eggs: "egg", "अंडा": "egg",
  murgh: "chicken", murg: "chicken",
  buttermilk: "chaas", chhach: "chaas", chhaas: "chaas", chaach: "chaas", "छाछ": "chaas",
  achaar: "achar", pickle: "achar",
  poori: "puri", parantha: "paratha", laddu: "ladoo",
  potato: "aloo", alu: "aloo",
  salaad: "salad", papadum: "papad", pappad: "papad",
};

const STOP = new Set([
  "of", "with", "the", "and", "some", "my", "i", "had", "ate", "have", "also", "bhi", "ka", "ki", "ke", "wala", "wali", "sa", "si", "se", "on", "top",
  "in", "it", "is", "was", "there", "its", "it's", "that", "this", "plus", "aur", "or", "just", "only", "about", "around", "like", "for", "me", "mera", "meri",
  "tha", "thi", "hai", "hain", "liya", "khaya", "khayi", "khaaya", "add", "added", "please", "side", "along", "abhi", "yeh", "ye", "wo", "woh", "usme", "mein", "me",
]);

const MOD_WORDS: Record<string, VoiceMod> = {
  extra: "extra", more: "extra", zyada: "extra", jyada: "extra", jada: "extra", zyaada: "extra", bada: "extra", badi: "extra", big: "extra", large: "extra", full: "extra", heap: "extra",
  double: "double",
  less: "less", kam: "less", thoda: "less", thodi: "less", thora: "less", little: "less", small: "less", chhota: "less", chota: "less", light: "less", bit: "less",
  half: "half", aadha: "half", adha: "half", aadhi: "half", adhi: "half", "आधा": "half", "आधी": "half",
  no: "none", without: "none", bina: "none", skip: "none", skipped: "none", nahi: "none", nahin: "none", not: "none", didnt: "none", didn: "none", none: "none", zero: "none",
};

const OIL_WORDS = new Set(["oil", "tel", "ghee", "butter", "makhan", "makkhan", "tadka", "oily", "greasy", "fried", "तेल", "घी"]);
const OIL_LESS = new Set(["less", "kam", "thoda", "thodi", "little", "light", "low", "lite"]);
const OIL_NONE = new Set(["no", "without", "bina", "zero", "free", "nahi", "nahin", "none", "dry"]);
const OIL_EXTRA = new Set(["extra", "more", "zyada", "jyada", "with", "added", "double", "lots", "loaded", "top"]);

/** Dishes that carry cooking fat (where "less oil" applies when no dish is named). */
export const OILY = /dal|curry|masala|paneer|sabzi|bhaji|bhurji|fry|fried|paratha|pulao|biryani|khichdi|rajma|chole|chana|kadhi|gravy|korma|makhani|tadka|poha|upma|omelette|dosa|keema|aloo|gobi|bhindi|baingan|palak|matar|kofta|egg|chicken|mutton|fish|pakora|puri|bhatura|samosa|vada|noodles|maggi|fried rice/i;
/** Dishes a count without a unit means katoris of. */
const SPOONABLE = /dal|curry|sabzi|rajma|chole|chana|kadhi|raita|curd|khichdi|rice|pulao|biryani|poha|upma|sambar|rasam|halwa|kheer|soup|gravy|korma/i;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Words that are food on their own ("chaas bhi" adds chaas); anything else needs an amount to be added. */
const KNOWN_FOOD = /\b(chaas|lassi|salad|papad|achar|curd|raita|chutney|milk|tea|chai|coffee|juice|sweet|mithai|fruit|banana|apple|orange|mango|watermelon|onion|cucumber|sprouts|paneer|chicken|mutton|fish|egg|rice|roti|dal|sabzi|curry|soup|ghee|butter|cheese|bread|idli|dosa|vada|poha|upma|khichdi|biryani|pulao|halwa|kheer|ladoo|gulab jamun|rasgulla|jalebi|samosa|pakora|namkeen|bhujia|makhana|peanut|nuts|almond|whey|shake|smoothie|oats|muesli|cornflakes|pickle)\b/i;

/** Words that end in "s" but aren't plurals. */
const NOT_PLURAL = new Set(["chaas", "chhaas", "oats", "chips", "fries", "peas", "beans", "nuts", "sprouts", "rajmas", "khus", "dhokla", "ras", "chaats"]);

function singular(t: string): string {
  if (NOT_PLURAL.has(t)) return t;
  if (t.length > 3 && t.endsWith("es") && /(ch|sh|x|o)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Lower-case word tokens with synonyms folded and plurals trimmed ("Chapatis" → "roti"). */
export function foodTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^\p{L}\p{M}0-9']+/u)
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? SYNONYMS[singular(t)] ?? singular(t));
}

function parseNumber(tok: string): number | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  if (/^\d+\/\d+$/.test(tok)) {
    const [a, b] = tok.split("/").map(Number);
    return b ? a / b : null;
  }
  if (tok === "½") return 0.5;
  if (tok === "¼") return 0.25;
  if (tok === "¾") return 0.75;
  if (/^[०-९]+$/.test(tok)) return Number(tok.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))));
  return NUMBER_WORDS[tok] ?? null;
}

/** Split an utterance into segments on commas, "and", "aur", "plus", "&", "then". */
function splitSegments(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.!?;\n]+/g, ",")
    .split(/,|\band\b|\baur\b|\bplus\b|&|\bthen\b|\balso\b|(?:^|\s)(?:या|और)(?=\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "not much", "no more": the negation softens to "less". */
const DEGREE = new Set(["much", "many", "more", "too", "enough", "so", "very", "zyada", "jyada"]);
/** Filler words allowed between a direction and its oil word ("without any oil", "a little bit of ghee"). */
const OIL_FILLER = new Set(["any", "some", "a", "bit", "of", "the", "much", "little", "mein", "me", "se"]);
const OIL_DIRECTION = (t: string | undefined) => !!t && (OIL_LESS.has(t) || OIL_NONE.has(t) || OIL_EXTRA.has(t));

/**
 * The oil cue in a segment: an oil word with a direction word right before it (fillers allowed:
 * "without any oil") or right after it ("oil kam", "ghee nahi", "oil free"), or "oily" / "greasy".
 * `used` = the token indexes that belong to the cue. null when the oil word is just part of a name.
 */
function findOilCue(toks: string[], raw: string): { level: OilCue["level"]; used: Set<number> } | null {
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!OIL_WORDS.has(t)) continue;
    const used = new Set<number>([i]);
    let dir: string | undefined;
    let j = i - 1;
    while (j >= 0 && OIL_FILLER.has(toks[j]) && !OIL_DIRECTION(toks[j])) j--;
    if (j >= 0 && OIL_DIRECTION(toks[j])) {
      dir = toks[j];
      for (let k = j; k < i; k++) used.add(k);
    } else if (OIL_DIRECTION(toks[i + 1])) {
      dir = toks[i + 1];
      used.add(i + 1);
    }
    if (!dir) {
      if (t === "oily" || t === "greasy") return { level: "extra", used };
      continue;
    }
    const level: OilCue["level"] = OIL_NONE.has(dir) || /oil[- ]?free/.test(raw) ? "none" : OIL_LESS.has(dir) ? "less" : "extra";
    return { level, used };
  }
  return null;
}

/** One segment → an oil cue (if any) and a food amount (if any). */
function parseSegment(raw: string): { seg: VoiceSeg | null; oil: OilCue | null } {
  // "20g" / "150ml" → "20 g"; "2x" → "2"
  const toks = raw
    .replace(/(\d)(g|gm|gms|ml)\b/g, "$1 $2")
    .replace(/(\d)x\b/g, "$1")
    .replace(/n't\b/g, " not")
    .split(/[^\p{L}\p{M}0-9./½¼¾']+/u)
    .filter(Boolean);

  // Oil cue: an oil word WITH a direction right next to it ("less oil", "bina ghee", "oil kam", "with
  // butter", "extra ghee"), or "oily" / "greasy". A bare oil word is part of a dish's name ("butter
  // chicken", "butter naan", "fried rice", "dal tadka") and stays in the food words.
  let oil: OilCue | null = null;
  const rest: string[] = [];
  const cue = findOilCue(toks, raw);
  if (cue) {
    const { level, used } = cue;
    // Everything that isn't the oil phrase may still name a food ("dal with extra ghee" → dal).
    toks.forEach((t, i) => {
      if (!used.has(i)) rest.push(t);
    });
    const foodWords = rest.filter((t) => !STOP.has(t) && parseNumber(t) === null && !UNITS[t] && !GRAM_WORDS.has(t) && !MOD_WORDS[t]);
    oil = { level, food: foodWords.length ? foodWords.map((t) => SYNONYMS[t] ?? t).join(" ") : null };
    // "2 roti with ghee": the amount part still counts. A bare "less oil" has no food part.
    if (!foodWords.length) return { seg: null, oil };
  } else rest.push(...toks);

  let count: number | null = null;
  let unitGrams: number | null = null;
  let unitLabel: string | null = null;
  let mod: VoiceMod = "set";
  const food: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    const n = parseNumber(t);
    const next = rest[i + 1];
    if (n !== null && !(t === "a" || t === "an") && next && GRAM_WORDS.has(next)) {
      unitGrams = n;
      unitLabel = next === "ml" ? "ml" : "g";
      count = 1;
      i++;
      continue;
    }
    if (n !== null) {
      // "a" / "an" only count when nothing else did ("a glass of chaas").
      if (count === null || !(t === "a" || t === "an")) count = t === "a" || t === "an" ? (count ?? 1) : n;
      continue;
    }
    if (UNITS[t]) {
      unitGrams = UNITS[t].grams;
      unitLabel = UNITS[t].label;
      continue;
    }
    if (MOD_WORDS[t]) {
      let m = MOD_WORDS[t];
      // "not much rice", "no more than half": a negation before a degree word means less, not none.
      if (m === "none" && next && DEGREE.has(next)) {
        m = "less";
        i++;
      }
      // "half" with a count ("1 and a half") is rare; "half" alone is a modifier.
      if (m === "half" && count !== null && mod === "set") count += 0.5;
      else mod = m === "none" || mod === "set" ? m : mod;
      continue;
    }
    if (STOP.has(t) || GRAM_WORDS.has(t)) continue;
    food.push(t);
  }
  if (!food.length) return { seg: null, oil };
  // "didn't eat the papad" / "no papad": a count means nothing then.
  if (mod === "none") count = null;
  // "half roti", "aadha paratha": half of ONE piece, not half of every roti on the plate.
  if (mod === "half" && count === null && unitGrams === null && pieceNoun(food.join(" "))) {
    count = 0.5;
    mod = "set";
  }
  // Synonyms folded for the name ("chawal" → "rice"), plurals kept as said ("oats" stays "oats").
  const name = food.map((t) => SYNONYMS[t] ?? t).join(" ");
  return { seg: { raw, food: name, count, unitGrams, unitLabel, mod }, oil };
}

export function parseVoice(text: string): VoiceParse {
  const segments: VoiceSeg[] = [];
  const oil: OilCue[] = [];
  for (const s of splitSegments(String(text ?? "").slice(0, 400))) {
    const { seg, oil: o } = parseSegment(s);
    if (seg) segments.push(seg);
    if (o) oil.push(o);
  }
  return { segments, oil };
}

/** Which plate item a spoken food means (most shared tokens; −1 when none). */
export function matchItem(items: Pick<PlateItem, "name">[], food: string): number {
  const want = foodTokens(food).filter((t) => !STOP.has(t));
  let best = -1;
  let bestScore = 0;
  items.forEach((it, i) => {
    const have = new Set(foodTokens(it.name));
    const score = want.filter((t) => have.has(t)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** The countable noun of a food name ("masala dosa" → dosa), or null. */
export function pieceNoun(name: string): string | null {
  const toks = foodTokens(name);
  for (let i = toks.length - 1; i >= 0; i--) if (PIECES[toks[i]]) return toks[i];
  return null;
}

/** An item at `factor` × its grams, every number scaled with it (density unchanged). */
export function scaleItem(it: PlateItem, factor: number): PlateItem {
  const f = Math.max(0, factor);
  const micros: PlateItem["micros"] = {};
  for (const [k, v] of Object.entries(it.micros ?? {})) if (v != null && Number.isFinite(v)) micros[k as keyof PlateItem["micros"]] = r1(Number(v) * f);
  return {
    ...it,
    grams: Math.max(1, Math.round(it.grams * f)),
    calories: Math.round(it.calories * f),
    protein_g: r1(it.protein_g * f),
    carbs_g: r1(it.carbs_g * f),
    fat_g: r1(it.fat_g * f),
    micros,
    ...(it.grams_low != null ? { grams_low: Math.round(it.grams_low * f) } : {}),
    ...(it.grams_high != null ? { grams_high: Math.round(it.grams_high * f) } : {}),
  };
}

const pct = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%`;
const MOD_FACTOR: Record<Exclude<VoiceMod, "set" | "none">, number> = { extra: 1.5, double: 2, less: 0.7, half: 0.5 };
const MOD_WORD: Record<Exclude<VoiceMod, "set" | "none">, string> = { extra: "extra", double: "double", less: "less", half: "half" };

/** Target grams for a spoken amount on a food (existing item or not). null = no amount said. */
function spokenGrams(seg: VoiceSeg, current: PlateItem | null): number | null {
  if (seg.count === null && seg.unitGrams === null) return null;
  const n = seg.count ?? 1;
  if (seg.unitLabel === "g" || seg.unitLabel === "ml") return seg.unitGrams;
  if (seg.unitGrams !== null) return n * seg.unitGrams;
  const noun = pieceNoun(seg.food ?? "") ?? (current ? pieceNoun(current.name) : null);
  if (noun) {
    if (current) {
      const had = Math.max(1, Math.round(current.grams / PIECES[noun]));
      return n * (current.grams / had);
    }
    return n * PIECES[noun];
  }
  if (SPOONABLE.test(seg.food ?? "")) return n * 150;
  // A count of something with no natural unit: that many of the photo's portion (or 100 g each).
  return n * (current ? current.grams : 100);
}

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Counts, units, extra / less / none and foods the photo missed. `added` lists new items (to look up). */
export function applyVoiceAmounts(items: PlateItem[], p: VoiceParse): VoiceMerge {
  let out = items.map((x) => ({ ...x }));
  const changes: string[] = [];
  const removed = new Set<number>();
  const newItems: PlateItem[] = [];
  for (const seg of p.segments) {
    if (!seg.food) continue;
    const idx = matchItem(out, seg.food);
    if (idx >= 0 && !removed.has(idx)) {
      const it = out[idx];
      if (seg.mod === "none") {
        removed.add(idx);
        changes.push(`Removed ${it.name}`);
        continue;
      }
      let grams = spokenGrams(seg, it);
      if (grams === null && seg.mod !== "set") grams = it.grams * MOD_FACTOR[seg.mod];
      else if (grams !== null && seg.mod !== "set") grams = grams * MOD_FACTOR[seg.mod];
      if (grams === null || !(grams > 0)) continue;
      const factor = grams / Math.max(1, it.grams);
      if (Math.abs(factor - 1) < 0.02) continue;
      out[idx] = scaleItem(it, factor);
      const noun = pieceNoun(it.name);
      const shown = out[idx];
      if (seg.count !== null && noun && seg.unitGrams === null) changes.push(`${title(it.name)} → ${seg.count} ${noun} (${shown.grams} g)`);
      else if (seg.count !== null || seg.unitGrams !== null) changes.push(`${title(it.name)} → ${shown.grams} g`);
      else changes.push(`${title(it.name)}: ${MOD_WORD[seg.mod as keyof typeof MOD_WORD]} (${pct(factor)})`);
      continue;
    }
    if (seg.mod === "none") continue; // "no papad" when there's no papad
    // "umm okay", "that's it": not food. A new item needs an amount or a word that is food on its own.
    if (seg.count === null && seg.unitGrams === null && !KNOWN_FOOD.test(seg.food) && !pieceNoun(seg.food) && !OILY.test(seg.food) && !SPOONABLE.test(seg.food)) continue;
    let grams = spokenGrams(seg, null);
    if (grams === null) {
      const noun = pieceNoun(seg.food);
      grams = noun ? PIECES[noun] : SPOONABLE.test(seg.food) ? 150 : 100;
    }
    if (seg.mod !== "set") grams *= MOD_FACTOR[seg.mod];
    grams = Math.max(1, Math.round(grams));
    newItems.push({
      name: seg.food,
      grams,
      confidence: "medium",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      micros: {},
      source: "estimated",
      food_id: null,
      from_voice: true,
    });
    changes.push(`Added ${seg.food} (${grams} g) from your voice`);
  }
  out = out.filter((_, i) => !removed.has(i));
  const added = newItems.map((_, i) => out.length + i);
  return { items: [...out, ...newItems], changes, added };
}

/** Oil cues on the (already priced) items. */
export function applyVoiceOil(items: PlateItem[], p: VoiceParse): { items: PlateItem[]; changes: string[] } {
  let out = items.map((x) => ({ ...x }));
  const changes: string[] = [];
  for (const cue of p.oil) {
    const named = cue.food ? matchItem(out, cue.food) : -1;
    if (cue.level === "extra") {
      let idx = named;
      if (idx < 0) {
        const oily = out.map((it, i) => ({ it, i })).filter(({ it }) => OILY.test(it.name));
        const pool = oily.length ? oily : out.map((it, i) => ({ it, i }));
        idx = pool.sort((a, b) => b.it.calories - a.it.calories)[0]?.i ?? -1;
      }
      if (idx < 0) continue;
      out = out.map((it, i) => (i === idx ? { ...it, fat_g: r1(it.fat_g + 5), calories: it.calories + 45 } : it));
      changes.push(`${title(out[idx].name)}: +1 tsp ghee (+45 kcal)`);
      continue;
    }
    const keep = cue.level === "none" ? 0.4 : 0.7;
    const targets = named >= 0 ? [named] : out.map((it, i) => (OILY.test(it.name) ? i : -1)).filter((i) => i >= 0);
    if (!targets.length) continue;
    let saved = 0;
    out = out.map((it, i) => {
      if (!targets.includes(i)) return it;
      const fat = r1(it.fat_g * keep);
      const kcal = Math.round((it.fat_g - fat) * 9);
      saved += kcal;
      return { ...it, fat_g: fat, calories: Math.max(0, it.calories - kcal) };
    });
    const what = cue.level === "none" ? "No oil" : "Less oil";
    changes.push(named >= 0 ? `${what} on ${out[named].name} (−${saved} kcal)` : `${what} on ${targets.length} dish${targets.length === 1 ? "" : "es"} (−${saved} kcal)`);
  }
  return { items: out, changes };
}

/** Both passes on items that are already priced (the "after the photo" path, and the checks). */
export function mergeVoice(items: PlateItem[], text: string): VoiceMerge {
  const p = parseVoice(text);
  const a = applyVoiceAmounts(items, p);
  const o = applyVoiceOil(a.items, p);
  return { items: o.items, changes: [...a.changes, ...o.changes], added: a.added };
}

/** Voice-added items the web couldn't price (still 0 kcal) are dropped with a note, never logged at 0. */
export function dropUnpriced(items: PlateItem[]): { items: PlateItem[]; notes: string[] } {
  const notes: string[] = [];
  const kept = items.filter((it) => {
    if (it.from_voice && !(it.calories > 0)) {
      notes.push(`Couldn't check "${it.name}" on the web. Add it by hand.`);
      return false;
    }
    return true;
  });
  return { items: kept, notes };
}
