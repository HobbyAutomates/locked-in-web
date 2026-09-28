import type { AdminClient } from "@/lib/apiAuth";
import { ANALYTICS_ON } from "@/lib/analytics";
import { overrideKey } from "@/lib/perUnit";

/**
 * v2.15 accuracy tables (docs/schema_v38.sql) — server side of /api/corrections, /api/log-event and
 * /api/food-overrides, shared by web and Android. Every function tolerates the schema not being
 * applied: it reports `available: false` instead of throwing, and the clients hide / skip.
 */

export const INPUT_KINDS = ["text", "photo", "barcode", "label", "manual"] as const;
export type InputKind = (typeof INPUT_KINDS)[number];
export const LOG_KINDS = ["log", "edit", "delete", "skip", "scan_accept", "scan_dismiss", "note"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidOrNull(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v) ? v : null;
}
export function num(v: unknown, max = 100000): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
}
export function str(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

/** PostgREST / Postgres saying a table or column isn't there (schema_v38 not applied yet). */
export function isMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /does not exist|could not find/i.test(error.message ?? "");
}

// ---- corrections -------------------------------------------------------------------------------

export type CorrectionBody = {
  meal_id?: string | null;
  item_name?: string;
  food_id?: string | null;
  input_kind?: string;
  grams?: number | null;
  unit?: string | null;
  count?: number | null;
  app?: { kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null };
  user?: { kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null };
  source?: string | null;
  note?: string | null;
  scan_id?: string | null;
  raw_input?: string | null;
  /** Also remember user.kcal / count as this person's kcal per `unit` for this food. */
  remember?: boolean;
};

export async function saveCorrection(admin: AdminClient, userId: string, b: CorrectionBody): Promise<{ ok: boolean; available: boolean; id?: string; error?: string }> {
  const item_name = str(b.item_name, 160);
  const user_kcal = num(b.user?.kcal, 20000);
  if (!item_name) return { ok: false, available: true, error: "item_name is required" };
  if (user_kcal == null) return { ok: false, available: true, error: "user.kcal is required" };
  const input_kind = (INPUT_KINDS as readonly string[]).includes(String(b.input_kind)) ? (b.input_kind as InputKind) : "manual";
  const count = num(b.count, 1000);
  const unit = str(b.unit, 40);
  const row = {
    user_id: userId,
    meal_id: uuidOrNull(b.meal_id),
    item_name,
    food_id: str(b.food_id, 120),
    input_kind,
    grams: num(b.grams, 100000),
    unit,
    count,
    app_kcal: num(b.app?.kcal, 20000),
    app_protein: num(b.app?.protein, 5000),
    app_carbs: num(b.app?.carbs, 5000),
    app_fat: num(b.app?.fat, 5000),
    user_kcal,
    user_protein: num(b.user?.protein, 5000),
    user_carbs: num(b.user?.carbs, 5000),
    user_fat: num(b.user?.fat, 5000),
    source: str(b.source, 300),
    note: str(b.note, 1000),
    scan_id: uuidOrNull(b.scan_id),
    raw_input: str(b.raw_input, 2000),
  };
  const { data, error } = await admin.from("food_corrections").insert(row).select("id").maybeSingle();
  if (error) return { ok: false, available: !isMissing(error), error: isMissing(error) ? undefined : error.message };
  if (b.remember && count && count > 0 && unit) {
    const per = (v: number | null) => (v == null ? null : Math.round((v / count) * 10) / 10);
    await putOverride(admin, userId, { name: item_name, food_id: row.food_id, unit, kcal_per_unit: user_kcal / count, protein_per_unit: per(row.user_protein), carbs_per_unit: per(row.user_carbs), fat_per_unit: per(row.user_fat) }).catch(() => null);
  }
  return { ok: true, available: true, id: (data as { id?: string } | null)?.id };
}

// ---- entry log ---------------------------------------------------------------------------------

export type LogEventBody = { kind?: string; meal_id?: string | null; item_name?: string | null; payload?: unknown; app_version?: string | null; platform?: string | null };

/** Keep payloads small and flat-ish: at most 30 keys, strings ≤ 500 chars, ~12 KB total. */
export function cleanPayload(p: unknown): Record<string, unknown> {
  if (!p || typeof p !== "object" || Array.isArray(p)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>).slice(0, 30)) {
    out[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 500) : v;
  }
  const json = JSON.stringify(out);
  return json.length > 12000 ? { truncated: true, keys: Object.keys(out).slice(0, 30) } : out;
}

export async function saveLogEvents(admin: AdminClient, userId: string, events: LogEventBody[], defaults: { platform: string; app_version: string | null }): Promise<{ ok: boolean; available: boolean; saved: number; skipped?: "analytics_off" }> {
  if (!ANALYTICS_ON) return { ok: true, available: true, saved: 0, skipped: "analytics_off" };
  const rows = events
    .slice(0, 50)
    .filter((e) => (LOG_KINDS as readonly string[]).includes(String(e?.kind)))
    .map((e) => ({
      user_id: userId,
      kind: e.kind as LogKind,
      meal_id: uuidOrNull(e.meal_id),
      item_name: str(e.item_name, 160),
      payload: cleanPayload(e.payload),
      app_version: str(e.app_version, 20) ?? defaults.app_version,
      platform: e.platform === "web" || e.platform === "android" ? e.platform : defaults.platform === "android" ? "android" : "web",
    }));
  if (!rows.length) return { ok: true, available: true, saved: 0 };
  const { error } = await admin.from("log_events").insert(rows);
  if (error) return { ok: false, available: !isMissing(error), saved: 0 };
  return { ok: true, available: true, saved: rows.length };
}

// ---- per-user overrides ------------------------------------------------------------------------

export type Override = { food_key: string; unit: string; kcal_per_unit: number; protein_per_unit: number | null; carbs_per_unit: number | null; fat_per_unit: number | null; updated_at?: string };
const OVERRIDE_COLS = "food_key, unit, kcal_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit, updated_at";

function toOverride(r: Record<string, unknown>): Override {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { food_key: String(r.food_key), unit: String(r.unit), kcal_per_unit: Number(r.kcal_per_unit), protein_per_unit: n(r.protein_per_unit), carbs_per_unit: n(r.carbs_per_unit), fat_per_unit: n(r.fat_per_unit), updated_at: r.updated_at ? String(r.updated_at) : undefined };
}

/** Overrides for the given food names (normalised server-side), or all of the person's (≤ 500). */
export async function getOverrides(admin: AdminClient, userId: string, names: string[] = []): Promise<{ available: boolean; overrides: Override[] }> {
  let q = admin.from("user_food_overrides").select(OVERRIDE_COLS).eq("user_id", userId);
  const keys = [...new Set(names.map((n) => overrideKey({ name: n })).filter(Boolean))].slice(0, 100);
  if (keys.length) q = q.in("food_key", keys);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);
  if (error) return { available: !isMissing(error), overrides: [] };
  return { available: true, overrides: (data ?? []).map((r) => toOverride(r as Record<string, unknown>)) };
}

export type OverrideBody = { name?: string; food_key?: string; food_id?: string | null; unit?: string; kcal_per_unit?: number; protein_per_unit?: number | null; carbs_per_unit?: number | null; fat_per_unit?: number | null };

export async function putOverride(admin: AdminClient, userId: string, b: OverrideBody): Promise<{ ok: boolean; available: boolean; override?: Override; error?: string }> {
  const food_key = str(b.food_key, 120) ?? (b.name ? overrideKey({ name: b.name, food_id: b.food_id ?? null }) : "");
  const unit = str(b.unit, 40)?.toLowerCase() ?? null;
  const kcal = num(b.kcal_per_unit, 5000);
  if (!food_key || !unit || kcal == null) return { ok: false, available: true, error: "name (or food_key), unit and kcal_per_unit are required" };
  const row = { user_id: userId, food_key, unit, kcal_per_unit: kcal, protein_per_unit: num(b.protein_per_unit, 500), carbs_per_unit: num(b.carbs_per_unit, 1000), fat_per_unit: num(b.fat_per_unit, 500), updated_at: new Date().toISOString() };
  const { data, error } = await admin.from("user_food_overrides").upsert(row, { onConflict: "user_id,food_key,unit" }).select(OVERRIDE_COLS).maybeSingle();
  if (error) return { ok: false, available: !isMissing(error), error: isMissing(error) ? undefined : error.message };
  return { ok: true, available: true, override: data ? toOverride(data as Record<string, unknown>) : undefined };
}

export async function deleteOverride(admin: AdminClient, userId: string, b: OverrideBody): Promise<{ ok: boolean; available: boolean }> {
  const food_key = str(b.food_key, 120) ?? (b.name ? overrideKey({ name: b.name }) : "");
  const unit = str(b.unit, 40)?.toLowerCase();
  if (!food_key || !unit) return { ok: false, available: true };
  const { error } = await admin.from("user_food_overrides").delete().eq("user_id", userId).eq("food_key", food_key).eq("unit", unit);
  return { ok: !error, available: !isMissing(error) };
}
