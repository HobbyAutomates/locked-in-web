import { after } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { APP_VERSION } from "@/lib/version";
import { ANALYTICS_ON, cleanProps, isMissingTable, type EventName, type EventProps } from "./analytics";

type Db = Awaited<ReturnType<typeof createClient>>;

let dead = false;

/**
 * Server Action side of the beta usage events (web only — Android writes through PostgREST, not
 * these actions, so nothing is counted twice). Runs after the response via `after()`, with the
 * user's own cookie client so RLS still applies. Never throws; no-op when BETA_ANALYTICS=false.
 */
export function trackServer(supabase: Db, userId: string, name: EventName, props?: EventProps): void {
  if (!ANALYTICS_ON || dead) return;
  try {
    after(async () => {
      try {
        const { error } = await supabase.from("app_events").insert({ user_id: userId, name, props: cleanProps(props), platform: "web", app_version: APP_VERSION });
        if (isMissingTable(error)) dead = true;
      } catch {
        // dropped on purpose
      }
    });
  } catch {
    // after() outside a request scope: skip
  }
}
