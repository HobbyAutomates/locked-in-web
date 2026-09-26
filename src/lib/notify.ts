/**
 * v2.13 notifications (spec §2, §3): the pure rules the cron uses. No Supabase here, so
 * scripts/check-notify.ts can run them and Android can port the protein-nudge rule for its local
 * alarm (util/Notify.kt).
 */

export type NotificationKind = "nudge" | "protein" | "fasting" | "checkin" | "system";
export type InboxItem = { id: string; kind: NotificationKind; title: string; body: string; url: string | null; created_at: string; read_at: string | null };

export function parseKind(v: unknown): NotificationKind {
  return v === "nudge" || v === "protein" || v === "fasting" || v === "checkin" ? v : "system";
}

/** The app's clock: Asia/Kolkata (the app stores no per-user timezone). */
export const APP_TZ = "Asia/Kolkata";

export type LocalNow = { date: string; minutes: number; weekday: number; dayOfMonth: number };

/** Date (yyyy-MM-dd), minutes after midnight, ISO weekday (1 = Mon) and day of month in `tz`. */
export function localNow(now: Date = new Date(), tz: string = APP_TZ): LocalNow {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: wd || 1, dayOfMonth: Number(get("day")) };
}

/** "16:00" / "16:00:00" → 960; anything else → the 16:00 default. */
export function timeToMinutes(v: unknown, fallback = 16 * 60): number {
  if (typeof v !== "string") return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : fallback;
}

/**
 * The cron runs every 15 minutes but GitHub's scheduler can run late, so "just passed" means: the
 * nudge time is at or before now, and no more than this many minutes ago.
 */
export const NUDGE_WINDOW_MIN = 180;

export function nudgeTimeReached(nowMin: number, nudgeMin: number, windowMin = NUDGE_WINDOW_MIN): boolean {
  return nowMin >= nudgeMin && nowMin - nudgeMin <= windowMin;
}

/** Protein nudge threshold: under 70 % of the day's target. */
export const PROTEIN_NUDGE_FRACTION = 0.7;

export type ProteinNudgeInput = {
  enabled: boolean;
  /** Whole years, or null when the DOB isn't known. */
  age: number | null;
  goalType: "lose" | "maintain" | "gain";
  proteinToday: number;
  target: number;
  /** Anything logged today (a meal). */
  loggedToday: boolean;
  /** A protein notice already exists for today. */
  alreadyToday: boolean;
};

/** Spec §3. Never for an under-18 whose goal is loss; at most one a day; needs a log today. */
export function shouldProteinNudge(i: ProteinNudgeInput): boolean {
  if (!i.enabled || i.alreadyToday || !i.loggedToday) return false;
  if (i.age != null && i.age < 18 && i.goalType === "lose") return false;
  if (!(i.target > 0)) return false;
  return i.proteinToday < i.target * PROTEIN_NUDGE_FRACTION;
}

export type DietMode = "balanced" | "high_protein" | "vegetarian" | "eggetarian" | "vegan" | "jain" | "keto" | "low_carb" | "mediterranean";

export function parseDietMode(v: unknown): DietMode {
  const all: DietMode[] = ["balanced", "high_protein", "vegetarian", "eggetarian", "vegan", "jain", "keto", "low_carb", "mediterranean"];
  return all.includes(v as DietMode) ? (v as DietMode) : "balanced";
}

type Tag = "meat" | "fish" | "egg" | "dairy" | "root" | "sprout" | "carb";
/** A short protein pick list for the nudge text (the full what-to-eat engine lives elsewhere). */
export const PROTEIN_PICKS: { name: string; protein: number; tags: Tag[] }[] = [
  { name: "chicken tikka (100 g)", protein: 25, tags: ["meat"] },
  { name: "a whey shake", protein: 24, tags: ["dairy"] },
  { name: "grilled fish (100 g)", protein: 22, tags: ["fish"] },
  { name: "paneer bhurji (100 g)", protein: 18, tags: ["dairy"] },
  { name: "soya chunks curry", protein: 15, tags: [] },
  { name: "2 boiled eggs", protein: 12, tags: ["egg"] },
  { name: "tofu stir-fry (100 g)", protein: 12, tags: [] },
  { name: "2 moong dal chillas", protein: 12, tags: ["carb"] },
  { name: "a bowl of hung curd", protein: 10, tags: ["dairy"] },
  { name: "sprouts chaat", protein: 9, tags: ["sprout", "carb"] },
  { name: "a handful of peanuts", protein: 7, tags: [] },
  { name: "roasted chana (30 g)", protein: 6, tags: ["carb"] },
];

const BLOCK: Record<DietMode, Tag[]> = {
  balanced: [],
  high_protein: [],
  mediterranean: [],
  vegetarian: ["meat", "fish", "egg"],
  eggetarian: ["meat", "fish"],
  vegan: ["meat", "fish", "egg", "dairy"],
  jain: ["meat", "fish", "egg", "root", "sprout"],
  keto: ["carb"],
  low_carb: ["carb"],
};

/** Three picks allowed by the diet mode, highest protein first. */
export function proteinPicksFor(mode: DietMode, n = 3): string[] {
  const block = BLOCK[mode];
  return PROTEIN_PICKS.filter((p) => !p.tags.some((t) => block.includes(t)))
    .slice(0, n)
    .map((p) => p.name);
}

/** "You're 42 g short on protein" / "Try chicken tikka (100 g), a whey shake or grilled fish (100 g)." */
export function proteinNudgeText(shortG: number, picks: string[]): { title: string; body: string } {
  const g = Math.max(1, Math.round(shortG));
  const list = picks.length <= 1 ? picks.join("") : `${picks.slice(0, -1).join(", ")} or ${picks[picks.length - 1]}`;
  return { title: `You're ${g} g short on protein`, body: list ? `Try ${list}.` : "A protein-rich snack now keeps you on track." };
}

/** A running fast whose target has been reached (and isn't over). */
export function fastingReached(s: { started_at: string; ended_at: string | null; target_hours: number }, now: Date = new Date()): boolean {
  if (s.ended_at) return false;
  const start = Date.parse(s.started_at);
  if (!Number.isFinite(start)) return false;
  return now.getTime() >= start + Number(s.target_hours) * 3600_000;
}

/** Link written into a fasting notice; also how the cron avoids sending it twice. */
export const fastingUrl = (sessionId: string) => `/?fast=${sessionId}`;

/** Monday check-in notice goes out on Monday (local), once per week. */
export function checkinDue(now: LocalNow, adaptiveOn: boolean, alreadyThisWeek: boolean): boolean {
  return adaptiveOn && now.weekday === 1 && !alreadyThisWeek;
}

/** The web-push payload the service worker shows. */
export type PushPayload = { title: string; body: string; url: string; tag: string; kind: NotificationKind };

export function pushPayload(n: { id: string; kind: NotificationKind; title: string; body: string; url: string | null }): PushPayload {
  return { title: n.title, body: n.body, url: n.url && n.url.startsWith("/") ? n.url : "/notifications", tag: `${n.kind}-${n.id}`, kind: n.kind };
}

/** Postgres / PostgREST "that table or column doesn't exist" (schema_v36 not applied yet). */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return (m.includes("does not exist") || m.includes("could not find")) && (m.includes("column") || m.includes("relation") || m.includes("table") || m.includes("function"));
}
