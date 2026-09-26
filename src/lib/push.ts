import webpush from "web-push";
import type { AdminClient } from "./apiAuth";
import { isMissingSchema, parseKind, pushPayload } from "./notify";

/**
 * v2.13 web push (spec §2). Server only. Every function no-ops (returns `configured: false`) while
 * the VAPID env vars aren't set, so the app runs unchanged before the owner adds them.
 */

let configuredFor: string | null = null;

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const subject = process.env.VAPID_SUBJECT || "mailto:sohumai.team@gmail.com";
  const key = `${pub}|${subject}`;
  if (configuredFor !== key) {
    try {
      webpush.setVapidDetails(subject, pub, priv);
      configuredFor = key;
    } catch (e) {
      console.error("[push] bad VAPID configuration", e instanceof Error ? e.message : e);
      return false;
    }
  }
  return true;
}

export type DispatchResult = { configured: boolean; schema: boolean; notifications: number; sent: number; failed: number; removed: number };

/** Only fresh rows are pushed; older unsent ones are just marked (a day-old nudge isn't news). */
const FRESH_MS = 36 * 3600_000;

/**
 * Pushes every pending notification (pushed_at null) — for one recipient, or everyone when
 * `userId` is null — to each of their web-push subscriptions, sets pushed_at, and deletes
 * subscriptions the push service says are gone (404 / 410).
 */
export async function dispatchPending(admin: AdminClient, userId: string | null): Promise<DispatchResult> {
  const out: DispatchResult = { configured: pushConfigured(), schema: true, notifications: 0, sent: 0, failed: 0, removed: 0 };
  if (!out.configured || !setup()) return { ...out, configured: false };
  let q = admin.from("notifications").select("id, user_id, kind, title, body, url, created_at").is("pushed_at", null).order("created_at", { ascending: true }).limit(500);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) {
    if (isMissingSchema(error)) return { ...out, schema: false };
    console.error("[push] notifications read failed", error.message);
    return out;
  }
  const rows = (data ?? []) as { id: string; user_id: string; kind: string; title: string; body: string; url: string | null; created_at: string }[];
  out.notifications = rows.length;
  if (!rows.length) return out;

  const users = [...new Set(rows.map((r) => r.user_id))];
  const { data: subsData, error: subsErr } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", users);
  if (subsErr && isMissingSchema(subsErr)) return { ...out, schema: false };
  const subs = (subsData ?? []) as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[];
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const dead = new Set<string>();
  const ok = new Set<string>();
  const now = Date.now();
  for (const n of rows) {
    if (now - Date.parse(n.created_at) > FRESH_MS) continue;
    const payload = JSON.stringify(pushPayload({ id: n.id, kind: parseKind(n.kind), title: n.title, body: n.body, url: n.url }));
    for (const s of byUser.get(n.user_id) ?? []) {
      if (dead.has(s.id)) continue;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: n.kind === "nudge" ? "high" : "normal" });
        out.sent += 1;
        ok.add(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.add(s.id);
        else {
          out.failed += 1;
          console.error("[push] send failed", status ?? "", e instanceof Error ? e.message.slice(0, 200) : "");
        }
      }
    }
  }
  const stamp = new Date().toISOString();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: upErr } = await admin.from("notifications").update({ pushed_at: stamp }).in("id", ids.slice(i, i + 100));
    if (upErr) console.error("[push] marking pushed failed", upErr.message);
  }
  if (dead.size) {
    await admin.from("push_subscriptions").delete().in("id", [...dead]);
    out.removed = dead.size;
  }
  if (ok.size) await admin.from("push_subscriptions").update({ last_ok_at: stamp }).in("id", [...ok]);
  return out;
}

/** Fire-and-forget wrapper for server actions (a nudge must never fail because push did). */
export async function dispatchQuietly(admin: () => AdminClient, userId: string): Promise<void> {
  if (!pushConfigured()) return;
  try {
    await dispatchPending(admin(), userId);
  } catch (e) {
    console.error("[push] dispatch threw", e instanceof Error ? e.message : e);
  }
}
