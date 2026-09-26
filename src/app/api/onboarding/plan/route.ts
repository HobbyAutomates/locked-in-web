import { NextResponse } from "next/server";
import { onboardingPlan, sanitizeAnswers } from "@/lib/onboardingV2";
import { today } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * v2.14 onboarding reveal (screen 15): the plan for a set of answers, before the account exists.
 * Pure maths (goals.ts + dietModes.ts), no auth, no DB. Android calls it too so both show the same
 * date; it falls back to its own Goals.kt port when offline.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { answers?: unknown };
  const plan = onboardingPlan(sanitizeAnswers(body.answers ?? body), today());
  if (!plan) return NextResponse.json({ error: "Height, weight, age and sex are needed for a plan" }, { status: 400 });
  return NextResponse.json(plan);
}
