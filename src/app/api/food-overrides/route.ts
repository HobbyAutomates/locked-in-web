import { NextResponse } from "next/server";
import { deleteOverride, getOverrides, putOverride, type OverrideBody } from "@/lib/accuracyServer";
import { apiUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

/**
 * v2.15 per-user "calories per roti" overrides (bandlog.user_food_overrides). Contract: docs/v215-api.md.
 *   GET    ?names=roti,2 eggs      → { available, overrides: [...] } (names normalised server-side;
 *                                    no names = all of the person's, newest first, ≤ 500)
 *   PUT    { name, unit, kcal_per_unit, protein_per_unit?, carbs_per_unit?, fat_per_unit? }
 *   DELETE { name | food_key, unit }
 * `available: false` = schema_v38 not applied: clients hide the "remembered" hint and carry on.
 */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(req.url);
  const names = [...url.searchParams.getAll("name"), ...(url.searchParams.get("names") ?? "").split(",")].map((s) => s.trim()).filter(Boolean);
  return NextResponse.json(await getOverrides(admin, user.id, names));
}

export async function PUT(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const r = await putOverride(admin, user.id, (await req.json().catch(() => ({}))) as OverrideBody);
  if (!r.ok && r.available && r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function DELETE(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await deleteOverride(admin, user.id, (await req.json().catch(() => ({}))) as OverrideBody));
}
