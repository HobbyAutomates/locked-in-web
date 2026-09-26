import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { cleanMemory } from "@/lib/coach";
import { missingV37 } from "@/lib/coachSchema";

export const runtime = "nodejs";

/**
 * v2.14 "What your coach knows". GET lists every live memory (kept + pending "Learned" ones) and
 * the "Let coach remember" switch; POST adds one; PATCH keeps / pins; DELETE forgets (soft delete,
 * purged after 30 days by coach_prune; `?id=all` forgets everything). Only the owner's rows.
 */
const COLS = "id, kind, text, source, pinned, kept, created_at";

export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [mem, prof] = await Promise.all([
    admin.from("coach_memory").select(COLS).eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    admin.from("profiles").select("coach_remember").eq("id", user.id).maybeSingle(),
  ]);
  if (mem.error) {
    if (missingV37(mem.error)) return NextResponse.json({ available: false, remember: true, memories: [] });
    return NextResponse.json({ error: mem.error.message }, { status: 500 });
  }
  // Un-kept proposals expire after 7 days.
  const memories = ((mem.data ?? []) as { kept: boolean; created_at: string }[]).filter((m) => m.kept || m.created_at >= since);
  return NextResponse.json({ available: true, remember: (prof.data as { coach_remember?: boolean } | null)?.coach_remember !== false, memories });
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; text?: unknown };
  const m = cleanMemory({ kind: body.kind, text: body.text });
  if (!m) return NextResponse.json({ error: "Keep it short and about habits, food, life or goals" }, { status: 400 });
  const { data, error } = await admin.from("coach_memory").insert({ user_id: user.id, kind: m.kind, text: m.text, source: "chat", kept: true }).select(COLS).single();
  if (error) return NextResponse.json({ error: missingV37(error) ? "Coming with the next update" : error.message }, { status: missingV37(error) ? 503 : 500 });
  return NextResponse.json({ memory: data });
}

export async function PATCH(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; kept?: unknown; pinned?: unknown };
  if (typeof body.id !== "string") return NextResponse.json({ error: "Which memory?" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.kept === true) patch.kept = true;
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  const { error } = await admin.from("coach_memory").update(patch).eq("id", body.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which memory?" }, { status: 400 });
  const q = admin.from("coach_memory").update({ deleted_at: new Date().toISOString() }).eq("user_id", user.id).is("deleted_at", null);
  const { error } = id === "all" ? await q : await q.eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
