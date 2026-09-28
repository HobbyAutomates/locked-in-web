import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { listFormChecks, saveFormCheck } from "@/lib/v218/coachPlusServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** v2.18 C2 form-check history (schema_v43). Only the summary is sent; video never leaves the device. */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await listFormChecks(admin, user.id));
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await saveFormCheck(admin, user.id, body);
  if (!r.ok) return NextResponse.json({ error: r.error, saved: false }, { status: r.unavailable ? 200 : 400 });
  return NextResponse.json({ saved: true, ...(await listFormChecks(admin, user.id)) });
}
