import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { FlowError } from "@/lib/scanFlows";
import { menuFlow } from "@/lib/menuFlow";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * v2.13 restaurant menu scan (spec §10). Web (cookie session) and Android (`Authorization: Bearer
 * <Supabase access token>`) both call it, like the other scan routes.
 *
 *   POST { image, media_type?, thumb?, note?, remaining?: { kcal, protein, carbs, fat }, diet_mode? }
 *     image       base64 JPEG/PNG/WebP of the menu, downscaled on the device (longest edge ~1600 px)
 *     thumb       optional <= 320 px JPEG for the History list (scan-photos/<uid>/<id>.jpg)
 *     remaining   optional: what's left today; the server works it out from today's meals otherwise
 *     diet_mode   optional: overrides profiles.diet_mode (an under-18 account never gets keto etc.)
 *
 *   → { id, kind: "menu", restaurant, note, diet_mode, remaining, best_pick_index, thumb_path,
 *       dishes: [{ name, description, section, portion, grams, kcal_low, kcal_high, protein_low,
 *                  protein_high, carbs_g, fat_g, confidence: "low"|"medium"|"high", why, veg,
 *                  contains, price, fits_diet, diet_conflicts, score, best_pick }] }
 *
 * `id` is null until schema_v36 (label_scans kind 'menu') is applied; the dishes still come back.
 * Logging a dish is the normal meal save (Android: its own insert; web: saveMeal).
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { image?: string; media_type?: string; thumb?: string; note?: string; remaining?: Record<string, number>; diet_mode?: string };
  try {
    const { usage, ...result } = await menuFlow({
      admin,
      userId: user.id,
      image: body.image ?? "",
      mediaType: body.media_type,
      note: body.note,
      thumb: typeof body.thumb === "string" ? body.thumb : null,
      remaining: body.remaining && typeof body.remaining === "object" ? body.remaining : null,
      dietMode: body.diet_mode,
    });
    void usage;
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Menu scan failed" }, { status: e instanceof FlowError ? e.status : 500 });
  }
}
