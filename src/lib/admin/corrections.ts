import type { AdminDb } from "./auth";
import { median, pctError } from "@/lib/perUnit";

/**
 * v2.15 /admin "Corrections" card: the latest rows of bandlog.food_corrections (app vs the person's
 * kcal, % error, item, input kind, source) and the median % error by input kind over 7 and 30 days.
 * Read with the service role. `available: false` until schema_v38 is applied.
 */

export type CorrectionRow = {
  id: string;
  created_at: string;
  user_id: string;
  item_name: string;
  input_kind: string;
  app_kcal: number | null;
  user_kcal: number;
  source: string | null;
  note: string | null;
  grams: number | null;
  count: number | null;
  unit: string | null;
};
export type KindStat = { kind: string; n7: number; median7: number | null; absMedian7: number | null; n30: number; median30: number | null; absMedian30: number | null };
export type CorrectionsSummary = { available: boolean; latest: (CorrectionRow & { error_pct: number | null })[]; byKind: KindStat[]; total30: number; skips30: number | null };

export const KINDS = ["photo", "text", "barcode", "label", "manual"] as const;

/** Pure: medians by input kind (signed and absolute % error), for the last 7 and 30 days. */
export function summarize(rows: CorrectionRow[], now = Date.now()): { byKind: KindStat[]; total30: number } {
  const day = 86_400_000;
  const within = (r: CorrectionRow, days: number) => now - Date.parse(r.created_at) <= days * day;
  const errs = (list: CorrectionRow[]) => list.map((r) => pctError(Number(r.app_kcal), Number(r.user_kcal))).filter((v): v is number => v != null);
  const byKind = KINDS.map((kind) => {
    const mine = rows.filter((r) => r.input_kind === kind && r.app_kcal != null);
    const e7 = errs(mine.filter((r) => within(r, 7)));
    const e30 = errs(mine.filter((r) => within(r, 30)));
    return { kind, n7: e7.length, median7: median(e7), absMedian7: median(e7.map(Math.abs)), n30: e30.length, median30: median(e30), absMedian30: median(e30.map(Math.abs)) };
  });
  return { byKind, total30: rows.filter((r) => within(r, 30)).length };
}

const COLS = "id, created_at, user_id, item_name, input_kind, app_kcal, user_kcal, source, note, grams, count, unit";

export async function loadCorrections(db: AdminDb): Promise<CorrectionsSummary> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [recent, month, skips] = await Promise.all([
    db.from("food_corrections").select(COLS).order("created_at", { ascending: false }).limit(25),
    db.from("food_corrections").select(COLS).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    db.from("log_events").select("id", { count: "exact", head: true }).eq("kind", "skip").gte("created_at", since),
  ]);
  if (recent.error || month.error) return { available: false, latest: [], byKind: [], total30: 0, skips30: null };
  const toRow = (r: Record<string, unknown>): CorrectionRow => ({
    id: String(r.id),
    created_at: String(r.created_at),
    user_id: String(r.user_id),
    item_name: String(r.item_name ?? ""),
    input_kind: String(r.input_kind ?? "manual"),
    app_kcal: r.app_kcal == null ? null : Number(r.app_kcal),
    user_kcal: Number(r.user_kcal),
    source: (r.source as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    grams: r.grams == null ? null : Number(r.grams),
    count: r.count == null ? null : Number(r.count),
    unit: (r.unit as string | null) ?? null,
  });
  const latest = (recent.data ?? []).map((r) => toRow(r as Record<string, unknown>)).map((r) => ({ ...r, error_pct: r.app_kcal == null ? null : pctError(r.app_kcal, r.user_kcal) }));
  const { byKind, total30 } = summarize((month.data ?? []).map((r) => toRow(r as Record<string, unknown>)));
  return { available: true, latest, byKind, total30, skips30: skips.error ? null : (skips.count ?? 0) };
}
