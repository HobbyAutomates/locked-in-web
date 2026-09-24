import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { FlowError, barcodeFlow } from "@/lib/scanFlows";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * EAN/UPC (or a photo of one) → Open Food Facts product → the same analysis as a label scan (see
 * barcodeFlow in src/lib/scanFlows.ts). `{ found: false }` when neither OFF host knows the code.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { barcode?: string; lens?: string; note?: string; image?: string; media_type?: string };
  try {
    return NextResponse.json(await barcodeFlow({ admin, userId: user.id, barcode: body.barcode, image: body.image, mediaType: body.media_type, note: body.note, lens: body.lens }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Barcode lookup failed" }, { status: e instanceof FlowError ? e.status : 500 });
  }
}
