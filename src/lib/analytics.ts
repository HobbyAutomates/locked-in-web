/**
 * v2.10 beta usage events (bandlog.app_events, schema_v33). Shared by the browser tracker
 * (track.ts), the Server Action tracker (trackServer.ts) and the /admin panel.
 *
 * Kill switch: BETA_ANALYTICS=false (next.config.ts inlines it at build time; default on) turns
 * every tracker into a no-op. Turn it off, or cover it in the privacy policy, before public launch.
 * See docs/ADMIN.md.
 */
export const ANALYTICS_ON = !["false", "0", "off", "no"].includes((process.env.BETA_ANALYTICS ?? "true").trim().toLowerCase());

export type EventName =
  | "app_open"
  | "screen_view"
  | "meal_logged"
  | "meal_edited"
  | "meal_deleted"
  | "activity_logged"
  | "water_added"
  | "weight_logged"
  | "scan_done"
  | "squad_opened"
  | "challenge_created"
  | "post_deleted"
  | "error_shown";

export type MealMethod = "search" | "voice" | "text" | "photo" | "barcode" | "label";

export type EventProps = Record<string, string | number | boolean | null | undefined>;

/** Labels and counters only: strings cut to 160 chars, at most 12 keys, never nested. */
export function cleanProps(props: EventProps | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props).slice(0, 12)) {
    if (v === undefined) continue;
    out[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 160) : typeof v === "number" && !Number.isFinite(v) ? null : v;
  }
  return out;
}

/** PostgREST / Postgres saying the table isn't there (schema_v33 not applied yet). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /app_events.*(does not exist|could not find)|could not find the table/i.test(error.message ?? "");
}
