import { NextResponse } from "next/server";
import { adminClient, apiUser } from "@/lib/apiAuth";
import { isCron } from "@/lib/cronAuth";
import { dispatchPending } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.13 POST /api/push/dispatch — pushes pending notifications (pushed_at null).
 *
 *   - Cron: `Authorization: Bearer <CRON_SECRET>`, no body → everyone.
 *   - A signed-in user (session cookie on the web, `Authorization: Bearer <supabase access token>`
 *     from Android) with `{ userId }` → that one recipient. Called right after a nudge, so the
 *     caller must be the recipient or share a squad with them. Only already-pending rows are sent,
 *     so this can't be used to push arbitrary text.
 */
export async function POST(req: Request) {
  if (isCron(req)) {
    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    const one = typeof body.userId === "string" && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : null;
    return NextResponse.json({ ok: true, ...(await dispatchPending(adminClient(), one)) });
  }
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const target = typeof body.userId === "string" && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : user.id;
  if (target !== user.id) {
    const { data } = await admin.from("group_members").select("group_id, user_id").in("user_id", [user.id, target]);
    const mine = new Set(((data ?? []) as { group_id: string; user_id: string }[]).filter((r) => r.user_id === user.id).map((r) => r.group_id));
    const shared = ((data ?? []) as { group_id: string; user_id: string }[]).some((r) => r.user_id === target && mine.has(r.group_id));
    if (!shared) return NextResponse.json({ error: "Not in a squad with that person" }, { status: 403 });
  }
  const result = await dispatchPending(admin, target);
  return NextResponse.json({ ok: true, ...result });
}
