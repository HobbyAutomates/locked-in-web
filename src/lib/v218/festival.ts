/**
 * v2.18 B9 festival and wedding mode. Pick dates (Diwali, a shaadi…): targets go to maintenance,
 * the day streak is protected on those dates, and the coach warns you a few days ahead. Pure;
 * Android util/Festival.kt.
 */

export type FestivalKind = "diwali" | "holi" | "eid" | "navratri" | "shaadi" | "trip" | "exams" | "other";

export type FestivalMode = { id: string; kind: FestivalKind; name: string; start_date: string; end_date: string };

export const FESTIVAL_PRESETS: { kind: FestivalKind; name: string; days: number; tip: string }[] = [
  { kind: "diwali", name: "Diwali", days: 5, tip: "Mithai: pick one piece you love, not five you don't. Protein at breakfast keeps the grazing down." },
  { kind: "shaadi", name: "Shaadi", days: 3, tip: "Fill half the plate at the live counters with tandoori / paneer tikka first, then the rest. Dance counts as cardio." },
  { kind: "holi", name: "Holi", days: 2, tip: "Thandai and gujiya are the big ones. Water between rounds." },
  { kind: "eid", name: "Eid", days: 2, tip: "Biryani and kebabs are protein-rich; go easy on the sheer khurma refills." },
  { kind: "navratri", name: "Navratri / Garba", days: 9, tip: "Garba nights burn a lot: eat enough. Sabudana and fried vrat snacks add up fast." },
  { kind: "trip", name: "Trip / holiday", days: 5, tip: "Walk everywhere, one local treat a day, log what you can." },
  { kind: "exams", name: "Exam week", days: 7, tip: "Sleep beats cramming. Keep meals regular; nuts and fruit for study snacks." },
];

export const MAX_MODE_DAYS = 21;
export const WARN_DAYS = 3;

export const KINDS: FestivalKind[] = ["diwali", "holi", "eid", "navratri", "shaadi", "trip", "exams", "other"];
export const isFestivalKind = (v: unknown): v is FestivalKind => typeof v === "string" && (KINDS as string[]).includes(v);

const dn = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function cleanMode(raw: Record<string, unknown>, today: string): { ok: true; value: Omit<FestivalMode, "id"> } | { ok: false; error: string } {
  const kind: FestivalKind = isFestivalKind(raw.kind) ? raw.kind : "other";
  const name = String(raw.name ?? FESTIVAL_PRESETS.find((p) => p.kind === kind)?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Festival";
  const s = String(raw.start_date ?? "");
  const e = String(raw.end_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return { ok: false, error: "Pick the dates" };
  if (dn(e) < dn(s)) return { ok: false, error: "The end date is before the start" };
  if (dn(e) - dn(s) + 1 > MAX_MODE_DAYS) return { ok: false, error: `Keep it to ${MAX_MODE_DAYS} days or less` };
  if (dn(e) < dn(today)) return { ok: false, error: "Those dates are in the past" };
  return { ok: true, value: { kind, name, start_date: s, end_date: e } };
}

/** The mode covering `date`, if any. */
export function activeMode(modes: FestivalMode[], date: string): FestivalMode | null {
  return modes.find((m) => m.start_date <= date && date <= m.end_date) ?? null;
}

/** The next mode starting within WARN_DAYS (not today), for the heads-up. */
export function upcomingMode(modes: FestivalMode[], date: string): { mode: FestivalMode; inDays: number } | null {
  const t = dn(date);
  const next = modes
    .map((m) => ({ mode: m, inDays: dn(m.start_date) - t }))
    .filter((x) => x.inDays >= 1 && x.inDays <= WARN_DAYS)
    .sort((a, b) => a.inDays - b.inDays)[0];
  return next ?? null;
}

/** Every date covered by the modes, up to `today` (for streak protection). */
export function protectedDates(modes: FestivalMode[], today: string): string[] {
  const out = new Set<string>();
  for (const m of modes) for (let d = dn(m.start_date); d <= Math.min(dn(m.end_date), dn(today)); d++) out.add(isoOf(d));
  return [...out].sort();
}

/** kcal to add to today's target so it sits at maintenance (never negative: a gain surplus stays). */
export function maintenanceBump(target: number, maintenance: number | null): number {
  if (maintenance == null || !Number.isFinite(maintenance)) return 0;
  return Math.max(0, Math.round((maintenance - target) / 10) * 10);
}

export function tipFor(m: Pick<FestivalMode, "kind">): string {
  return FESTIVAL_PRESETS.find((p) => p.kind === m.kind)?.tip ?? "Enjoy it. Log what you can, keep protein up, and we'll pick back up after.";
}

/** Heads-up / active lines for Home and the coach's context. */
export function festivalLine(modes: FestivalMode[], date: string): string | null {
  const a = activeMode(modes, date);
  if (a) return `${a.name} mode is on until ${a.end_date}: targets at maintenance, streak protected. ${tipFor(a)}`;
  const u = upcomingMode(modes, date);
  if (u) return `${u.mode.name} starts in ${u.inDays} day${u.inDays === 1 ? "" : "s"}. Targets go to maintenance then and your streak is protected. Bank a little now: protein up, one fewer treat this week.`;
  return null;
}
