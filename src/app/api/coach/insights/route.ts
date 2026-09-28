import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { localNow } from "@/lib/notify";
import { loadInsights } from "@/lib/v218/coachPlusServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * v2.18 coach insights: consistency score (B11), plateau detective (B5), the weekly check-in (B2;
 * `?generate=1` writes and stores this week's review with the model, once) and the adaptive
 * target's "why it changed" in English and Hindi (B3). Works without schema_v43 (the weekly review
 * is then the deterministic one, not stored; sleep drops out of the score).
 */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const generate = new URL(req.url).searchParams.get("generate") === "1";
  try {
    return NextResponse.json(await loadInsights(admin, user.id, localNow(), { generate }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load insights" }, { status: 500 });
  }
}
