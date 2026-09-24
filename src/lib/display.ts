/**
 * Display formatting for values that carry a time-of-day.
 *
 * The server runs in UTC and the phone in IST, so anything derived from `new Date()` or from a
 * `timestamptz` would render differently on each side and break hydration. Formatting through one
 * fixed zone keeps the server HTML and the client render identical — and it is the zone the user
 * (and the Android app, on their device) is actually in.
 */
const ZONE = "Asia/Kolkata";
const LOCALE = "en-IN";

const TIME = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", timeZone: ZONE });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONE });

/** "9:15 pm" for a Postgres timestamptz, in the display zone. */
export function formatTime(createdAt: string): string {
  if (!createdAt) return "";
  const raw = createdAt.replace(" ", "T");
  const withZone = /([Z+]|-\d\d:\d\d)$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

/** Today's ISO date in the display zone — stable on both sides of hydration. */
export function todayInZone(): string {
  return ISO_DAY.format(new Date());
}
