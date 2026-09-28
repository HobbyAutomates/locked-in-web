import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { localNow } from "@/lib/notify";
import { isIsoDate } from "@/lib/v218/schema";
import { addSupplement, listSupplements, markTaken, removeSupplement, updateSupplement } from "@/lib/v218/coachPlusServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** v2.18 B7 supplements (schema_v43). GET list + streaks; POST add; PATCH tick / edit; DELETE ?id=. */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const now = localNow();
  return NextResponse.json({ date: now.date, ...(await listSupplements(admin, user.id, now)) });
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await addSupplement(admin, user.id, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const now = localNow();
  return NextResponse.json({ id: r.id, date: now.date, ...(await listSupplements(admin, user.id, now)) });
}

export async function PATCH(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isId(body.id)) return NextResponse.json({ error: "Unknown supplement" }, { status: 400 });
  const now = localNow();
  const r =
    typeof body.taken === "boolean"
      ? await markTaken(admin, user.id, body.id, isIsoDate(body.date) ? body.date : now.date, body.taken)
      : await updateSupplement(admin, user.id, body.id, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ date: now.date, ...(await listSupplements(admin, user.id, now)) });
}

export async function DELETE(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return NextResponse.json({ error: "Unknown supplement" }, { status: 400 });
  const r = await removeSupplement(admin, user.id, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const now = localNow();
  return NextResponse.json({ date: now.date, ...(await listSupplements(admin, user.id, now)) });
}
