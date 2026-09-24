/**
 * Deterministic nutrition-table parser + sanity gate, shared by the label and barcode pipelines
 * (see src/lib/scanFlows.ts and src/lib/labelAnalysis.ts). Kotlin port: util/LabelParse.kt in the
 * Android app.
 *
 * Why this exists: the model was restating "facts" it never actually read (see v2.7 bug reports —
 * a seeds pack scanned front-only still produced a full per-100g table, and an Open Food Facts
 * record with mis-scaled per-serving numbers was cached and shown unchecked). This module is the
 * single source of truth for "does this text actually contain a nutrition table" and "are these
 * numbers physically possible" — nothing downstream is allowed to invent numbers past it.
 */

export type Per100 = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  added_sugar_g?: number;
  fat_g?: number;
  saturated_fat_g?: number;
  trans_fat_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
};

export type ParsedLabel = {
  /** Values found under a "per 100 g" (or default, when no header disambiguates) context. */
  per_100g: Per100;
  /** Values found under a "per serving" context, if the label used that column instead. */
  per_serving: Per100;
  /** Serving size in grams, if printed ("Serving size: 30 g"). */
  serving_g: number | null;
  /** True if we found ANY nutrient row — front-of-pack marketing text won't set this. */
  hasTable: boolean;
  /** True once per_100g has energy + protein + carbs + fat (after deriving from per_serving if needed). */
  coreComplete: boolean;
};

const NUM = /(\d+(?:[.,]\d+)?)/;

/** label regex -> Per100 key. Order matters: more specific rows (trans/saturated/added) must be
 *  tried before their generic parents (fat, sugar) so "Trans Fat 0g" doesn't get read as "Fat". */
const KEY_PATTERNS: { key: keyof Per100; re: RegExp }[] = [
  { key: "trans_fat_g", re: /\btrans[\s-]*fat/i },
  { key: "saturated_fat_g", re: /\b(?:saturated|sat\.?)[\s-]*fat|of\s+which\s+saturates/i },
  { key: "added_sugar_g", re: /\badded\s+sugars?/i },
  { key: "sugar_g", re: /\b(?:total\s+)?sugars?\b|of\s+which\s+sugars/i },
  { key: "fiber_g", re: /\bfib(?:re|er)\b/i },
  { key: "fat_g", re: /\b(?:total\s+)?fat\b/i },
  { key: "carbs_g", re: /\b(?:total\s+)?carbohydrates?\b/i },
  { key: "protein_g", re: /\bprotein\b/i },
  { key: "sodium_mg", re: /\bsodium\b/i },
];

const SALT_RE = /\bsalt\b/i;
const ENERGY_RE = /\benerg(?:y|ie)\b|\bcalories\b/i;
const KCAL_RE = /(\d+(?:[.,]\d+)?)\s*k\s*cal\b/i;
const KJ_RE = /(\d+(?:[.,]\d+)?)\s*kj\b/i;
const SERVING_HEADER_RE = /per\s*serv(?:ing)?\b|per\s*pack\b|\(per\s*serving\)/i;
const HUNDRED_HEADER_RE = /per\s*100\s*g|per\s*100g|amount\s+per\s*100/i;
const SERVING_SIZE_RE = /serving\s*size[^0-9]{0,12}(\d+(?:[.,]\d+)?)\s*g\b/i;

function num(s: string): number | null {
  const m = s.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : null;
}

/** First bare number this line (or one of the next couple of lines) carries, for "label\nvalue" labels. */
function valueNear(lines: string[], i: number, stripped: string): number | null {
  const inline = num(stripped);
  if (inline != null) return inline;
  for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
    const v = num(lines[j]);
    if (v != null) return v;
    // a non-numeric, non-blank line before finding a number means the value isn't "next line"
    if (lines[j].trim() && !/^[-:\s]*$/.test(lines[j])) break;
  }
  return null;
}

function parseEnergyKcal(line: string): number | null {
  const kcal = line.match(KCAL_RE);
  if (kcal) return num(kcal[1]);
  const kj = line.match(KJ_RE);
  if (kj) {
    const v = num(kj[1]);
    return v == null ? null : Math.round((v / 4.184) * 100) / 100;
  }
  return null;
}

/** Parses a label/OCR transcript (or an Open Food Facts flattened transcript) into a nutrition table. */
export function parseNutritionLabel(text: string): ParsedLabel {
  const per_100g: Per100 = {};
  const per_serving: Per100 = {};
  let serving_g: number | null = null;
  let context: "100g" | "serving" = "100g";
  let sawHeader = false;
  const matchedKeys = new Set<string>();

  const rawLines = String(text ?? "").split(/\r?\n/);
  const consumed = new Set<number>();

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line.trim()) continue;

    const sSize = line.match(SERVING_SIZE_RE);
    if (sSize) {
      const v = num(sSize[1]);
      if (v != null && v > 0) serving_g = v;
    }
    if (HUNDRED_HEADER_RE.test(line)) {
      context = "100g";
      sawHeader = true;
    } else if (SERVING_HEADER_RE.test(line)) {
      context = "serving";
      sawHeader = true;
    }

    if (ENERGY_RE.test(line) && !consumed.has(i)) {
      let kcal = parseEnergyKcal(line);
      if (kcal == null) {
        // "Energy" on its own line, value (kcal or kJ) on the next.
        for (let j = i + 1; j < Math.min(rawLines.length, i + 3); j++) {
          kcal = parseEnergyKcal(rawLines[j]);
          if (kcal != null) break;
          if (rawLines[j].trim() && !/^[-:\s]*$/.test(rawLines[j])) break;
        }
      }
      if (kcal != null) {
        (context === "100g" ? per_100g : per_serving).calories = kcal;
        matchedKeys.add("calories");
        consumed.add(i);
        continue;
      }
    }

    // Salt -> sodium (mg), used only when the line isn't already claimed as a sodium row.
    if (SALT_RE.test(line) && !KEY_PATTERNS.some((p) => p.key === "sodium_mg" && p.re.test(line))) {
      const stripped = line.replace(HUNDRED_HEADER_RE, "").replace(SALT_RE, "");
      const g = valueNear(rawLines, i, stripped);
      if (g != null) {
        const bucket = context === "100g" ? per_100g : per_serving;
        if (bucket.sodium_mg == null) bucket.sodium_mg = Math.round(g * 400 * 100) / 100;
        matchedKeys.add("sodium_mg");
        continue;
      }
    }

    for (const { key, re } of KEY_PATTERNS) {
      if (!re.test(line)) continue;
      const stripped = line.replace(HUNDRED_HEADER_RE, "").replace(re, "");
      const v = valueNear(rawLines, i, stripped);
      if (v == null) continue;
      const bucket = context === "100g" ? per_100g : per_serving;
      if (bucket[key] == null) bucket[key] = v;
      matchedKeys.add(key);
      break;
    }
  }

  // A real nutrition table either says so ("per 100 g" / "per serving") near at least one
  // matched row, or has enough distinct rows that it clearly isn't a stray mention of "protein"
  // in front-of-pack marketing copy ("...21g Non GMO Protein...", the seeds-label bug). One loose
  // match with no header is exactly what front-of-pack text produces — that must not count.
  const hasTable = (sawHeader && matchedKeys.size >= 1) || matchedKeys.size >= 3;

  // No explicit "per 100 g" table, but a per-serving one plus a serving size: derive per_100g.
  if (hasTable && serving_g && serving_g > 0 && !coreOk(per_100g) && coreOk(per_serving)) {
    Object.assign(per_100g, derivePer100FromServing(per_serving, serving_g));
  }

  return { per_100g: hasTable ? per_100g : {}, per_serving: hasTable ? per_serving : {}, serving_g, hasTable, coreComplete: hasTable && coreOk(per_100g) };
}

function coreOk(p: Per100): boolean {
  return p.calories != null && p.protein_g != null && p.carbs_g != null && p.fat_g != null;
}

/** Scales every field of a per-serving table up to per-100g using the printed serving size. */
export function derivePer100FromServing(perServing: Per100, servingG: number): Per100 {
  if (!(servingG > 0)) return {};
  const k = 100 / servingG;
  const out: Per100 = {};
  for (const key of Object.keys(perServing) as (keyof Per100)[]) {
    const v = perServing[key];
    if (v != null) out[key] = Math.round(v * k * 100) / 100;
  }
  return out;
}

export type SanityResult = { ok: boolean; reasons: string[] };

/**
 * The sanity gate every per_100g goes through before it's trusted, whatever produced it (OCR
 * parser, Open Food Facts, or a web estimate). Catches physically-impossible numbers like the
 * True Elements Muesli barcode bug (1037 kcal / 100 g from mis-scaled OFF per-serving data).
 */
export function sanityCheckPer100(p: Per100): SanityResult {
  const reasons: string[] = [];
  const { calories, protein_g, carbs_g, fat_g, sugar_g, saturated_fat_g } = p;
  if (calories == null || protein_g == null || carbs_g == null || fat_g == null) {
    return { ok: false, reasons: ["missing a core field (calories/protein/carbs/fat)"] };
  }
  if (calories < 0 || calories > 905) reasons.push(`calories ${calories} out of 0-905`);
  for (const [name, v] of [["protein", protein_g], ["carbs", carbs_g], ["fat", fat_g], ["sugar", sugar_g], ["saturated fat", saturated_fat_g]] as const) {
    if (v != null && v < 0) reasons.push(`${name} is negative (${v})`);
  }
  const macroSum = protein_g + carbs_g + fat_g;
  if (macroSum > 102) reasons.push(`protein+carbs+fat = ${Math.round(macroSum * 10) / 10} g, over 100 g`);
  const atwater = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  const allowed = calories * 0.25 + 15;
  if (Math.abs(atwater - calories) > allowed) reasons.push(`Atwater estimate ${Math.round(atwater)} kcal vs stated ${calories} kcal (outside ±${Math.round(allowed)})`);
  if (sugar_g != null && sugar_g > carbs_g + 0.5) reasons.push(`sugar ${sugar_g} g exceeds carbs ${carbs_g} g`);
  if (saturated_fat_g != null && saturated_fat_g > fat_g + 0.5) reasons.push(`saturated fat ${saturated_fat_g} g exceeds fat ${fat_g} g`);
  return { ok: reasons.length === 0, reasons };
}

/** Rounds every present field to 2 decimal places, dropping nulls/NaN. */
export function roundPer100(p: Per100): Per100 {
  const out: Per100 = {};
  for (const key of Object.keys(p) as (keyof Per100)[]) {
    const v = p[key];
    if (v != null && Number.isFinite(v)) out[key] = Math.round(v * 100) / 100;
  }
  return out;
}

// ---- barcode digits recovered from a label transcript ----

function eanChecksumValid(digits: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const check = nums.pop() as number;
  let sum = 0;
  // From the right, excluding the check digit: weight 3,1,3,1,... (equivalent to the standard
  // left-indexed 1,3,1,3,... rule for both EAN-8 and EAN-13).
  for (let i = 0; i < nums.length; i++) {
    const posFromRight = nums.length - i; // 1-indexed from the right
    sum += nums[i] * (posFromRight % 2 === 1 ? 3 : 1);
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

/**
 * Best-effort EAN-13/EAN-8/UPC-A recovery from OCR'd label text: tolerates spaces/dashes and the
 * usual OCR confusions (i/I/l -> 1, O/o -> 0), and only returns a code whose check digit is valid.
 */
export function extractBarcode(text: string): string | null {
  const runs = String(text ?? "").match(/[0-9oOiIl][0-9oOiIl \-]{6,18}[0-9oOiIl]/g) ?? [];
  for (const run of runs) {
    const cleaned = run.replace(/[oO]/g, "0").replace(/[iIl]/g, "1").replace(/[^0-9]/g, "");
    for (const len of [13, 12, 8]) {
      for (let start = 0; start + len <= cleaned.length; start++) {
        const candidate = cleaned.slice(start, start + len);
        if (len === 12) {
          const asEan13 = `0${candidate}`;
          if (eanChecksumValid(asEan13)) return asEan13;
        } else if (eanChecksumValid(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}
