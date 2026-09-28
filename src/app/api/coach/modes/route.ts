import { NextResponse } from "next/server";
import { apiUser, type AdminClient } from "@/lib/apiAuth";
import { localNow } from "@/lib/notify";
import { addMode, deleteCycle, getCycle, listModes, removeMode, saveCycle } from "@/lib/v218/coachPlusServer";
import { cycleDay } from "@/lib/v218/cycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function state(admin: AdminClient, uid: string) {
  const today = localNow().date;
  const [m, c] = await Promise.all([listModes(admin, uid, today), getCycle(admin, uid)]);
  return { date: today, festival: m, cycle: { ...c, today: cycleDay(c.settings, today) } };
}

/**
 * v2.18 festival / wedding mode (B9) and private cycle settings (B6), schema_v43.
 * POST {type: "festival", kind, name, start_date, end_date} | {type: "cycle", enabled, last_period_start, …}.
 * DELETE ?id=<festival id> | ?cycle=1 (turns tracking off and deletes the row).
 */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await state(admin, user.id));
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = body.type === "cycle" ? (body.enabled === false ? await deleteCycle(admin, user.id) : await saveCycle(admin, user.id, body)) : await addMode(admin, user.id, body, localNow().date);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(await state(admin, user.id));
}

export async function DELETE(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const r = sp.get("cycle") === "1" ? await deleteCycle(admin, user.id) : id && /^[0-9a-f-]{36}$/i.test(id) ? await removeMode(admin, user.id, id) : { ok: false as const, error: "Nothing to delete" };
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(await state(admin, user.id));
}
