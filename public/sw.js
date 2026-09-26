/*
 * Locked In service worker (v2.13). Registered from Preferences → Notifications (and quietly again
 * by the Home bell once notifications are on). It only does notifications: no fetch handler, no
 * caching, so pages load exactly as before. Water reminders (lib/waterReminders.ts) also show
 * through this registration when it exists.
 *
 *   push              → show the notification from the JSON payload { title, body, url, tag, kind }
 *   notificationclick → focus an open Locked In tab and navigate it to `url`, else open a new one
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Locked In", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Locked In";
  const options = {
    body: data.body || "",
    icon: "/apple-touch-icon.png",
    badge: "/icon-512.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if ("navigate" in c) {
            try {
              await c.navigate(url);
            } catch {
              // Uncontrolled client: fall through and open a window instead.
              await self.clients.openWindow(url);
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
