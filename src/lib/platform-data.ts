import { createClient } from "./supabase/server";
import { proState, type ProState } from "./pro";
import { isMissingSchema, parseKind, type InboxItem } from "./notify";
import { parseMeasurement, parsePose, type Measurement, type Photo } from "./body";
import { normalizeDays, type Routine } from "./training";

/**
 * v2.13 platform reads (Pro, notifications, body, training). Kept out of data.ts so the nutrition
 * branch merges cleanly. Every loader tolerates schema_v36 not being applied: it reports
 * `available: false` (the UI then says "Coming with the next update") instead of throwing.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadPro(supabase: Client): Promise<ProState> {
  const [row, cfg] = await Promise.all([supabase.from("profiles").select("plan, pro_until").maybeSingle(), supabase.from("app_config").select("value").eq("key", "pro").maybeSingle()]);
  // Missing column → everyone has Pro (spec §1). No row at all (brand-new account) → default 'beta'.
  const r = row.error ? null : ((row.data as { plan?: unknown; pro_until?: unknown } | null) ?? { plan: "beta", pro_until: null });
  return proState(r, cfg.error ? null : (cfg.data as { value?: unknown } | null)?.value ?? null);
}

export async function getPro(): Promise<ProState> {
  return loadPro(await createClient());
}

export async function getMeasurements(): Promise<{ available: boolean; list: Measurement[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("body_measurements")
    .select("id, date, waist_cm, chest_cm, hips_cm, neck_cm, arm_cm, thigh_cm, calf_cm, body_fat_pct, note, created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return { available: false, list: [] };
  return { available: true, list: ((data ?? []) as Record<string, unknown>[]).map(parseMeasurement) };
}

/** Progress photos with signed URLs; `extended` = the v36 weight / pose columns exist. */
export async function getPhotos(limit = 300): Promise<{ extended: boolean; photos: Photo[] }> {
  const supabase = await createClient();
  const q = (cols: string) => supabase.from("progress_photos").select(cols).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  let extended = true;
  let res = await q("id, date, path, note, weight_kg, pose");
  if (res.error && isMissingSchema(res.error)) {
    extended = false;
    res = await q("id, date, path, note");
  }
  const rows = (res.data ?? []) as unknown as Record<string, unknown>[];
  if (res.error || !rows.length) return { extended, photos: [] };
  const { data: signed } = await supabase.storage.from("progress-photos").createSignedUrls(rows.map((r) => r.path as string), 3600);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    extended,
    photos: rows.map((r) => ({
      id: r.id as string,
      date: r.date as string,
      path: r.path as string,
      note: (r.note as string | null) ?? "",
      url: byPath.get(r.path as string) ?? null,
      weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
      pose: parsePose(r.pose),
    })),
  };
}

export function routineFromRow(r: Record<string, unknown>): Routine {
  return { id: r.id as string, name: (r.name as string) || "Routine", days: normalizeDays(r.days), active: r.active === true, updated_at: (r.updated_at as string | null) ?? null };
}

export async function loadRoutines(supabase: Client): Promise<{ available: boolean; routines: Routine[] }> {
  const { data, error } = await supabase.from("routines").select("id, name, days, active, updated_at").order("active", { ascending: false }).order("updated_at", { ascending: false });
  if (error) return { available: false, routines: [] };
  return { available: true, routines: ((data ?? []) as Record<string, unknown>[]).map(routineFromRow) };
}

export async function getRoutines() {
  return loadRoutines(await createClient());
}

export async function getRoutine(id: string): Promise<Routine | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("routines").select("id, name, days, active, updated_at").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return routineFromRow(data as Record<string, unknown>);
}

export function inboxFromRow(r: Record<string, unknown>): InboxItem {
  return {
    id: r.id as string,
    kind: parseKind(r.kind),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    url: typeof r.url === "string" ? r.url : null,
    created_at: r.created_at as string,
    read_at: (r.read_at as string | null) ?? null,
  };
}

/** `at` = when it was read (the inbox shows "5 min ago" relative to it). */
export async function loadInbox(supabase: Client, limit = 60): Promise<{ available: boolean; items: InboxItem[]; at: number }> {
  const at = Date.now();
  const { data, error } = await supabase.from("notifications").select("id, kind, title, body, url, created_at, read_at").order("created_at", { ascending: false }).limit(limit);
  if (error) return { available: false, items: [], at };
  return { available: true, items: ((data ?? []) as Record<string, unknown>[]).map(inboxFromRow), at };
}

export async function loadUnread(supabase: Client): Promise<number | null> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) return null;
  return count ?? 0;
}

export type NotificationPrefs = { available: boolean; protein_nudge: boolean; protein_nudge_time: string };

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("protein_nudge, protein_nudge_time").maybeSingle();
  if (error) return { available: false, protein_nudge: true, protein_nudge_time: "16:00" };
  const d = (data ?? {}) as { protein_nudge?: unknown; protein_nudge_time?: unknown };
  const t = typeof d.protein_nudge_time === "string" && /^\d{2}:\d{2}/.test(d.protein_nudge_time) ? d.protein_nudge_time.slice(0, 5) : "16:00";
  return { available: true, protein_nudge: d.protein_nudge !== false, protein_nudge_time: t };
}

/** This week's rank in my first squad (the recap's squad slide), or null. */
export async function getSquadRank(): Promise<{ name: string; rank: number; of: number } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: mine } = await supabase.from("group_members").select("group_id, joined_at").eq("user_id", user.id).order("joined_at", { ascending: true }).limit(1);
  const gid = (mine?.[0]?.group_id as string | undefined) ?? null;
  if (!gid) return null;
  const [{ data: g }, lb] = await Promise.all([supabase.from("groups").select("name").eq("id", gid).maybeSingle(), supabase.rpc("group_leaderboard", { g: gid })]);
  if (lb.error) return null;
  const rows = (lb.data ?? []) as { user_id: string; rank: number }[];
  const me = rows.find((r) => r.user_id === user.id);
  return me ? { name: (g?.name as string) ?? "Your squad", rank: Number(me.rank), of: rows.length } : null;
}
