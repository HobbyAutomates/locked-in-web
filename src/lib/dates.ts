const pad = (n: number) => String(n).padStart(2, "0");

export function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number) {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function daysBetween(a: string, b: string) {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 864e5);
}
/** Monday of the week containing `s`. */
export function weekStart(s: string) {
  const d = parseIso(s);
  const dow = (d.getDay() + 6) % 7;
  return addDays(s, -dow);
}
/**
 * Today's date for the user, not the server: Railway runs in UTC, so between midnight and 05:30
 * IST `iso(new Date())` was still "yesterday" and Home hid meals the phone had just saved.
 */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function longDate(s: string) {
  return parseIso(s).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
export function shortDate(s: string) {
  return parseIso(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
