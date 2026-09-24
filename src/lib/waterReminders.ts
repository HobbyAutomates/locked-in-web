/**
 * v2.6 water reminders on the web. There is no push server, so reminders are a timer in the open
 * tab: the next slot in the from–to window (every N minutes from `from`) fires a notification via
 * the service worker's registration if one exists, else `new Notification`. Honest limit: nothing
 * fires while Locked In is closed (the Android app schedules real alarms).
 */
export type WaterReminderCfg = { from: string; to: string; every: number };

export const WATER_FREQUENCIES: { every: number; label: string }[] = [
  { every: 0, label: "Never" },
  { every: 30, label: "Every 30 minutes" },
  { every: 60, label: "Every 60 minutes" },
  { every: 120, label: "Every 2 hours" },
  { every: 180, label: "Every 3 hours" },
  { every: 240, label: "Every 4 hours" },
];

let timer: ReturnType<typeof setTimeout> | null = null;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** The next reminder time after `now`, or null when reminders are off. */
export function nextWaterSlot(cfg: WaterReminderCfg, now = new Date()): Date | null {
  if (!cfg.every) return null;
  const start = minutesOf(cfg.from);
  let end = minutesOf(cfg.to);
  if (end <= start) end += 24 * 60; // an overnight window, e.g. 22:00 → 01:00
  for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
    for (let m = start; m <= end; m += cfg.every) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + dayOffset);
      d.setMinutes(m);
      if (d.getTime() > now.getTime() + 1000) return d;
    }
  }
  return null;
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function show() {
  const title = "Time for some water";
  const opts: NotificationOptions = { body: "Have a glass and tap + on the Water page.", icon: "/icon-512.png", tag: "lockedin-water" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    // No service worker: fall through.
  }
  try {
    new Notification(title, opts);
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}

/** (Re)schedule the in-tab timer for `cfg`; the latest call wins. */
export function scheduleWaterReminders(cfg: WaterReminderCfg) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!notificationsSupported() || Notification.permission !== "granted" || !cfg.every) return;
  const at = nextWaterSlot(cfg);
  if (!at) return;
  const wait = Math.min(at.getTime() - Date.now(), 2_147_000_000);
  timer = setTimeout(() => {
    void show();
    scheduleWaterReminders(cfg);
  }, Math.max(1000, wait));
}

/** "Reminders on this phone" wording: true when a service worker could deliver them. */
export async function hasServiceWorker(): Promise<boolean> {
  try {
    return !!(await navigator.serviceWorker?.getRegistration?.());
  } catch {
    return false;
  }
}
