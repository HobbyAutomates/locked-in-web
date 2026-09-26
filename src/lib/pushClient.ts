"use client";

/**
 * v2.13 web push, browser side: service-worker registration, subscribe / unsubscribe, and what the
 * device can do. iPhone Safari only allows push for the home-screen app (iOS 16.4+), so a Safari
 * tab gets "Add to Home Screen" guidance instead of a switch.
 */

export type PushSupport =
  | { state: "unsupported" }
  | { state: "ios-browser" } // iPhone / iPad Safari tab: needs Add to Home Screen first
  | { state: "no-key" } // NEXT_PUBLIC_VAPID_PUBLIC_KEY not set on this deployment
  | { state: "ready"; permission: NotificationPermission };

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && typeof document !== "undefined" && "ontouchend" in document);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { state: "unsupported" };
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos() && !isStandalone()) return { state: "ios-browser" };
  if (!hasApis) return { state: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { state: "no-key" };
  return { state: "ready", permission: Notification.permission };
}

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Asks permission (must run from a tap), subscribes, and saves it on the server. */
export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = pushSupport();
  if (s.state === "ios-browser") return { ok: false, error: "On iPhone, add Locked In to your Home Screen first." };
  if (s.state === "no-key") return { ok: false, error: "Notifications aren't switched on for this server yet." };
  if (s.state === "unsupported") return { ok: false, error: "This browser can't show notifications." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: perm === "denied" ? "Notifications are blocked. Allow them in your browser or phone settings." : "Notifications weren't allowed." };
  const reg = await registerSw();
  if (!reg) return { ok: false, error: "Couldn't start the notification service." };
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't subscribe" };
    }
  }
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; schema?: boolean; error?: string };
  if (j.schema === false) return { ok: false, error: "Push needs the next server update. It's coming soon." };
  if (!res.ok || !j.ok) return { ok: false, error: j.error ?? "Couldn't save this device" };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}

/** Shows a local notification through the service worker when possible (rest timer, etc.). */
export async function localNotify(title: string, body: string, tag: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.("/");
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: "/apple-touch-icon.png" });
      return;
    }
    new Notification(title, { body, tag });
  } catch {
    // Some browsers only allow notifications from the service worker; nothing else to do.
  }
}
