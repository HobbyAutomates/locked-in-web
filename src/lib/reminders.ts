import type { ReminderPref } from "./types";

/** The five meal reminders; the source of truth is `profiles.reminders` (Android's util/Reminders.kt). */
export type Slot = { key: string; label: string; defaultTime: string; prompt: string; defaultOn?: boolean };

export const SLOTS: Slot[] = [
  { key: "breakfast", label: "Breakfast", defaultTime: "08:30", prompt: "log your breakfast?" },
  { key: "lunch", label: "Lunch", defaultTime: "12:00", prompt: "log your lunch?" },
  { key: "snack", label: "Snack", defaultTime: "15:00", prompt: "log your snack?" },
  { key: "dinner", label: "Dinner", defaultTime: "19:00", prompt: "log your dinner?" },
  { key: "endofday", label: "End of day", defaultTime: "21:00", prompt: "anything left to log today?" },
  // v2.0: the 9 pm daily wrap (Android notification; on the web it is the Wrap card on Home). On by default.
  { key: "wrap", label: "Daily wrap", defaultTime: "21:00", prompt: "your day, wrapped", defaultOn: true },
];

/** Normalises whatever is stored so every slot has an `on` and a valid `time`. */
export function parse(raw: unknown): Record<string, ReminderPref> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<ReminderPref> | undefined>;
  return Object.fromEntries(
    SLOTS.map((s) => {
      const row = o[s.key];
      const time = typeof row?.time === "string" && /^\d{1,2}:\d{2}$/.test(row.time) ? row.time : s.defaultTime;
      return [s.key, { on: typeof row?.on === "boolean" ? row.on : s.defaultOn === true, time }];
    }),
  );
}

export function onCount(raw: unknown) {
  return Object.values(parse(raw)).filter((p) => p.on).length;
}

/** "8:30 AM" for the row's trailing label. */
export function pretty(time: string): string {
  const [hs, ms] = time.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
