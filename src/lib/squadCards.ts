import type { LeaderRow } from "./types";

/**
 * v2.16 premium squad list (board PremiumSquad): what each squad card shows, worked out from data
 * the app already loads (group_leaderboard + the latest group_feed rows). Pure, no DB.
 */

export type CardPost = { user_id: string; kind: string; body: string; created_at: string; author_name: string; author_avatar_path: string | null };

export type SquadCard = {
  /** Up to four members for the avatar stack, me first. */
  members: { user_id: string; name: string; avatar_path: string | null }[];
  /** "Ayaan logged lunch · 2m", or null when the squad has no posts yet. */
  latest: string | null;
  /** The squad's best current day streak (the longest 🔥 among members). */
  streak: number;
  /** I'm ranked #1 on the squad leaderboard (and not alone in the squad). */
  first: boolean;
};

export type FriendToday = { user_id: string; name: string; avatar_path: string | null; squadId: string };

/** Asia/Kolkata calendar date of an ISO timestamp. */
export function istDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/** "now", "2m", "1h", "3d". */
export function agoShort(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const first = (name: string) => (name || "Someone").trim().split(/\s+/)[0];

/** One line for the latest post: who did what, and how long ago. */
export function activityLine(p: CardPost, me: string, now: number): string {
  const who = p.user_id === me ? "You" : first(p.author_name);
  const body = p.body.replace(/\s+/g, " ").trim();
  let what: string;
  switch (p.kind) {
    case "message":
      what = body ? `${who}: ${body}` : `${who} said hi`;
      break;
    case "meal":
      what = `${who} logged a meal`;
      break;
    case "workout":
      what = `${who} trained${body ? ` · ${body.split(" · ")[0].toLowerCase()}` : ""}`;
      break;
    case "pr":
      what = `${who} ${who === "You" ? "posted" : "hit"} a PR`;
      break;
    case "photo":
      what = `${who} posted a photo`;
      break;
    default:
      what = body || `${who} posted`;
  }
  const ago = agoShort(p.created_at, now);
  return ago ? `${what} · ${ago}` : what;
}

/** The card for one squad from its leaderboard and newest posts (newest first). */
export function squadCard(me: string, board: LeaderRow[], posts: CardPost[], now: number): SquadCard {
  const mine = board.find((r) => r.user_id === me);
  const others = board.filter((r) => r.user_id !== me);
  const members = [...(mine ? [mine] : []), ...others].slice(0, 4).map((r) => ({ user_id: r.user_id, name: r.name, avatar_path: r.avatar_path }));
  return {
    members,
    latest: posts[0] ? activityLine(posts[0], me, now) : null,
    streak: board.reduce((m, r) => Math.max(m, r.flames), 0),
    first: board.length > 1 && mine?.rank === 1,
  };
}

/** Friends (not me) who logged a meal or a workout today, once each, across all my squads. */
export function friendsToday(me: string, today: string, bySquad: { squadId: string; posts: CardPost[] }[]): FriendToday[] {
  const seen = new Map<string, FriendToday>();
  for (const { squadId, posts } of bySquad) {
    for (const p of posts) {
      if (p.user_id === me || seen.has(p.user_id)) continue;
      if (p.kind !== "meal" && p.kind !== "workout" && p.kind !== "pr") continue;
      if (istDate(p.created_at) !== today) continue;
      seen.set(p.user_id, { user_id: p.user_id, name: p.author_name || "Someone", avatar_path: p.author_avatar_path, squadId });
    }
  }
  return [...seen.values()];
}

/** "Ayaan", "Ayaan and Himanshu", "Ayaan, Himanshu and 2 more". */
export function namesLine(names: string[]): string {
  const f = names.map(first);
  if (f.length <= 1) return f[0] ?? "";
  if (f.length === 2) return `${f[0]} and ${f[1]}`;
  return `${f[0]}, ${f[1]} and ${f.length - 2} more`;
}
