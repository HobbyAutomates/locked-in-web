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

/**
 * Display-name fallback when profiles.name is blank: the email local-part's first run of letters,
 * title-cased ("ayaan.khan@x.com" -> "Ayaan"). Same rule as the signup trigger and the Android app.
 */
export function nameFromEmail(email: string | null | undefined): string {
  const local = String(email ?? "").split("@")[0] ?? "";
  const run = local.match(/[A-Za-z]+/)?.[0] ?? "";
  return run ? run.charAt(0).toUpperCase() + run.slice(1).toLowerCase() : "";
}

/** profiles.name, else the email-derived name, else "" (callers pick their own placeholder). */
export function displayName(name: string | null | undefined, email?: string | null): string {
  const n = String(name ?? "").trim();
  return n || nameFromEmail(email);
}

/** Public URL of an avatar stored as "<uid>/avatar.jpg?v=<ms>" in the public `avatars` bucket. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://evizkfvltacrfngsgbuu.supabase.co";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/avatars/${path}`;
}

/** v2.4 Preferences → Weight units: "72.5 kg" or "159.8 lb" (weights are always stored in kg). */
export function weightText(kg: number | null | undefined, units: "metric" | "imperial" = "metric", digits = 1): string {
  if (kg == null || !Number.isFinite(Number(kg))) return "—";
  const v = units === "imperial" ? Number(kg) * 2.20462 : Number(kg);
  const f = 10 ** digits;
  const n = Math.round(v * f) / f;
  return `${Number.isInteger(n) ? n : n.toFixed(digits)} ${units === "imperial" ? "lb" : "kg"}`;
}
