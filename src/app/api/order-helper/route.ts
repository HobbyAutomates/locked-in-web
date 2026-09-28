import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { FlowError } from "@/lib/scanFlows";
import { orderFlow } from "@/lib/food/orderFlow";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * v2.18 A4 restaurant and delivery helper. Web (cookie) and Android (Bearer) both call it.
 *
 *   POST { text?: "2 x Butter Naan ₹120\nPaneer Tikka x 1…", image?: base64 screenshot, media_type?, remaining? }
 *   → { kind: "order", restaurant, note, diet_mode, remaining,
 *       dishes: [MenuDish + qty], plan: { total_kcal, total_protein, plan_kcal, plan_protein, fits, headline,
 *                                          rows: [{ index, eat (0 | .25 | .5 | .75 | 1), kcal, protein, line }] } }
 *
 * Nothing is saved: "Pre-log" is the normal meal save with the plan's items (lib/food/orderHelper.planItems).
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { text?: string; image?: string; media_type?: string; remaining?: Record<string, number> };
  try {
    const { usage, ...result } = await orderFlow({ admin, userId: user.id, text: body.text, image: body.image, mediaType: body.media_type, remaining: body.remaining && typeof body.remaining === "object" ? body.remaining : null });
    void usage;
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that order" }, { status: e instanceof FlowError ? e.status : 500 });
  }
}
