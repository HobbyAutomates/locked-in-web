import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { FlowError, barcodeFlow, classifyScan, labelFlow, mediaType, plateFlow, type Classified, type ScanKind } from "@/lib/scanFlows";

export const runtime = "nodejs";
export const maxDuration = 240;

/**
 * One Scan button. The server decides what the photo is and runs the right pipeline:
 *
 *   POST { image?, media_type?, barcode?, text?, lens?, note?, kind? }
 *     image       base64 JPEG/PNG/WebP (the photo)
 *     barcode     digits the browser already decoded (ZXing) or the user typed
 *     text        on-device OCR (Android), used for the label path when long enough
 *     kind        "barcode" | "label" | "plate" forces that pipeline (the "change?" chips)
 *
 *   → { kind: "barcode" | "label" | "plate", detected, ...report }
 *     barcode / label: the label-report shape of /api/scan-label and /api/scan-barcode
 *     plate:           the PlateEstimate shape of /api/photo-meal
 *     not in OFF:      { kind: "barcode", found: false, barcode, message } — unless the same photo
 *                      reads as a label, in which case the label report comes back with
 *                      `fallback: "label"` (kind "label").
 *
 * Without a forced kind and without usable barcode digits, one vision call classifies the photo
 * (and transcribes a label in the same call, so the label path needs no second read).
 */
const NOT_FOUND = "Not in the database yet — photograph the label side.";
const KINDS = new Set<ScanKind>(["barcode", "label", "plate"]);

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { image?: string; media_type?: string; barcode?: string; text?: string; lens?: string; note?: string; kind?: string };
  const image = (body.image ?? "").trim() || null;
  const digits = String(body.barcode ?? "").replace(/\D/g, "");
  const text = (body.text ?? "").trim();
  const forced = KINDS.has(body.kind as ScanKind) ? (body.kind as ScanKind) : null;
  if (!image && digits.length < 8 && !text) return NextResponse.json({ error: "No image" }, { status: 400 });
  const base = { admin, userId: user.id, mediaType: body.media_type, note: body.note, lens: body.lens };
  const mt = mediaType(body.media_type);

  let classified: Classified | null = null;
  const classify = async () => (classified ??= image ? await classifyScan(image, mt) : null);

  /** Barcode pipeline; when OFF doesn't know it, the label on the same photo (if there is one). */
  async function barcode(code: string | null, detected: ScanKind) {
    const r = await barcodeFlow({ ...base, barcode: code, image: code ? null : image });
    if (r.found !== false) return { ...r, kind: "barcode", detected };
    if (image && !forced) {
      const c = await classify();
      if (c && (c.kind === "label" || c.hasLabel)) {
        const l = await labelFlow({ ...base, image, transcript: c.transcript, text });
        return { ...l, kind: "label", detected, fallback: "label", barcode: r.barcode ?? code };
      }
    }
    return { ...r, kind: "barcode", detected, found: false, message: NOT_FOUND };
  }

  try {
    if (forced === "plate") {
      if (!image) throw new FlowError("No image", 400);
      return NextResponse.json({ ...(await plateFlow({ ...base, image })), kind: "plate", detected: "plate" });
    }
    if (forced === "label") return NextResponse.json({ ...(await labelFlow({ ...base, image, text })), kind: "label", detected: "label" });
    if (forced === "barcode") return NextResponse.json(await barcode(digits.length >= 8 ? digits : null, "barcode"));

    // Auto. Digits the browser already read (or the user typed) go straight to the barcode path.
    if (digits.length >= 8) return NextResponse.json(await barcode(digits, "barcode"));
    // Android's on-device OCR read a whole label: no need to look at the photo again.
    if (text.length >= 120) return NextResponse.json({ ...(await labelFlow({ ...base, image, text })), kind: "label", detected: "label" });

    const c = await classify();
    if (!c) throw new FlowError("No image", 400);
    if (c.kind === "plate") return NextResponse.json({ ...(await plateFlow({ ...base, image: image as string })), kind: "plate", detected: "plate" });
    if (c.kind === "barcode") return NextResponse.json(await barcode(c.barcode.length >= 8 ? c.barcode : null, "barcode"));
    if (c.kind === "label" || c.hasLabel) return NextResponse.json({ ...(await labelFlow({ ...base, image, transcript: c.transcript })), kind: "label", detected: "label" });
    // Neither: the label report's "couldn't read that" shape, with what the photo looked like.
    return NextResponse.json({ ...(await labelFlow({ ...base, image, transcript: `NOT_A_LABEL ${c.summary || "That doesn't look like a food label, a barcode or a plate."}` })), kind: "label", detected: "label" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Scan failed" }, { status: e instanceof FlowError ? e.status : 500 });
  }
}
