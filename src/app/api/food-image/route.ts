import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { foodKey } from "@/lib/foodKey";
import { cachedFoodImage, foodImageAdmin, resolveFoodImage, type FoodImageKind } from "@/lib/foodImage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/food-image?q=<food name>&kind=preset|product|generic
 *   → 200 { key, url, source, cached }   url = public 512 px JPEG in Storage, or null (miss)
 *
 * Shared by web and Android. A cache hit is answered to anyone (the bucket is public anyway);
 * finding a new picture needs a signed-in caller (session cookie, or `Authorization: Bearer
 * <supabase access token>` from Android). The prewarm script authenticates with the service key
 * and may also pass `query=` (the exact search to run) and `refresh=1`.
 */
function isService(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!bearer || !key) return false;
  const a = Buffer.from(bearer);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const HIT_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 120);
  const kindRaw = sp.get("kind");
  const kind: FoodImageKind = kindRaw === "preset" || kindRaw === "product" ? kindRaw : "generic";
  const key = foodKey(q);
  if (!key) return NextResponse.json({ error: "Pass ?q=<food name>" }, { status: 400 });

  const service = isService(req);
  const refresh = service && sp.get("refresh") === "1";
  const admin = foodImageAdmin();

  if (!refresh) {
    const hit = await cachedFoodImage(admin, key).catch(() => null);
    if (hit?.url) return NextResponse.json({ key, url: hit.url, source: hit.source, cached: true }, { headers: { "Cache-Control": HIT_CACHE } });
    if (hit?.miss && hit.created_at && Date.now() - Date.parse(hit.created_at) < 7 * 24 * 3600 * 1000) {
      return NextResponse.json({ key, url: null, source: null, cached: true }, { headers: { "Cache-Control": "private, max-age=3600" } });
    }
  }

  if (!service) {
    const { user } = await apiUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const query = service ? sp.get("query")?.slice(0, 160) || undefined : undefined;
  const r = await resolveFoodImage(q, { kind, query, refresh, admin });
  return NextResponse.json(r, { headers: { "Cache-Control": r.url ? HIT_CACHE : "private, max-age=600" } });
}
