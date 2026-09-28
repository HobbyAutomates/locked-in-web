import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { webLookup } from "@/lib/webFood";
import { labelRealityGaps, realityLine, type Per100 } from "@/lib/food/foodBits";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * v2.18 A8 label vs reality. After a label or barcode scan, the client asks whether the pack's own
 * numbers agree with what the web says about that product (food_web_lookup, the brand page first).
 *
 *   POST { product: "Pintola High Protein Muesli", brand?, per_100g: { calories, protein_g, carbs_g, fat_g } }
 *   → { checked: true, gaps: [{ field, label, web, pct }], lines: [...], source: { label, url } | null, matched_name }
 *     { checked: false }   when the web had nothing usable (the UI shows nothing)
 *
 * Only a > 20 % difference that is also a real amount counts (foodBits.labelRealityGaps). Calm by
 * design: labels are allowed some tolerance, so the UI says "worth a second look", never "fake".
 */
export async function POST(req: Request) {
  const { user } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { product?: string; brand?: string; per_100g?: Per100 };
  const product = String(body.product ?? "").trim().slice(0, 120);
  const label = body.per_100g ?? {};
  if (!product || !/[a-z]{3,}/i.test(product) || /unnamed/i.test(product)) return NextResponse.json({ checked: false });
  if (![label.calories, label.protein_g, label.carbs_g, label.fat_g].some((v) => typeof v === "number" && Number.isFinite(v))) return NextResponse.json({ checked: false });
  // Never cache this lookup into bandlog.foods: the point is an independent second opinion.
  const web = await webLookup(product, { context: `A packaged product; the person scanned its label${body.brand ? ` (brand: ${String(body.brand).slice(0, 60)})` : ""}. Find the brand's own page or a reputable listing for this exact product.`, cache: false });
  if (!web || web.confidence === "low") return NextResponse.json({ checked: false });
  const gaps = labelRealityGaps(label, web);
  return NextResponse.json({ checked: true, gaps, lines: gaps.map(realityLine), source: web.sources[0] ?? null, matched_name: web.matched_name });
}
