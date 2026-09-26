import { NextResponse } from "next/server";
import { adminClient } from "@/lib/apiAuth";
import { isCron } from "@/lib/cronAuth";
import { runTick } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.13 GET|POST /api/cron/tick with `Authorization: Bearer <CRON_SECRET>` — every 15 minutes from
 * .github/workflows/cron.yml. Protein nudges, fasting-goal notices, Monday check-in notices, then
 * pushes everything pending. 404 without the secret (or while CRON_SECRET is unset).
 */
async function handle(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: false, error: "Server key missing" }, { status: 200 });
  const result = await runTick(adminClient());
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
