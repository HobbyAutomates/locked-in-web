/**
 * v2.9 squad sharing (supabase/schema_v31.sql): which logs auto-post to squads, per-squad mutes,
 * who may delete a post, the one-time "Posted to your squads · Change" hint and what an edit
 * re-posts. Pure logic, no I/O. Android mirrors this in util/SquadSharing.kt.
 *
 * Every reader has to cope with schema_v31 not being applied yet: a missing `auto_share` means
 * the default (all three kinds) and a missing `auto_post` means on, which is the v2.8 behaviour.
 */

export const AUTO_SHARE_KINDS = ["meal", "workout", "pr"] as const;
export type AutoShareKind = (typeof AUTO_SHARE_KINDS)[number];
export const DEFAULT_AUTO_SHARE: AutoShareKind[] = [...AUTO_SHARE_KINDS];

export const AUTO_SHARE_LABELS: Record<AutoShareKind, string> = {
  meal: "Auto-post my meals",
  workout: "Auto-post my workouts",
  pr: "Auto-post my PRs",
};

/** profiles.auto_share → the kinds that auto-post. Anything that isn't an array (column missing, null) is the default. */
export function parseAutoShare(v: unknown): AutoShareKind[] {
  if (!Array.isArray(v)) return [...DEFAULT_AUTO_SHARE];
  return AUTO_SHARE_KINDS.filter((k) => v.includes(k));
}

/** Turn one kind on or off, keeping the canonical order and no duplicates. */
export function withAutoShareKind(list: readonly string[], kind: AutoShareKind, on: boolean): AutoShareKind[] {
  return AUTO_SHARE_KINDS.filter((k) => (k === kind ? on : list.includes(k)));
}

/**
 * Would a log of this kind auto-post at all? share_stats off stops everything (unchanged from
 * v2.6); otherwise meal / workout / pr need their switch on. Per-squad mutes are applied by the
 * RPC, squad by squad.
 */
export function autoPostAllowed(input: { shareStats: boolean; autoShare: readonly string[]; kind: string }): boolean {
  if (!input.shareStats) return false;
  if (!(AUTO_SHARE_KINDS as readonly string[]).includes(input.kind)) return true;
  return input.autoShare.includes(input.kind);
}

/** group_members.auto_post → on unless it is explicitly false (column missing = on). */
export function parseAutoPost(v: unknown): boolean {
  return v !== false;
}

/** PostgREST / Postgres "that column doesn't exist" for `column` (schema_v31 not applied yet). */
export function missingColumn(error: { message?: string; code?: string; details?: string | null; hint?: string | null } | null | undefined, column: string): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return text.toLowerCase().includes(column.toLowerCase()) && (error.code === "42703" || error.code === "PGRST204" || /column|schema cache/i.test(text));
}

/** Your own posts, or any post in a squad you own. Never a post that is still sending. */
export function canDeletePost(post: { id: string; user_id: string }, me: string, isOwner: boolean): boolean {
  if (post.id.startsWith("temp-")) return false;
  return post.user_id === me || isOwner;
}

/** The first-time hint: localStorage key (web), and the cookies the server and client use to hand it over. */
export const POST_HINT_SEEN_KEY = "squad-post-hint-seen";
export const POST_HINT_COOKIE = "li_squad_posted";
export const POST_HINT_SEEN_COOKIE = "li_squad_hint_seen";
export const POST_HINT_TEXT = "Posted to your squads";
export const SQUAD_SHARING_HREF = "/profile/preferences/privacy";

/** Show "Posted to your squads · Change" only for a save that actually posted somewhere, and only once. */
export function shouldShowPostHint(postedRows: number | null | undefined, seen: boolean): boolean {
  return !seen && Number(postedRows ?? 0) > 0;
}

/**
 * What an edit re-posts. `existing` is the kinds of my posts that already point at this log;
 * `next` is what the edited log would post now (body null = it no longer qualifies, e.g. a PR
 * that isn't one any more). Only kinds that were posted before are touched, so an edit never
 * creates a brand-new post; a PR that stopped being a PR is removed.
 */
export function editRepostPlan(existing: readonly string[], next: readonly { kind: string; body: string | null }[]): { repost: { kind: string; body: string }[]; remove: string[] } {
  const repost: { kind: string; body: string }[] = [];
  const remove: string[] = [];
  for (const n of next) {
    if (!existing.includes(n.kind)) continue;
    if (n.body && n.body.trim()) repost.push({ kind: n.kind, body: n.body });
    else remove.push(n.kind);
  }
  return { repost, remove };
}
