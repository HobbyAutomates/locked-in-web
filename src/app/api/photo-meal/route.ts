import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { FlowError, plateFlow } from "@/lib/scanFlows";

export const runtime = "nodejs";
export const maxDuration = 120;

/** A photo of a plate → per-item grams + macros + micros (see plateFlow in src/lib/scanFlows.ts). */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { image?: string; media_type?: string; note?: string; thumb?: string };
  try {
    return NextResponse.json(await plateFlow({ admin, userId: user.id, image: body.image ?? "", mediaType: body.media_type, note: body.note, thumb: typeof body.thumb === "string" ? body.thumb : null }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Photo estimate failed" }, { status: e instanceof FlowError ? e.status : 500 });
  }
}
