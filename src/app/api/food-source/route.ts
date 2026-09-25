import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { enrichItems } from "@/lib/itemSources";
import type { SourceInfo } from "@/lib/sourceInfo";
import type { FoodVariant } from "@/lib/variants";

export const runtime = "nodejs";

type In = { food_id?: string | null; name?: string; grams?: number; calories?: number; source?: string; query?: string | null };

/**
 * v2.9 "Where's this from?" for items that didn't arrive with it — the meal editor's saved rows, a
 * search / preset pick. Shared by web and Android (Bearer token).
 *
 *   POST { items: [{ food_id, name, grams, calories, source, query? }] }   (≤ 20)
 *   → 200 { items: [{ source_info, variants? }] }   same order; `variants` only when ambiguous
 *
 * Read-only: provenance from bandlog.foods (source, barcode, source_ref when schema_v32 is applied)
 * and the same data-driven variant detection the parse / scan responses use.
 */
export async function POST(req: Request) {
  const { user } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { items?: In[] };
  type Row = { food_id: string | null; name: string; grams: number; calories: number; source: string; query: string | null; source_info?: SourceInfo | null; variants?: FoodVariant[] };
  const list: Row[] = (Array.isArray(body.items) ? body.items : []).slice(0, 20).map((i) => ({
    food_id: typeof i.food_id === "string" && i.food_id ? i.food_id : null,
    name: String(i.name ?? "").slice(0, 120),
    grams: Number(i.grams) > 0 ? Number(i.grams) : 100,
    calories: Number(i.calories) >= 0 ? Number(i.calories) : 0,
    source: String(i.source ?? (i.food_id ? "table" : "estimated")),
    query: typeof i.query === "string" ? i.query.slice(0, 80) : null,
  }));
  if (!list.length) return NextResponse.json({ items: [] });
  const out: Row[] = await enrichItems(list, { queryOf: (i) => i.query }).catch(() => list);
  return NextResponse.json({
    items: out.map((i) => ({ source_info: i.source_info ?? null, ...(i.variants?.length ? { variants: i.variants } : {}) })),
  });
}
