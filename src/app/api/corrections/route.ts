import { NextResponse } from "next/server";
import { saveCorrection, type CorrectionBody } from "@/lib/accuracyServer";
import { apiUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

/**
 * v2.15 "Correct the numbers" (beta): one row in bandlog.food_corrections — what we estimated vs
 * what the person says it is. Web (cookie) and Android (bearer). Contract: docs/v215-api.md.
 * 200 { ok: true, id } · 200 { ok: false, available: false } when schema_v38 isn't applied.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as CorrectionBody;
  const r = await saveCorrection(admin, user.id, body);
  if (!r.ok && r.available && r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
