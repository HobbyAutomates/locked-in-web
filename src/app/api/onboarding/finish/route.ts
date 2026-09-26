import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiUser } from "@/lib/apiAuth";
import { finishOnboarding } from "@/lib/onboardingServer";
import { ONBOARD_SKIP_COOKIE } from "@/lib/onboarding";

export const runtime = "nodejs";

/**
 * v2.14: saves the new onboarding once the account exists (web right after sign-up; Android the
 * same, with its bearer token). `mode: "tune"` is the existing users' "Tune your plan" card.
 * Body: { mode, answers, first_log? } — see docs/v214-spec.md.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const out = await finishOnboarding(admin, user.id, body);
    // Web: the (app) layout no longer needs the "Skip for now" escape hatch.
    if (body.mode !== "tune") (await cookies()).delete(ONBOARD_SKIP_COOKIE);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save your plan" }, { status: 400 });
  }
}
