import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { analyseTranscript, fetchOff, lensFor, loadScanProfile, offComplete, offTranscript, saveScan, type OffProduct } from "@/lib/labelAnalysis";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * EAN/UPC → Open Food Facts product → the same analysis as a label scan.
 * The product JSON is cached in bandlog.barcode_cache (refreshed after 30 days) so a repeat scan
 * never hits OFF again. `{ found: false }` when neither OFF host knows the code.
 */
const CACHE_DAYS = 30;

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { barcode?: string; lens?: string; note?: string; image?: string; media_type?: string };
  let barcode = String(body.barcode ?? "").replace(/\D/g, "");
  // No digits but a photo: iPhone Safari has no barcode reader, and ZXing in the browser can miss a
  // curved or glossy pack. The digits are printed under the bars, so let the vision model read them.
  if (barcode.length < 8 && body.image) {
    const vision = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const mt = (body.media_type ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
    const m = await vision.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 60,
      system: "You read retail barcodes. Reply with ONLY the digits printed under the barcode (EAN-13, EAN-8 or UPC), no spaces. If no barcode digits are legible, reply NONE.",
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: body.image } }, { type: "text", text: "Digits?" }] }],
    });
    barcode = m.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("").replace(/\D/g, "");
  }
  if (barcode.length < 8 || barcode.length > 14) {
    return NextResponse.json({ found: false, barcode, kind: "barcode", message: barcode ? "That doesn't look like an EAN/UPC barcode" : "Couldn't read the barcode digits - get the numbers under the bars sharp and well lit, or type them." });
  }

  const profile = await loadScanProfile(admin, user.id);
  const lens = lensFor(profile.goal_type, body.lens);

  try {
    // 1. Cache, then Open Food Facts.
    let product: OffProduct | null = null;
    const { data: cached } = await admin.from("barcode_cache").select("product, fetched_at").eq("barcode", barcode).maybeSingle();
    const fresh = cached && Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_DAYS * 86400e3;
    if (fresh && cached?.product && (cached.product as OffProduct).product_name) product = cached.product as OffProduct;
    if (!product) {
      product = await fetchOff(barcode);
      if (product) await admin.from("barcode_cache").upsert({ barcode, product, fetched_at: new Date().toISOString() });
      else if (cached?.product && (cached.product as OffProduct).product_name) product = cached.product as OffProduct;
    }
    if (!product) {
      return NextResponse.json({ found: false, barcode, kind: "barcode", lens, message: "Not in the database yet — scan the label instead." });
    }

    // 2–3. Same analysis + structuring as a label.
    const transcript = offTranscript(product);
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // A complete OFF record (ingredients + full nutrition) only needs one search at most — recall /
    // counterfeit checks — which keeps a typical barcode scan well under 25 s.
    const { report, analysis } = await analyseTranscript({ client, transcript, note: body.note, lens, profile, kind: "barcode", maxSearches: offComplete(product) ? 1 : 2 });
    const image_url = product.image_url ?? null;
    const full = { ...report, kind: "barcode", lens, barcode, image_url, transcript, analysis };
    const id = await saveScan(admin, {
      userId: user.id,
      kind: "barcode",
      lens,
      product: String(report.product ?? product.product_name ?? ""),
      verdict: String(report.verdict ?? ""),
      report: full,
    });
    return NextResponse.json({ id, found: true, ...report, kind: "barcode", lens, barcode, image_url, transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Barcode lookup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
