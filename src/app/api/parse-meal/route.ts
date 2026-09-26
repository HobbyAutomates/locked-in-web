import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { ParseError, parseMealText } from "@/lib/parseMeal";
import { allow, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** "do roti, ek katori dal tadka, thoda ghee, 2 eggs" → priced items. The work is in lib/parseMeal.ts. */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  const { text, correction, previous, preview } = (await req.json().catch(() => ({}))) as { text?: string; correction?: string; previous?: unknown; preview?: boolean };
  // v2.14: the onboarding's first log happens before the account exists. A signed-out caller may ask
  // for a preview: same parse, no DB writes, rate-limited per device and per IP.
  const isPreview = !user && preview === true;
  if (!user && !isPreview) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (isPreview) {
    const device = (req.headers.get("x-device-id") ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64) || "none";
    const hour = 60 * 60 * 1000;
    if (!allow(`parse:d:${device}`, 12, hour) || !allow(`parse:ip:${clientIp(req)}`, 30, hour)) {
      return NextResponse.json({ error: "That's a lot of tries. Save your plan to keep logging." }, { status: 429 });
    }
  }
  if (!text || !text.trim()) return NextResponse.json({ error: "Nothing to parse" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  try {
    return NextResponse.json(await parseMealText({ admin, userId: user?.id ?? null, text, correction, previous }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parser returned nothing" }, { status: e instanceof ParseError ? e.status : 502 });
  }
}
