/**
 * v2.18 coach stream (docs/schema_v43.sql): daily_checkins, supplements, supplement_logs,
 * coach_reviews, festival_modes, cycle_settings, form_checks and fasting_sessions.preset. Until the
 * owner applies v43, reads and writes of those fail with "no such table / column"; this tells those
 * apart from real failures so each feature hides or falls back instead of breaking.
 */
export function missingV43(error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"].includes(error.code ?? "")) return true;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /could not find the (table|column|function)|does not exist|schema cache/i.test(text) && /(daily_checkins|supplement|coach_reviews|festival_modes|cycle_settings|form_checks|preset)/i.test(text);
}

/** yyyy-MM-dd check. */
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Day number since the epoch for a yyyy-MM-dd (UTC maths, no DST surprises). */
export const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
export const isoOfDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const plusDays = (iso: string, n: number) => isoOfDay(dayNo(iso) + n);
/** 1 = Monday … 7 = Sunday. */
export const weekdayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
export const mondayOfIso = (iso: string) => plusDays(iso, -(weekdayOf(iso) - 1));
