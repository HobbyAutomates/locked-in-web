/*
 * Locked In service worker (v2.13). Registered from Preferences → Notifications (and quietly again
 * by the Home bell once notifications are on). Water reminders (lib/waterReminders.ts) also show
 * through this registration when it exists.
 *
 * v2.18 E1 (offline logging): the tab layout registers it for everyone, and it now keeps an offline
 * copy of the app shell. Network first for the main tab pages (the last good copy is served only
 * when the network fails), cache first for hashed build assets. API routes, server actions (POST),
 * admin and everything cross-origin are never touched. Logs made offline wait in IndexedDB
 * (lib/social/offlineStore.ts) and sync from the page, not from here.
 *
 *   push              → show the notification from the JSON payload { title, body, url, tag, kind }
 *   notificationclick → focus an open Locked In tab and navigate it to `url`, else open a new one
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

const SHELL = "li-shell-v1";
const SHELL_PAGES = ["/", "/squad", "/scan", "/progress", "/profile", "/log", "/meal", "/water"];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("li-shell-") && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Locked In</title>' +
  '<body style="margin:0;background:#0B0B0C;color:#F4F1EA;font:16px system-ui;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">' +
  "<div><p style=\"font-size:22px;font-weight:800;margin:0 0 8px\">You're offline</p><p style=\"opacity:.7;margin:0\">Open Locked In once while online and it will open offline next time. Logs you make offline sync when you're back.</p></div></body>";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/auth")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // Signing out lands on /login: drop the cached pages so the next person offline sees nothing of the last one.
  if (req.mode === "navigate" && url.pathname === "/login") {
    event.waitUntil(caches.delete(SHELL));
    return;
  }
  if (req.mode === "navigate" && SHELL_PAGES.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic" && !res.redirected) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/")) || new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } })),
    );
  }
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
