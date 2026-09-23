import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { analyseTranscript, fetchOff, lensFor, loadScanProfile, offTranscript, saveScan, type OffProduct } from "@/lib/labelAnalysis";

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

  const body = (await req.json().catch(() => ({}))) as { barcode?: string; lens?: string; note?: string };
  const barcode = String(body.barcode ?? "").replace(/\D/g, "");
  if (barcode.length < 8 || barcode.length > 14) return NextResponse.json({ error: "That doesn't look like an EAN/UPC barcode" }, { status: 400 });

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
    const { report, analysis } = await analyseTranscript({ client, transcript, note: body.note, lens, profile, kind: "barcode" });
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
