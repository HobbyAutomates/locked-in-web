import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";
import { ANALYTICS_ON, cleanProps, isMissingTable, type EventName, type EventProps } from "./analytics";

/**
 * Browser-side beta usage events. `track(name, props)` is fire-and-forget: it queues the event and
 * returns at once; the queue is written in one insert every few seconds (and when the tab hides).
 * Signed-out events, write errors and a missing app_events table are all silently dropped — this
 * never throws and never blocks the UI. Off entirely when BETA_ANALYTICS=false.
 */
type Row = { name: EventName; props: Record<string, string | number | boolean | null> };

const FLUSH_MS = 4000;
const MAX_QUEUE = 50;

let queue: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let dead = false;
let hooked = false;
let client: ReturnType<typeof createClient> | null = null;
let screen: string | null = null;

export function track(name: EventName, props?: EventProps): void {
  if (!ANALYTICS_ON || dead || typeof window === "undefined") return;
  try {
    if (name === "screen_view" && typeof props?.screen === "string") screen = props.screen;
    const p = cleanProps(name === "error_shown" && screen && props?.screen == null ? { ...props, screen } : props);
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ name, props: p });
    if (!hooked) {
      hooked = true;
      document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flush());
    }
    if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
  } catch {
    // never let analytics break the page
  }
}

async function flush(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || dead) return;
  const batch = queue;
  queue = [];
  try {
    client ??= createClient();
    const { data } = await client.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    const rows = batch.map((r) => ({ user_id: uid, name: r.name, props: r.props, platform: "web", app_version: APP_VERSION }));
    // No .select(): supabase-js sends return=minimal, which is all an insert-only policy allows.
    const { error } = await client.from("app_events").insert(rows);
    if (isMissingTable(error)) dead = true;
  } catch {
    // dropped on purpose
  }
}
