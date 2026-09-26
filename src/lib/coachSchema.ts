/**
 * v2.14 features live on docs/schema_v37.sql (coach_memory, coach_messages, coach_notes,
 * coach_safety_flags, buddies, buddy_invites, the coach_* / onboarding / milestones_seen profile
 * columns). Until the owner applies it, reads and writes of those come back with "no such table /
 * column / function" errors; this tells those apart from real failures so the feature shows
 * "Coming with the next update" instead of breaking.
 */
export function missingV37(error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"].includes(error.code ?? "")) return true;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /could not find the (table|column|function)|does not exist|schema cache/i.test(text) && /(coach_|buddy|buddies|onboarded_v2|heard_from|obstacles|training_days|sports|first_challenge|milestones_seen|my_buddies)/i.test(text);
}
