/**
 * v2.18 D7 live squad sessions (schema_v44 live_sessions / live_cheers, profiles.live_share,
 * RPCs squad_live and live_cheer). Opt-in, OFF by default. Pure. Android: util/LiveSquad.kt.
 */
export const LIVE_HEARTBEAT_MS = 4 * 60_000;
export const LIVE_FRESH_MIN = 20;
export const LIVE_MAX_HOURS = 4;
export const CHEER_COOLDOWN_MIN = 10;
/** Device copy of the opt-in (so the live workout doesn't wait on a network read). */
export const LIVE_PREF_KEY = "li-live-share";

export type LiveRow = { user_id: string; name: string; avatar_path: string | null; label: string; started_at: string; cheers: number };

export function isLiveFresh(seenAt: string, startedAt: string, now: Date = new Date()): boolean {
  const s = Date.parse(seenAt);
  const st = Date.parse(startedAt);
  if (!Number.isFinite(s) || !Number.isFinite(st)) return false;
  return now.getTime() - s <= LIVE_FRESH_MIN * 60_000 && now.getTime() - st <= LIVE_MAX_HOURS * 3600_000;
}

/** "Ayan is training now 🔥" (first name only). */
export function liveLine(name: string, label?: string | null): string {
  const first = (name || "Someone").trim().split(/\s+/)[0] || "Someone";
  const what = (label ?? "").trim().toLowerCase();
  const verb = !what || what === "training" ? "training" : `on ${what}`;
  return `${first} is ${verb} now 🔥`;
}

/** "12 min in" / "1 h 05 min in". */
export function liveElapsed(startedAt: string, now: Date = new Date()): string {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (m < 60) return `${m} min in`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min in`;
}

export function parseLiveRows(rows: Record<string, unknown>[], me: string): LiveRow[] {
  return rows
    .filter((r) => typeof r.user_id === "string" && r.user_id !== me)
    .map((r) => ({
      user_id: r.user_id as string,
      name: (r.name as string) || "Squadmate",
      avatar_path: (r.avatar_path as string | null) ?? null,
      label: (r.label as string) || "Training",
      started_at: (r.started_at as string) || new Date(0).toISOString(),
      cheers: Math.max(0, Math.floor(Number(r.cheers ?? 0)) || 0),
    }));
}
