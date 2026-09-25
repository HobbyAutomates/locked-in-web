import type { Dataset, EventRow, Use } from "./types";
import { istDay, noonOf } from "./time";

/**
 * The features the panel measures, and how each one is counted.
 *
 * Source policy per feature:
 *  - "prefer-events": app_events once the user has any event; the domain table only for that
 *    user's history *before* their first event (so nothing is counted twice).
 *  - "events-only":  there is no table that records it (edits, screen views, logging method).
 *  - "tables-only":  no event exists for it (squad chat messages, feed posts).
 *  - "both":         the event and the table record different things, so both count
 *    (battle: meal snaps sent from the battle tab + days won).
 */

export type SourcePolicy = "prefer-events" | "events-only" | "tables-only" | "both";
export type FeatureGroup = "Logging" | "Tracking" | "Scans" | "Social" | "Screens";

export type FeatureDef = {
  key: string;
  label: string;
  group: FeatureGroup;
  policy: SourcePolicy;
  /** Where the event count comes from ("" when none). */
  event: string;
  /** Where the table count comes from ("" when none). */
  table: string;
  /** False when nothing in the apps reports this yet: "0" then means "not measured", not "never used". */
  instrumented: boolean;
};

export const METHODS = ["search", "voice", "text", "photo", "barcode", "label"] as const;
export type Method = (typeof METHODS)[number];

const method = (m: Method, label: string): FeatureDef => ({
  key: `food_${m}`,
  label,
  group: "Logging",
  policy: m === "photo" ? "prefer-events" : "events-only",
  event: `meal_logged{method:${m}}`,
  table: m === "photo" ? "meals with a photo" : "",
  instrumented: true,
});

export const FEATURE_CATALOG: FeatureDef[] = [
  { key: "food_any", label: "Food logging (any method)", group: "Logging", policy: "prefer-events", event: "meal_logged", table: "meals", instrumented: true },
  method("search", "Food: search"),
  method("voice", "Food: voice"),
  method("text", "Food: typed text"),
  method("photo", "Food: photo"),
  method("barcode", "Food: barcode"),
  method("label", "Food: nutrition label"),
  { key: "meal_edit", label: "Meal editing", group: "Logging", policy: "events-only", event: "meal_edited", table: "", instrumented: true },
  { key: "meal_delete", label: "Meal deleting", group: "Logging", policy: "events-only", event: "meal_deleted", table: "", instrumented: true },
  { key: "activity", label: "Activity / workouts", group: "Tracking", policy: "prefer-events", event: "activity_logged", table: "workouts + exercise_log", instrumented: true },
  { key: "water", label: "Water", group: "Tracking", policy: "prefer-events", event: "water_added", table: "water_log", instrumented: true },
  { key: "weight", label: "Weight", group: "Tracking", policy: "prefer-events", event: "weight_logged", table: "weight_log", instrumented: true },
  { key: "scan_label", label: "Scan: nutrition label", group: "Scans", policy: "prefer-events", event: "scan_done{kind:label}", table: "label_scans", instrumented: true },
  { key: "scan_barcode", label: "Scan: barcode", group: "Scans", policy: "prefer-events", event: "scan_done{kind:barcode}", table: "label_scans", instrumented: true },
  { key: "scan_photo", label: "Scan: plate photo", group: "Scans", policy: "prefer-events", event: "scan_done{kind:photo|plate}", table: "label_scans", instrumented: true },
  { key: "squad_open", label: "Squads (opened)", group: "Social", policy: "prefer-events", event: "squad_opened", table: "group_reads", instrumented: true },
  { key: "chat", label: "Squad chat", group: "Social", policy: "tables-only", event: "", table: "group_posts{kind:message}", instrumented: true },
  { key: "feed_posts", label: "Feed shares", group: "Social", policy: "tables-only", event: "", table: "group_posts{meal,workout,pr,photo}", instrumented: true },
  { key: "reactions", label: "Reactions", group: "Social", policy: "prefer-events", event: "reaction_added", table: "post_reactions", instrumented: true },
  { key: "challenges", label: "Challenges created", group: "Social", policy: "prefer-events", event: "challenge_created", table: "group_challenges", instrumented: true },
  { key: "battle", label: "Calorie battle", group: "Social", policy: "both", event: "meal_logged{from:battle}", table: "battle_wins", instrumented: true },
  { key: "progress", label: "Progress screen", group: "Screens", policy: "events-only", event: "screen_view{screen:Progress}", table: "", instrumented: true },
  { key: "goals_science", label: "Goals / science screens", group: "Screens", policy: "events-only", event: "screen_view{screen:Goal*|Science*}", table: "", instrumented: false },
];

export const FEATURE_BY_KEY = new Map(FEATURE_CATALOG.map((f) => [f.key, f]));

const s = (v: unknown) => (typeof v === "string" ? v : "");

/** Normalise a logging method label from event props; "" when it isn't one of the six. */
export function methodOf(props: Record<string, unknown>): Method | "" {
  const m = s(props.method).toLowerCase();
  return (METHODS as readonly string[]).includes(m) ? (m as Method) : "";
}

/** Scan kind from an event or a label_scans row: label | barcode | photo ("plate" is the photo scan). */
export function scanKind(kind: string): "label" | "barcode" | "photo" {
  const k = kind.toLowerCase();
  if (k === "barcode") return "barcode";
  if (k === "photo" || k === "plate") return "photo";
  return "label";
}

/** The feature keys one app event counts towards (possibly none: app_open, error_shown…). */
export function eventFeatures(e: Pick<EventRow, "name" | "props">): string[] {
  const p = e.props ?? {};
  switch (e.name) {
    case "meal_logged": {
      const out = ["food_any"];
      const m = methodOf(p);
      if (m) out.push(`food_${m}`);
      if (s(p.from) === "battle") out.push("battle");
      return out;
    }
    case "meal_edited":
      return ["meal_edit"];
    case "meal_deleted":
      return ["meal_delete"];
    case "activity_logged":
      return ["activity"];
    case "water_added":
      return ["water"];
    case "weight_logged":
      return ["weight"];
    case "scan_done":
      return [`scan_${scanKind(s(p.kind))}`];
    case "squad_opened":
      return ["squad_open"];
    case "reaction_added":
      return ["reactions"];
    case "challenge_created":
      return ["challenges"];
    case "screen_view": {
      const sc = s(p.screen);
      if (sc === "Progress") return ["progress"];
      if (/goal|science/i.test(sc)) return ["goals_science"];
      return [];
    }
    default:
      return [];
  }
}

export function eventUses(events: EventRow[]): Use[] {
  const out: Use[] = [];
  for (const e of events) {
    const day = istDay(e.created_at);
    if (!day) continue;
    for (const feature of eventFeatures(e)) out.push({ user: e.user_id, feature, at: e.created_at, day, source: "event" });
  }
  return out;
}

/** Feature uses read from the domain tables. The day is when the row was *created* (when the app was used). */
export function tableUses(ds: Pick<Dataset, "meals" | "workouts" | "exercises" | "water" | "weight" | "scans" | "reads" | "posts" | "reactions" | "challenges" | "battles">): Use[] {
  const out: Use[] = [];
  const add = (user: string, feature: string, at: string | null | undefined, date?: string) => {
    const ts = at || (date ? noonOf(date) : "");
    const day = istDay(ts);
    if (user && day) out.push({ user, feature, at: ts, day, source: "table" });
  };
  for (const m of ds.meals) {
    add(m.user_id, "food_any", m.created_at, m.date);
    if (m.has_photo) add(m.user_id, "food_photo", m.created_at, m.date);
  }
  for (const w of ds.workouts) add(w.user_id, "activity", w.created_at, w.date);
  // exercise_log rows with source "workout" are written alongside a workouts row: don't count twice.
  for (const x of ds.exercises) if (x.source !== "workout") add(x.user_id, "activity", x.created_at, x.date);
  for (const w of ds.water) add(w.user_id, "water", w.created_at, w.date);
  for (const w of ds.weight) add(w.user_id, "weight", w.created_at, w.date);
  for (const x of ds.scans) add(x.user_id, `scan_${scanKind(x.kind)}`, x.created_at);
  for (const r of ds.reads) add(r.user_id, "squad_open", r.last_read_at);
  for (const p of ds.posts) {
    if (p.kind === "message") add(p.user_id, "chat", p.created_at);
    else if (["meal", "workout", "pr", "photo"].includes(p.kind)) add(p.user_id, "feed_posts", p.created_at);
  }
  for (const r of ds.reactions) add(r.user_id, "reactions", r.created_at);
  for (const c of ds.challenges) add(c.user_id, "challenges", c.created_at);
  for (const b of ds.battles) add(b.user_id, "battle", b.created_at, b.date);
  return out;
}

/** Each user's first app event timestamp (the point their event history starts). */
export function firstEventAt(events: EventRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of events) {
    const cur = m.get(e.user_id);
    if (!cur || e.created_at < cur) m.set(e.user_id, e.created_at);
  }
  return m;
}

/** Combine event and table uses according to each feature's source policy. */
export function mergeUses(fromEvents: Use[], fromTables: Use[], firstEvent: Map<string, string>, catalog: FeatureDef[] = FEATURE_CATALOG): Use[] {
  const policy = new Map(catalog.map((f) => [f.key, f.policy]));
  const out: Use[] = [];
  for (const u of fromEvents) {
    const p = policy.get(u.feature);
    if (p && p !== "tables-only") out.push(u);
  }
  for (const u of fromTables) {
    const p = policy.get(u.feature);
    if (!p || p === "events-only") continue;
    if (p === "prefer-events") {
      const start = firstEvent.get(u.user);
      if (start && new Date(u.at).getTime() >= new Date(start).getTime()) continue;
    }
    out.push(u);
  }
  return out;
}

export function buildUses(ds: Dataset): Use[] {
  return mergeUses(eventUses(ds.events), tableUses(ds), firstEventAt(ds.events));
}
