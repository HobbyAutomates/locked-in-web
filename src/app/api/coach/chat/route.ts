import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { CoachUnavailable, chatHistory, coachChat, loadCoachProfile } from "@/lib/coachServer";
import { localNow } from "@/lib/notify";
import { missingV37 } from "@/lib/coachSchema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * v2.14 coach chat (docs/v214-spec.md). GET = history (oldest first), POST = send a message (text,
 * optional base64 photo), DELETE = forget the whole conversation. `available: false` until
 * schema_v37 is applied.
 */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 60) || 60;
  try {
    const [messages, p] = await Promise.all([chatHistory(admin, user.id, limit), loadCoachProfile(admin, user.id, localNow().date)]);
    return NextResponse.json({ available: true, style: p.style, remember: p.remember, teen: p.teen, messages });
  } catch (e) {
    if (e instanceof CoachUnavailable) return NextResponse.json({ available: false, messages: [] });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load the chat" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { message?: unknown; image?: unknown; media_type?: unknown };
  const message = typeof body.message === "string" ? body.message : "";
  const image = typeof body.image === "string" && body.image.length < 8_000_000 ? body.image : null;
  if (!message.trim() && !image) return NextResponse.json({ error: "Say something first" }, { status: 400 });
  try {
    const out = await coachChat(admin, user.id, { message, image, mediaType: typeof body.media_type === "string" ? body.media_type : null });
    return NextResponse.json({ available: true, ...out });
  } catch (e) {
    if (e instanceof CoachUnavailable) return NextResponse.json({ available: false, error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "The coach couldn't answer" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { error } = await admin.from("coach_messages").delete().eq("user_id", user.id);
  if (error && !missingV37(error)) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
