import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { TRANSCRIBE, analyseTranscript, lensFor, loadScanProfile, saveScan, unreadableReport } from "@/lib/labelAnalysis";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * An ingredients / nutrition label → structured report.
 *   1. Transcribe. The phone does this on-device (ML Kit) and posts `text`; when that text is long
 *      enough we skip straight to step 2. Otherwise Sonnet reads the photo.
 *   2–3. Shared with /api/scan-barcode (src/lib/labelAnalysis.ts): Haiku analyses (may web-search
 *      the brand), then is forced to emit the label_report tool.
 */

/** Below this many characters the on-device OCR is treated as a failed read. */
const OCR_MIN_CHARS = 120;

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const body = (await req.json()) as { image?: string; media_type?: string; note?: string; text?: string; lens?: string };
  const { image, media_type, note } = body;
  const ocrText = (body.text ?? "").trim();
  if (!image && ocrText.length === 0) return NextResponse.json({ error: "No image" }, { status: 400 });
  const mt = (media_type ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

  const profile = await loadScanProfile(admin, user.id);
  const lens = lensFor(profile.goal_type, body.lens);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // 1. Transcribe. The phone's own OCR wins when it read enough; otherwise Sonnet looks at the photo.
    const fromPhone = ocrText.length >= OCR_MIN_CHARS;
    let transcript = fromPhone ? ocrText : "";
    if (!transcript) {
      if (!image) return NextResponse.json({ error: "Couldn't read enough text — retake the photo." }, { status: 400 });
      const t = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: TRANSCRIBE,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: image } }, { type: "text", text: "Transcribe this label." }] }],
      });
      transcript = t.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n")
        .trim();
    }
    if (!transcript || transcript.startsWith("NOT_A_LABEL")) {
      return NextResponse.json(unreadableReport(transcript.replace("NOT_A_LABEL", "").trim() || "Couldn't read a food label in that photo.", transcript));
    }

    const { report, analysis } = await analyseTranscript({ client, transcript, note, lens, profile, fromPhoneOcr: fromPhone, kind: "label" });
    const full = { ...report, kind: "label", lens, transcript, analysis };
    const id = await saveScan(admin, {
      userId: user.id,
      kind: "label",
      lens,
      product: String(report.product ?? ""),
      verdict: String(report.verdict ?? ""),
      report: full,
    });
    return NextResponse.json({ id, ...report, kind: "label", lens, transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
