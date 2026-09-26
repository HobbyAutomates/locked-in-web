import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

/** v2.14 privacy: everything the coach has on you (chat + memories + notes) as one JSON file. */
export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const [messages, memories, notes] = await Promise.all([
    admin.from("coach_messages").select("role, text, tool, created_at").eq("user_id", user.id).order("created_at"),
    admin.from("coach_memory").select("kind, text, source, pinned, kept, created_at, deleted_at").eq("user_id", user.id).order("created_at"),
    admin.from("coach_notes").select("date, kind, style, text").eq("user_id", user.id).order("date"),
  ]);
  const body = JSON.stringify({ exported_at: new Date().toISOString(), messages: messages.data ?? [], memories: memories.data ?? [], notes: notes.data ?? [] }, null, 2);
  return new NextResponse(body, { headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=locked-in-coach.json" } });
}
