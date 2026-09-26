import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { CoachUnavailable, todaysNote } from "@/lib/coachServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** v2.14 Home "Today's note": written on first read after the note time (the cron also writes and pushes it). */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json({ available: true, ...(await todaysNote(admin, user.id)) });
  } catch (e) {
    if (e instanceof CoachUnavailable) return NextResponse.json({ available: false, note: null });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load the note" }, { status: 500 });
  }
}
