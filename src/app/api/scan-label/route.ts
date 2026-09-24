import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { FlowError, labelFlow } from "@/lib/scanFlows";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * An ingredients / nutrition label → structured report (see labelFlow in src/lib/scanFlows.ts).
 * The phone may post its on-device OCR as `text`; otherwise Sonnet reads the photo.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { image?: string; media_type?: string; note?: string; text?: string; lens?: string; thumb?: string };
  try {
    return NextResponse.json(await labelFlow({ admin, userId: user.id, image: body.image, mediaType: body.media_type, text: body.text, note: body.note, lens: body.lens, thumb: typeof body.thumb === "string" ? body.thumb : null }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Scan failed" }, { status: e instanceof FlowError ? e.status : 500 });
  }
}
