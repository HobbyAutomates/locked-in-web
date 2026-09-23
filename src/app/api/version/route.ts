import { NextResponse } from "next/server";
import { APP_VERSION, CHANGELOG } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Build time is fixed when the module first loads on the server, i.e. per deploy. */
const BUILT_AT = new Date().toISOString();

/** What the running deployment is, for Profile → "Check for updates" (no auth: nothing private here). */
export async function GET() {
  return NextResponse.json({ version: APP_VERSION, built_at: BUILT_AT, latest: CHANGELOG[0] ?? null }, { headers: { "cache-control": "no-store" } });
}
