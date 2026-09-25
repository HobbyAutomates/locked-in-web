import type { ActiveDays, Use } from "./types";
import { FEATURE_CATALOG, type FeatureDef, type FeatureGroup, type SourcePolicy } from "./catalog";
import { activeUsersIn } from "./engagement";
import { addDays, lastNWeeks, pct, round, within } from "./time";

/**
 * Feature usage: adoption, frequency and week-on-week trend per feature.
 *  - adoption7/30: users who used it ÷ users active at all in the same 7/30 days.
 *  - perUserWeek:  uses in 30 days ÷ users active in 30 days ÷ (30/7).
 *  - thisWeek / lastWeek: uses in the last 7 days vs. the 7 before (rolling, not calendar weeks).
 */

export type Trend = "up" | "down" | "flat" | "new" | "none";
export type UsageStatus = "core" | "used" | "rare" | "never" | "not-measured";

export type FeatureUsageRow = {
  key: string;
  label: string;
  group: FeatureGroup;
  policy: SourcePolicy;
  /** Human label of where the numbers come from, e.g. "events + tables (before first event)". */
  source: string;
  instrumented: boolean;
  users7: number;
  users30: number;
  active7: number;
  active30: number;
  adoption7: number | null;
  adoption30: number | null;
  uses30: number;
  perUserWeek: number | null;
  thisWeek: number;
  lastWeek: number;
  /** (this − last) ÷ last; null when last week had none. */
  trendPct: number | null;
  trend: Trend;
  /** Of the 30-day uses, how many came from app_events vs. domain tables. */
  fromEvents30: number;
  fromTables30: number;
  /** 1 = most adopted. */
  rank: number;
  status: UsageStatus;
};

/** At or above this 30-day adoption a feature is "core". */
export const CORE = 0.6;
/** Below this 30-day adoption (or one lone user out of 3+) a feature is "rare". */
export const RARE = 0.25;

export function sourceLabel(f: FeatureDef, fromEvents: number, fromTables: number): string {
  switch (f.policy) {
    case "events-only":
      return "events";
    case "tables-only":
      return "tables";
    case "both":
      return "events + tables";
    default:
      if (fromEvents && fromTables) return "events + tables (before first event)";
      if (fromTables) return "tables (no events yet)";
      return "events";
  }
}

export function trendOf(thisWeek: number, lastWeek: number): { trend: Trend; trendPct: number | null } {
  if (!thisWeek && !lastWeek) return { trend: "none", trendPct: null };
  if (!lastWeek) return { trend: "new", trendPct: null };
  const p = (thisWeek - lastWeek) / lastWeek;
  return { trend: p >= 0.2 ? "up" : p <= -0.2 ? "down" : "flat", trendPct: round(p, 3) };
}

export function computeFeatureUsage(uses: Use[], active: ActiveDays, today: string, catalog: FeatureDef[] = FEATURE_CATALOG): FeatureUsageRow[] {
  const active7 = activeUsersIn(active, today, 7).length;
  const active30 = activeUsersIn(active, today, 30).length;
  const prevStart = addDays(today, -13);
  const prevEnd = addDays(today, -7);
  const byFeature = new Map<string, Use[]>();
  for (const u of uses) {
    let l = byFeature.get(u.feature);
    if (!l) byFeature.set(u.feature, (l = []));
    l.push(u);
  }
  const rows = catalog.map((f) => {
    const list = byFeature.get(f.key) ?? [];
    const u7 = new Set<string>();
    const u30 = new Set<string>();
    let uses30 = 0;
    let thisWeek = 0;
    let lastWeek = 0;
    let ev = 0;
    let tb = 0;
    for (const u of list) {
      if (within(u.day, today, 7)) {
        u7.add(u.user);
        thisWeek++;
      } else if (u.day >= prevStart && u.day <= prevEnd) lastWeek++;
      if (within(u.day, today, 30)) {
        u30.add(u.user);
        uses30++;
        if (u.source === "event") ev++;
        else tb++;
      }
    }
    const instrumented = f.instrumented || list.length > 0;
    const adoption30 = pct(u30.size, active30);
    return {
      key: f.key,
      label: f.label,
      group: f.group,
      policy: f.policy,
      source: sourceLabel(f, ev, tb),
      instrumented,
      users7: u7.size,
      users30: u30.size,
      active7,
      active30,
      adoption7: pct(u7.size, active7),
      adoption30,
      uses30,
      perUserWeek: active30 ? round(uses30 / active30 / (30 / 7), 2) : null,
      thisWeek,
      lastWeek,
      ...trendOf(thisWeek, lastWeek),
      fromEvents30: ev,
      fromTables30: tb,
      rank: 0,
      status: statusOf(instrumented, u30.size, active30, adoption30),
    };
  });
  rows.sort((a, b) => (b.adoption30 ?? -1) - (a.adoption30 ?? -1) || (b.adoption7 ?? -1) - (a.adoption7 ?? -1) || b.uses30 - a.uses30 || a.label.localeCompare(b.label));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function statusOf(instrumented: boolean, users30: number, active30: number, adoption30: number | null): UsageStatus {
  if (!instrumented) return "not-measured";
  if (!users30) return "never";
  if ((adoption30 ?? 0) >= CORE) return "core";
  if ((adoption30 ?? 0) < RARE || (users30 === 1 && active30 >= 3)) return "rare";
  return "used";
}

export type FeatureWeekRow = { key: string; label: string; weeks: number[]; total: number };

/** feature × week counts (Monday-start weeks, oldest first) for one user's uses. */
export function featureWeekMatrix(uses: Use[], today: string, nWeeks = 8, catalog: FeatureDef[] = FEATURE_CATALOG): { weeks: string[]; rows: FeatureWeekRow[] } {
  const weeks = lastNWeeks(today, nWeeks);
  const idx = (day: string) => {
    for (let i = weeks.length - 1; i >= 0; i--) if (day >= weeks[i]) return day <= addDays(weeks[i], 6) ? i : -1;
    return -1;
  };
  const rows = catalog.map((f) => ({ key: f.key, label: f.label, weeks: weeks.map(() => 0), total: 0 }));
  const at = new Map(rows.map((r) => [r.key, r]));
  for (const u of uses) {
    const r = at.get(u.feature);
    const i = idx(u.day);
    if (!r || i < 0) continue;
    r.weeks[i]++;
    r.total++;
  }
  rows.sort((a, b) => b.total - a.total);
  return { weeks, rows };
}

/** The user's most-used feature over the last `n` days (food_any excluded when a method is known). */
export function topFeature(uses: Use[], today: string, n = 30, catalog: FeatureDef[] = FEATURE_CATALOG): string | null {
  const counts = new Map<string, number>();
  for (const u of uses) if (within(u.day, today, n)) counts.set(u.feature, (counts.get(u.feature) ?? 0) + 1);
  // food_any overlaps the per-method rows; keep it only when no method is known, so the column is informative.
  if ([...counts.keys()].some((k) => k.startsWith("food_") && k !== "food_any")) counts.delete("food_any");
  const label = new Map(catalog.map((f) => [f.key, f.label]));
  let best: string | null = null;
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN || (v === bestN && best && k < best)) {
      best = k;
      bestN = v;
    }
  }
  return best ? (label.get(best) ?? best) : null;
}
