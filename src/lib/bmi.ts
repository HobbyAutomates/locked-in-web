import lms from "./who2007-bmi-lms.json";

/**
 * v2.10 body metrics. Pure functions only — no React, no DB — so scripts/check-goals.ts can run
 * the spec's test vectors against them. Android's util/Bmi.kt is a line-for-line port.
 *
 * Sources (see docs in the science spec, "The science" sheet repeats them for users):
 * - Adult BMI, Indian cut-offs 23 / 25: Misra A et al. 2009, Consensus statement for Asian Indians
 *   (JAPI); WHO Expert Consultation, Lancet 2004;363:157-163. WHO global 25 / 30 kept as secondary.
 * - Healthy range 18.5–22.9 × height²: the same Indian cut-offs, shown as a range, never one number.
 * - Teen BMI-for-age: WHO Growth Reference 2007 (5–19 y) LMS tables, bundled in who2007-bmi-lms.json.
 * - Waist-to-height ratio < 0.5: Ashwell & Gibson; one signal, not a verdict.
 */

export type BmiSex = "male" | "female" | "other" | null;

export type IndiaCategory = "Underweight" | "Normal" | "Overweight" | "Obese";
export type WhoCategory = IndiaCategory;
export type TeenCategory = "Severe thinness" | "Thinness" | "Normal" | "Overweight" | "Obese";

/** kg / m². Null when either number is missing or silly. */
export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Indian / Asian consensus cut-offs (adults ≥ 18): 18.5 / 23 / 25. The primary label in the app. */
export function bmiCategoryIndia(b: number): IndiaCategory {
  if (b < 18.5) return "Underweight";
  if (b < 23.0) return "Normal";
  if (b < 25.0) return "Overweight";
  return "Obese";
}

/** WHO global cut-offs (adults): 18.5 / 25 / 30. Shown second, for people comparing with other apps. */
export function bmiCategoryWHO(b: number): WhoCategory {
  if (b < 18.5) return "Underweight";
  if (b < 25.0) return "Normal";
  if (b < 30.0) return "Overweight";
  return "Obese";
}

/** Healthy weight range for a height: BMI 18.5–22.9 × height². One decimal, as shown on screen. */
export function healthyRange(heightCm: number): { min: number; max: number } {
  const m2 = (heightCm / 100) ** 2;
  return { min: Math.round(18.5 * m2 * 10) / 10, max: Math.round(22.9 * m2 * 10) / 10 };
}

// ---------------------------------------------------------------- teens: WHO 2007 BMI-for-age

type LmsRow = [number, number, number];
type LmsTable = { firstMonth: number; lastMonth: number; boys: LmsRow[]; girls: LmsRow[] };
const TABLE = lms as unknown as LmsTable;

/** The bundled table's age span in completed months (61–216). */
export const LMS_FIRST_MONTH = TABLE.firstMonth;
export const LMS_LAST_MONTH = TABLE.lastMonth;

/** [L, M, S] for a sex and age in completed months; null outside the bundled 61–216 months. */
export function lmsRow(sex: "male" | "female", months: number): LmsRow | null {
  const m = Math.floor(months);
  if (m < TABLE.firstMonth || m > TABLE.lastMonth) return null;
  return (sex === "male" ? TABLE.boys : TABLE.girls)[m - TABLE.firstMonth] ?? null;
}

/** The BMI at a given z for one LMS row (inverse Box-Cox): M·(1 + L·S·z)^(1/L). */
export function bmiAtZ(row: LmsRow, z: number): number {
  const [l, m, s] = row;
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

/**
 * LMS z-score with WHO's restricted tails: beyond ±3 SD the distance is measured in units of the
 * 2→3 SD gap (as WHO AnthroPlus does), so a very high BMI does not produce an absurd z.
 */
export function zFromLms(b: number, row: LmsRow): number {
  const [l, m, s] = row;
  const z = l === 0 ? Math.log(b / m) / s : (Math.pow(b / m, l) - 1) / (l * s);
  if (z > 3) {
    const sd3 = bmiAtZ(row, 3);
    const sd23 = sd3 - bmiAtZ(row, 2);
    return 3 + (b - sd3) / sd23;
  }
  if (z < -3) {
    const sd3neg = bmiAtZ(row, -3);
    const sd23neg = bmiAtZ(row, -2) - sd3neg;
    return -3 + (b - sd3neg) / sd23neg;
  }
  return z;
}

/**
 * BMI-for-age z for a sex and age in completed months. "other" (or unset) averages the boys' and
 * girls' z-scores — an approximation, like Mifflin's midpoint constant. Null outside 61–216 months.
 */
export function bmiForAgeZ(b: number, sex: BmiSex, months: number): number | null {
  if (sex === "male" || sex === "female") {
    const row = lmsRow(sex, months);
    return row ? zFromLms(b, row) : null;
  }
  const boy = lmsRow("male", months);
  const girl = lmsRow("female", months);
  return boy && girl ? (zFromLms(b, boy) + zFromLms(b, girl)) / 2 : null;
}

/** WHO 5–19 y cut-offs: < −3 severe thinness, < −2 thinness, ≤ +1 normal, ≤ +2 overweight, else obese. */
export function bmiForAgeCategory(z: number): TeenCategory {
  if (z < -3) return "Severe thinness";
  if (z < -2) return "Thinness";
  if (z <= 1) return "Normal";
  if (z <= 2) return "Overweight";
  return "Obese";
}

/**
 * Plain, kind words for a teen's z-score — no "obese", no "thin" labels on screen. The category
 * above is kept for logic (safety flags); this is what a 15-year-old actually reads.
 */
export function teenBmiWords(z: number): { title: string; detail: string } {
  if (z < -2) return { title: "Lighter than most people your age", detail: "Worth a chat with a doctor or dietitian so you have plenty of fuel to grow." };
  if (z <= 1) return { title: "Right in the usual range for your age", detail: "Your body is growing on track. Keep fuelling your training." };
  if (z <= 2) return { title: "A bit above the usual range for your age", detail: "Totally common while growing. Moving often and regular meals help most." };
  return { title: "Above the usual range for your age", detail: "A doctor or dietitian can help you with a plan that fits a growing body." };
}

/**
 * The usual weight range for a teen's height and age: BMI-for-age z −2 to +1 (WHO's normal band)
 * × height², one decimal. "other" / unset averages the boys' and girls' BMIs. Null outside 61–216 mo.
 */
export function teenHealthyRange(heightCm: number, sex: BmiSex, months: number): { min: number; max: number } | null {
  const rows = sex === "male" || sex === "female" ? [lmsRow(sex, months)] : [lmsRow("male", months), lmsRow("female", months)];
  if (rows.some((r) => !r)) return null;
  const at = (z: number) => rows.reduce((a, r) => a + bmiAtZ(r as LmsRow, z), 0) / rows.length;
  const m2 = (heightCm / 100) ** 2;
  return { min: Math.round(at(-2) * m2 * 10) / 10, max: Math.round(at(1) * m2 * 10) / 10 };
}

/** Rough percentile for a z (normal CDF), for "about the 60th percentile" style copy. */
export function percentileFromZ(z: number): number {
  // Abramowitz–Stegun 7.1.26 erf approximation; plenty for a whole-number percentile.
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  const cdf = z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  return Math.min(99, Math.max(1, Math.round(cdf * 100)));
}

/** Age in completed months on `today` (ISO yyyy-MM-dd); null when the birthday is missing or later. */
export function ageMonths(dob: string | null | undefined, today: string): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = today.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d || !ty || !tm || !td) return null;
  let months = (ty - y) * 12 + (tm - m);
  if (td < d) months--;
  return months >= 0 ? months : null;
}

// ---------------------------------------------------------------- waist-to-height

/** waist / height, or null. */
export function waistToHeight(waistCm: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!waistCm || !heightCm || waistCm <= 0 || heightCm <= 0) return null;
  return waistCm / heightCm;
}

/** < 0.5 reads as fine; at or above it is "worth a check-in", never "unhealthy". */
export function whtrWords(r: number): { ok: boolean; text: string } {
  return r < 0.5
    ? { ok: true, text: "Under 0.5, the range linked with lower health risk." }
    : { ok: false, text: "0.5 or more. One signal, not a verdict: worth a check-in with a doctor sometime." };
}
