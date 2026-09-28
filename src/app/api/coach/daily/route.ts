import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { localNow } from "@/lib/notify";
import { loadDaily, saveCheckin } from "@/lib/v218/coachPlusServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.18 (schema_v43) Home's daily coach card: today's check-in (B4) and what it changes, the
 * recovery score (B8), today's calorie target with any bump, festival mode (B9), the cycle day
 * (B6, private) and supplements due (B7). POST saves the 5-second check-in.
 */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json(await loadDaily(admin, user.id, localNow()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load today" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = localNow();
  const r = await saveCheckin(admin, user.id, now.date, body);
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.unavailable ? { available: false } : {}) }, { status: r.unavailable ? 503 : 400 });
  return NextResponse.json(await loadDaily(admin, user.id, now));
}
