import { createClient } from "../supabase/server";
import { isMissingSchema } from "../notify";
import { clampTokens, parseFreezeEvents } from "./freezes";
import { parseClient, parseCoach, parseOverview, type ClientRow, type CoachRow, type Overview } from "./coachView";
import { parsePledge, type Pledge } from "./pledges";
import { parseSkin, type BadgeSkin } from "./packs";

/**
 * v2.18 social reads (schema_v44 / v45) for server components. Kept out of lib/data.ts so the
 * three v2.18 streams merge cleanly. Every loader reports `available: false` on a missing table /
 * function instead of throwing; the page then shows "Coming with the next update".
 */

type PgErr = { code?: string; message?: string } | null | undefined;
const missing = (e: PgErr) => !!e && (isMissingSchema(e) || e.code === "42883" || /could not find the function/i.test(e.message ?? ""));

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export type Freezes = { available: boolean; tokens: number; usedDays: string[]; earnedWeeks: string[]; lastGiftTo: Record<string, string> };

export async function getFreezes(): Promise<Freezes> {
  const { supabase, user } = await me();
  const none: Freezes = { available: false, tokens: 0, usedDays: [], earnedWeeks: [], lastGiftTo: {} };
  if (!user) return none;
  const [row, ev] = await Promise.all([
    supabase.from("streak_freezes").select("tokens").eq("user_id", user.id).maybeSingle(),
    supabase.from("freeze_events").select("kind, ref, other_user, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(400),
  ]);
  if (row.error || ev.error) return none;
  return { available: true, tokens: clampTokens((row.data as { tokens?: number } | null)?.tokens ?? 0), ...parseFreezeEvents((ev.data ?? []) as Record<string, unknown>[]) };
}

/** Frozen days only (for the day streak on Home / Profile). Empty without v44. */
export async function getFrozenDays(): Promise<string[]> {
  try {
    const { supabase, user } = await me();
    if (!user) return [];
    const { data, error } = await supabase.from("freeze_events").select("ref").eq("user_id", user.id).eq("kind", "use").limit(400);
    if (error) return [];
    return ((data ?? []) as { ref: string }[]).map((r) => r.ref).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } catch {
    return [];
  }
}

export type Referral = { available: boolean; code: string | null; bankedDays: number; proUntil: string | null; friends: { name: string; avatar_path: string | null; joined_at: string }[]; claimed: boolean };

export async function getReferral(): Promise<Referral> {
  const { supabase, user } = await me();
  const none: Referral = { available: false, code: null, bankedDays: 0, proUntil: null, friends: [], claimed: false };
  if (!user) return none;
  const code = await supabase.rpc("my_referral_code");
  if (code.error) return none;
  const [prof, friends, mine] = await Promise.all([
    supabase.from("profiles").select("referral_pro_days, pro_until").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_referrals"),
    supabase.from("referrals").select("referee_id").eq("referee_id", user.id).maybeSingle(),
  ]);
  const p = (prof.data ?? {}) as { referral_pro_days?: number; pro_until?: string | null };
  return {
    available: true,
    code: typeof code.data === "string" ? code.data : null,
    bankedDays: Number(p.referral_pro_days ?? 0) || 0,
    proUntil: p.pro_until ?? null,
    friends: ((friends.data ?? []) as { name: string; avatar_path: string | null; joined_at: string }[]).slice(0, 100),
    claimed: !!mine.data,
  };
}

export type SquadLite = { id: string; name: string; owner_id: string; verified: boolean; org_name: string | null; org_kind: string | null };

/** My squads with the v44 verified columns (falls back to plain rows without them). */
export async function getSquadsLite(): Promise<{ me: string | null; squads: SquadLite[]; verifiedColumns: boolean }> {
  const { supabase, user } = await me();
  if (!user) return { me: null, squads: [], verifiedColumns: false };
  const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  const ids = ((mine ?? []) as { group_id: string }[]).map((m) => m.group_id);
  if (!ids.length) return { me: user.id, squads: [], verifiedColumns: true };
  let res = await supabase.from("groups").select("id, name, owner_id, verified, org_name, org_kind").in("id", ids);
  let verifiedColumns = true;
  if (res.error && missing(res.error)) {
    verifiedColumns = false;
    res = (await supabase.from("groups").select("id, name, owner_id").in("id", ids)) as typeof res;
  }
  const squads = ((res.data ?? []) as Record<string, unknown>[]).map((g) => ({
    id: String(g.id),
    name: String(g.name ?? "Squad"),
    owner_id: String(g.owner_id ?? ""),
    verified: g.verified === true,
    org_name: (g.org_name as string | null) ?? null,
    org_kind: (g.org_kind as string | null) ?? null,
  }));
  return { me: user.id, squads, verifiedColumns };
}

export type SquadMate = { user_id: string; name: string; avatar_path: string | null };

/** Everyone in my squads except me (for the freeze gift picker), deduped. */
export async function getSquadMates(): Promise<SquadMate[]> {
  const { supabase, user } = await me();
  if (!user) return [];
  const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  const ids = ((mine ?? []) as { group_id: string }[]).map((m) => m.group_id);
  const out = new Map<string, SquadMate>();
  for (const g of ids.slice(0, 8)) {
    const { data, error } = await supabase.rpc("group_members_detail", { g });
    if (error) continue;
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = String(r.id ?? r.user_id ?? "");
      if (!id || id === user.id || out.has(id)) continue;
      out.set(id, { user_id: id, name: String(r.name ?? "Squadmate"), avatar_path: (r.avatar_path as string | null) ?? null });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type Verification = { status: "pending" | "approved" | "rejected"; org_name: string; created_at: string; note: string | null };

export async function getVerification(groupId: string): Promise<{ available: boolean; latest: Verification | null }> {
  const { supabase } = await me();
  const { data, error } = await supabase.from("squad_verifications").select("status, org_name, created_at, note").eq("group_id", groupId).order("created_at", { ascending: false }).limit(1);
  if (error) return { available: false, latest: null };
  return { available: true, latest: ((data ?? [])[0] as Verification | undefined) ?? null };
}

export async function getMyCoaches(): Promise<{ available: boolean; coaches: CoachRow[] }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, coaches: [] };
  const { data, error } = await supabase.rpc("my_coaches");
  if (error) return { available: false, coaches: [] };
  return { available: true, coaches: ((data ?? []) as Record<string, unknown>[]).map(parseCoach) };
}

export async function getMyClients(): Promise<{ available: boolean; clients: ClientRow[] }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, clients: [] };
  const { data, error } = await supabase.rpc("my_clients");
  if (error) return { available: false, clients: [] };
  return { available: true, clients: ((data ?? []) as Record<string, unknown>[]).map(parseClient) };
}

export type CoachComment = { id: string; body: string; day: string | null; created_at: string; coach_id: string };

export async function getClientOverview(clientId: string, days = 14): Promise<{ available: boolean; allowed: boolean; overview: Overview | null; comments: CoachComment[] }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, allowed: false, overview: null, comments: [] };
  const { data, error } = await supabase.rpc("client_overview", { p_client: clientId, p_days: days });
  if (error) return missing(error) ? { available: false, allowed: false, overview: null, comments: [] } : { available: true, allowed: false, overview: null, comments: [] };
  const c = await supabase.from("coach_comments").select("id, body, day, created_at, coach_id").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50);
  return { available: true, allowed: true, overview: parseOverview(data), comments: (c.data ?? []) as CoachComment[] };
}

/** Notes my coaches left me. */
export async function getMyCoachNotes(): Promise<CoachComment[]> {
  const { supabase, user } = await me();
  if (!user) return [];
  const { data, error } = await supabase.from("coach_comments").select("id, body, day, created_at, coach_id").eq("client_id", user.id).order("created_at", { ascending: false }).limit(30);
  if (error) return [];
  return (data ?? []) as CoachComment[];
}

export async function getMyPledges(): Promise<{ available: boolean; mine: Pledge[] }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, mine: [] };
  const { data, error } = await supabase.from("pledges").select("*").eq("user_id", user.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50);
  if (error) return { available: false, mine: [] };
  return { available: true, mine: ((data ?? []) as Record<string, unknown>[]).map(parsePledge) };
}

export async function getSquadPledges(groupId: string): Promise<Pledge[]> {
  const { supabase } = await me();
  const { data, error } = await supabase.rpc("squad_pledges", { g: groupId });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(parsePledge);
}

export async function getEventBadges(): Promise<{ available: boolean; earned: { event_id: string; earned_at: string }[] }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, earned: [] };
  const { data, error } = await supabase.from("event_badges").select("event_id, earned_at").eq("user_id", user.id);
  if (error) return { available: false, earned: [] };
  return { available: true, earned: (data ?? []) as { event_id: string; earned_at: string }[] };
}

export async function getPacks(): Promise<{ available: boolean; unlocked: string[]; skin: BadgeSkin; betaFree: boolean; cover: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, unlocked: [], skin: "classic", betaFree: true, cover: null };
  const [u, p, cfg] = await Promise.all([
    supabase.from("pack_unlocks").select("pack_id").eq("user_id", user.id),
    supabase.from("profiles").select("badge_skin, cover_preset").eq("id", user.id).maybeSingle(),
    supabase.from("app_config").select("value").eq("key", "packs").maybeSingle(),
  ]);
  const betaFree = ((cfg.data as { value?: { beta_free?: boolean } } | null)?.value?.beta_free ?? true) !== false;
  if (u.error) return { available: false, unlocked: [], skin: "classic", betaFree, cover: null };
  const prof = (p.error ? {} : (p.data ?? {})) as { badge_skin?: string | null; cover_preset?: string | null };
  return { available: true, unlocked: ((u.data ?? []) as { pack_id: string }[]).map((r) => r.pack_id), skin: parseSkin(prof.badge_skin), betaFree, cover: prof.cover_preset ?? null };
}

export async function getLiveShare(): Promise<{ available: boolean; on: boolean }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, on: false };
  const { data, error } = await supabase.from("profiles").select("live_share").eq("id", user.id).maybeSingle();
  if (error) return { available: false, on: false };
  return { available: true, on: (data as { live_share?: boolean } | null)?.live_share === true };
}

export async function getLeaguesFlag(): Promise<boolean> {
  const { supabase } = await me();
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "leagues").maybeSingle();
  if (error) return false;
  return (data as { value?: { enabled?: boolean } } | null)?.value?.enabled === true;
}
