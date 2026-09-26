import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { isMissingSchema } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/**
 * v2.13 web-push subscriptions (Preferences → Notifications).
 *   POST   { endpoint, keys: { p256dh, auth } } → saves this browser for the signed-in user.
 *   DELETE { endpoint }                          → removes it.
 * An endpoint belongs to one browser, so saving it moves it to whoever is signed in now.
 * `{ ok: false, schema: false }` while schema_v36 isn't applied.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : "";
  const p256dh = b.keys?.p256dh ?? "";
  const auth = b.keys?.auth ?? "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "That subscription looks wrong" }, { status: 400 });
  }
  const del = await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (del.error && isMissingSchema(del.error)) return NextResponse.json({ ok: false, schema: false });
  const { error } = await admin.from("push_subscriptions").insert({ user_id: user.id, endpoint, p256dh, auth, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200) });
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ ok: false, schema: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : "";
  if (!endpoint) return NextResponse.json({ error: "No endpoint" }, { status: 400 });
  const { error } = await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error && isMissingSchema(error)) return NextResponse.json({ ok: false, schema: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
