/**
 * v2.18 B7 supplement tracker, pure: presets, dose text, the streak and "due now". Android:
 * util/Supplements.kt. The app never recommends a dose (coach.ts RULES); presets carry the dose the
 * user types or the label's usual serving, and the copy says "as on your label / as your doctor said".
 */

export type SupplementKind = "creatine" | "whey" | "vitamin_d" | "iron" | "omega3" | "multivitamin" | "b12" | "custom";

export type Supplement = {
  id: string;
  name: string;
  kind: SupplementKind;
  dose: number | null;
  unit: string;
  /** "08:00" local, or null (no reminder). */
  remind_at: string | null;
  active: boolean;
  created_at?: string;
};

export type SupplementLog = { supplement_id: string; date: string };

export const PRESETS: { kind: SupplementKind; name: string; unit: string; hint: string }[] = [
  { kind: "creatine", name: "Creatine", unit: "g", hint: "Same time every day; it works by staying topped up." },
  { kind: "whey", name: "Whey protein", unit: "scoop", hint: "Counts toward protein when you log the shake." },
  { kind: "vitamin_d", name: "Vitamin D", unit: "IU", hint: "Take with a meal that has some fat." },
  { kind: "iron", name: "Iron", unit: "mg", hint: "Away from tea, coffee and milk; vitamin C helps." },
  { kind: "omega3", name: "Omega-3", unit: "capsule", hint: "With a meal." },
  { kind: "multivitamin", name: "Multivitamin", unit: "tablet", hint: "With breakfast." },
  { kind: "b12", name: "Vitamin B12", unit: "mcg", hint: "Common for vegetarians; as your doctor advised." },
];

export const KINDS: SupplementKind[] = ["creatine", "whey", "vitamin_d", "iron", "omega3", "multivitamin", "b12", "custom"];
export const isKind = (v: unknown): v is SupplementKind => typeof v === "string" && (KINDS as string[]).includes(v);

export function doseText(s: Pick<Supplement, "dose" | "unit">): string {
  if (s.dose == null || !(s.dose > 0)) return "";
  const d = Number.isInteger(s.dose) ? String(s.dose) : String(Math.round(s.dose * 100) / 100);
  const plural = s.dose !== 1 && ["scoop", "capsule", "tablet"].includes(s.unit) ? "s" : "";
  return `${d} ${s.unit}${plural}`;
}

/** Cleans a supplement from a form; an error string when it can't be saved. */
export function cleanSupplement(raw: Record<string, unknown>): { ok: true; value: Omit<Supplement, "id" | "created_at"> } | { ok: false; error: string } {
  const kind: SupplementKind = isKind(raw.kind) ? raw.kind : "custom";
  const preset = PRESETS.find((p) => p.kind === kind);
  const name = String(raw.name ?? preset?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (name.length < 2) return { ok: false, error: "Give it a name" };
  const d = raw.dose == null || raw.dose === "" ? null : Number(raw.dose);
  if (d != null && (!Number.isFinite(d) || d <= 0 || d > 100000)) return { ok: false, error: "Enter the dose as a number" };
  const unit = String(raw.unit ?? preset?.unit ?? "").trim().slice(0, 12) || "serving";
  const r = raw.remind_at == null || raw.remind_at === "" ? null : String(raw.remind_at).slice(0, 5);
  if (r != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r)) return { ok: false, error: "Pick a valid reminder time" };
  return { ok: true, value: { name, kind, dose: d, unit, remind_at: r, active: raw.active !== false } };
}

const dn = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * Current streak for one supplement: consecutive days taken ending today, or ending yesterday when
 * today isn't ticked yet (the day isn't over). Best streak over the logs too.
 */
export function streak(dates: string[], today: string): { current: number; best: number; takenToday: boolean } {
  const days = [...new Set(dates)].map(dn).sort((a, b) => a - b);
  const set = new Set(days);
  const t = dn(today);
  const takenToday = set.has(t);
  let cur = 0;
  for (let d = takenToday ? t : t - 1; set.has(d); d--) cur++;
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    run = prev != null && d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current: cur, best: Math.max(best, cur), takenToday };
}

/** Combined streak: days on which every active supplement was taken. */
export function allTakenStreak(active: Pick<Supplement, "id">[], logs: SupplementLog[], today: string): number {
  if (!active.length) return 0;
  const byDay = new Map<string, Set<string>>();
  for (const l of logs) {
    const s = byDay.get(l.date) ?? new Set<string>();
    s.add(l.supplement_id);
    byDay.set(l.date, s);
  }
  const full = (iso: string) => active.every((a) => byDay.get(iso)?.has(a.id));
  const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
  const t = dn(today);
  let n = 0;
  for (let d = full(today) ? t : t - 1; full(isoOf(d)); d--) n++;
  return n;
}

/** Due now: active, has a reminder time that has passed today, not taken today. */
export function dueNow(s: Supplement, takenToday: boolean, nowMin: number): boolean {
  if (!s.active || takenToday || !s.remind_at) return false;
  const [h, m] = s.remind_at.split(":").map(Number);
  return nowMin >= h * 60 + m;
}

/** Match "took my creatine" / "whey liya" to one of the user's supplements (coach tool + voice). */
export function matchSupplement(list: Pick<Supplement, "id" | "name" | "kind">[], text: string): string | null {
  const t = text.toLowerCase();
  const alias: Record<SupplementKind, RegExp> = {
    creatine: /creatine|creatin/,
    whey: /whey|protein (shake|powder)|scoop/,
    vitamin_d: /vit(amin)?\s*d\b|d3\b/,
    iron: /\biron\b|ferr/,
    omega3: /omega|fish oil/,
    multivitamin: /multi ?vit/,
    b12: /b\s?12/,
    custom: /$^/,
  };
  for (const s of list) if (t.includes(s.name.toLowerCase()) || alias[s.kind].test(t)) return s.id;
  return null;
}
