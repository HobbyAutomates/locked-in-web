/**
 * v2.18 E5 launch must-haves: report + block in squads (schema_v45 user_blocks, content_reports),
 * account deletion and password reset. Pure. Android: util/Safety.kt.
 */
export const REPORT_REASONS = [
  { key: "spam", label: "Spam or ads" },
  { key: "abuse", label: "Harassment or hate" },
  { key: "nudity", label: "Nudity or sexual content" },
  { key: "self_harm", label: "Self-harm or an eating disorder worry" },
  { key: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

export function parseReason(v: unknown): ReportReason | null {
  return REPORT_REASONS.some((r) => r.key === v) ? (v as ReportReason) : null;
}

/** Device fallback for the block list (used until schema_v45 exists, and as a fast cache). */
export const BLOCKS_KEY = "li-blocked";

/** Drops posts / messages / rows authored by anyone I blocked. */
export function withoutBlocked<T extends { user_id: string }>(rows: T[], blocked: Iterable<string>): T[] {
  const set = new Set(blocked);
  if (!set.size) return rows;
  return rows.filter((r) => !set.has(r.user_id));
}

/** What the report stores about the post (kept short; the post itself may get deleted). */
export function reportSnapshot(p: { kind?: string; body?: string | null; author_name?: string | null; created_at?: string }): string {
  return [p.author_name ? `by ${p.author_name}` : null, p.kind ? `[${p.kind}]` : null, p.created_at ? p.created_at.slice(0, 16) : null, (p.body ?? "").slice(0, 800)].filter(Boolean).join(" ").slice(0, 1000);
}

/* ---------------- Account deletion ---------------- */

export const DELETE_WORD = "DELETE";

/** The delete button unlocks only when the box says DELETE (any case, trimmed). */
export function deleteConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_WORD;
}

/** Storage buckets whose files live under "<user id>/…". */
export const USER_BUCKETS = ["avatars", "progress-photos", "meal-photos", "scan-photos", "group-photos"] as const;

/* ---------------- Password reset ---------------- */

export const MIN_PASSWORD = 6;

export function passwordProblem(pw: string, again: string): string | null {
  if (pw.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters`;
  if (pw !== again) return "The two passwords don't match";
  return null;
}

/** Google sign-in: only when an OAuth client is configured (none is today). See docs/v218-social-shared.md. */
export const GOOGLE_SIGN_IN_ENABLED = false;
