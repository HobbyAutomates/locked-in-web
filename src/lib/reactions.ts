/**
 * v2.11 squad reactions + chat read receipts (supabase/schema_v35.sql). Pure logic, no I/O.
 * Android mirrors this in util/Reactions.kt; `npx tsx scripts/check-reactions.ts` covers both
 * sets of rules.
 *
 * Every reader has to cope with schema_v35 not being applied yet: group_feed then returns rows
 * without `reactions` / `my_reaction` (read as "no reactions"), and the read-status RPC is
 * missing (read receipts and unread badges just don't show).
 */

/** The six reactions, in bar order. ❤️ is U+2764 U+FE0F, exactly as the database check stores it. */
export const REACTIONS = ["❤️", "🔥", "👍", "😂", "😮", "💪"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A post's reaction state: counts per emoji and the viewer's own emoji (at most one). */
export type ReactionState = { counts: Record<string, number>; mine: string | null };

/** "❤" (no variation selector) and other near-misses map onto the canonical six; anything else is null. */
export function normalizeReaction(e: unknown): Reaction | null {
  if (typeof e !== "string") return null;
  const t = e.trim();
  if ((REACTIONS as readonly string[]).includes(t)) return t as Reaction;
  const bare = t.replace(/️/g, "");
  return REACTIONS.find((r) => r.replace(/️/g, "") === bare) ?? null;
}

/** group_feed's `reactions` jsonb (or anything else) → clean counts: known emojis, positive whole numbers. */
export function parseCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const e = normalizeReaction(k);
    const c = Math.floor(Number(n));
    if (e && Number.isFinite(c) && c > 0) out[e] = (out[e] ?? 0) + c;
  }
  return out;
}

/**
 * What tapping `emoji` does, WhatsApp-style: the same emoji again removes yours; a different one
 * replaces it (its count moves); with none yet, it's added. Returns the new state and the value to
 * save (null = delete my row).
 */
export function toggleReaction(state: ReactionState, emoji: string): { state: ReactionState; save: Reaction | null } {
  const e = normalizeReaction(emoji);
  if (!e) return { state, save: normalizeReaction(state.mine) };
  const counts = { ...state.counts };
  const bump = (k: string, d: number) => {
    const n = (counts[k] ?? 0) + d;
    if (n > 0) counts[k] = n;
    else delete counts[k];
  };
  const mine = normalizeReaction(state.mine);
  if (mine) bump(mine, -1);
  if (mine === e) return { state: { counts, mine: null }, save: null };
  bump(e, 1);
  return { state: { counts, mine: e }, save: e };
}

/** Double-tap on a Feed post: a quick ❤️. Sets ❤️ (replacing another emoji); never removes it. */
export function quickHeart(state: ReactionState): { state: ReactionState; save: Reaction | null } | null {
  if (normalizeReaction(state.mine) === "❤️") return null;
  return toggleReaction(state, "❤️");
}

export type ReactionChip = { emoji: Reaction; count: number; mine: boolean };

/** The chips under a post ("❤️ 3  🔥 2"): most reactions first, ties in bar order; mine flagged. */
export function reactionChips(state: ReactionState): ReactionChip[] {
  const mine = normalizeReaction(state.mine);
  return REACTIONS.map((emoji, i) => ({ emoji, count: state.counts[emoji] ?? 0, mine: mine === emoji, i }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .map(({ emoji, count, mine }) => ({ emoji, count, mine }));
}

export const reactionTotal = (state: ReactionState) => Object.values(state.counts).reduce((a, n) => a + n, 0);

/* ---------------- Chat: sender runs ---------------- */

/** Messages from one person less than this apart form one run (one name, one avatar). */
export const RUN_GAP_MS = 5 * 60_000;

type RunPost = { user_id: string; created_at: string };

/**
 * For Chat in oldest → newest order: where each run of consecutive messages from the same person
 * starts (show the name) and ends (show the avatar and time), WhatsApp-style.
 */
export function chatRuns(posts: readonly RunPost[]): { first: boolean; last: boolean }[] {
  const t = (p: RunPost) => new Date(p.created_at).getTime();
  const same = (a: RunPost | undefined, b: RunPost | undefined) => !!a && !!b && a.user_id === b.user_id && Math.abs(t(b) - t(a)) < RUN_GAP_MS;
  return posts.map((p, i) => ({ first: !same(posts[i - 1], p), last: !same(p, posts[i + 1]) }));
}

/* ---------------- Chat: read receipts ---------------- */

/** One row of `group_read_status(g)`. */
export type ReadRow = { user_id: string; name: string; username?: string | null; avatar_path: string | null; last_read_at: string | null };

export type SeenState = "sent" | "some" | "all";

/**
 * "Seen by" for one of my messages: every other member whose last_read_at is at or after the
 * message's created_at has seen it. `sent` (grey ✓) when nobody has (or I'm alone in the squad),
 * `some` (blue ✓✓ "Seen by N"), `all` (blue ✓✓ "Seen by everyone"). Seen people newest read first.
 */
export function seenBy(rows: readonly ReadRow[], me: string, createdAt: string): { state: SeenState; seen: ReadRow[]; unseen: ReadRow[]; label: string } {
  const at = new Date(createdAt).getTime();
  const others = rows.filter((r) => r.user_id !== me);
  const seen: ReadRow[] = [];
  const unseen: ReadRow[] = [];
  for (const r of others) {
    const t = r.last_read_at ? new Date(r.last_read_at).getTime() : NaN;
    (Number.isFinite(t) && t >= at ? seen : unseen).push(r);
  }
  seen.sort((a, b) => new Date(b.last_read_at ?? 0).getTime() - new Date(a.last_read_at ?? 0).getTime());
  const state: SeenState = !seen.length ? "sent" : unseen.length ? "some" : "all";
  const label = state === "sent" ? "Sent" : state === "all" ? "Seen by everyone" : `Seen by ${seen.length}`;
  return { state, seen, unseen, label };
}

/** The unread badge text: nothing for 0, "99+" past 99. */
export function unreadLabel(n: number | null | undefined): string | null {
  const c = Math.floor(Number(n ?? 0));
  if (!Number.isFinite(c) || c <= 0) return null;
  return c > 99 ? "99+" : String(c);
}

/** PostgREST / Postgres saying a v35 table or function isn't there yet. */
export function missingV35(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "") || /(post_reactions|group_reads|mark_read|group_read_status|post_reactors|my_unread_counts).*(does not exist|could not find)|could not find the (function|table)/i.test(error.message ?? "");
}
