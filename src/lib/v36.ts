/**
 * v2.13 features live on schema_v36 (recipes, fasting_sessions, weekly_checkins, the diet-mode /
 * adaptive / fasting columns on profiles, label_scans kind 'menu'). Until the owner applies it,
 * every read or write of those comes back with a "no such table / column" error; this tells those
 * apart from real failures so the feature shows "Coming with the next update" instead of breaking.
 */

export const COMING_SOON = "Coming with the next update";

export function missingV36(error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "")) return true;
  return /could not find the (table|column)|does not exist|schema cache/i.test(text) && /(recipes|fasting_sessions|weekly_checkins|diet_mode|adaptive_targets|fasting_hours|protein_nudge)/i.test(text);
}
