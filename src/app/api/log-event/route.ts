import { NextResponse } from "next/server";
import { saveLogEvents, type LogEventBody } from "@/lib/accuracyServer";
import { apiUser } from "@/lib/apiAuth";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";

/**
 * v2.15 beta entry log (bandlog.log_events): one event or `{ events: [...] }` (≤ 50). A no-op
 * (`skipped: "analytics_off"`) when BETA_ANALYTICS=false; `available: false` until schema_v38.
 * Contract: docs/v215-api.md.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as LogEventBody & { events?: LogEventBody[] };
  const events = Array.isArray(body.events) ? body.events : [body];
  const platform = body.platform === "android" || (req.headers.get("authorization") && body.platform !== "web") ? "android" : "web";
  return NextResponse.json(await saveLogEvents(admin, user.id, events, { platform, app_version: platform === "web" ? APP_VERSION : null }));
}
