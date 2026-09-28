/**
 * v2.18 D9 seasonal events with limited-edition jewellery (schema_v44 event_badges). The events
 * and their rules live here (and in Android util/Seasonal.kt, same ids and numbers); the apps
 * insert the event_badges row when the goal is met inside the window. Pure.
 *
 *   Diwali protein challenge   Diwali - 10 days … Diwali + 4 days   hit protein on 10 days
 *   Monsoon steps              1 Jul … 30 Sep                       8,000+ steps on 30 days
 *   New Year transformation    1 Jan … 31 Jan                       log 25 days and train 12 days
 *
 * Ids carry the year ("diwali-protein-2026") so each year's jewel is its own limited edition.
 */
import { addDays } from "../dates";
import type { JewelShape } from "../jewels";

export type EventMetric = "protein_days" | "step_days" | "log_train";

export type SeasonalEvent = {
  id: string;
  slug: "diwali-protein" | "monsoon-steps" | "new-year";
  year: number;
  title: string;
  blurb: string;
  from: string;
  to: string;
  metric: EventMetric;
  /** protein_days / step_days: days needed. log_train: log days needed (train days below). */
  target: number;
  trainTarget?: number;
  stepGoal?: number;
  badge: { name: string; shape: JewelShape; metal: [string, string, string]; gem: [string, string, string] };
};

/** Lakshmi Puja dates (Diwali) by year. Add a line a year ahead. */
export const DIWALI: Record<number, string> = {
  2026: "2026-11-08",
  2027: "2027-10-29",
  2028: "2028-10-17",
};

export const MONSOON_STEP_GOAL = 8000;

const GOLD: [string, string, string] = ["#fbe7a8", "#D9B872", "#5E4518"];
const PLATINUM: [string, string, string] = ["#ffffff", "#cfd8e2", "#66717e"];

export function eventsForYear(year: number): SeasonalEvent[] {
  const out: SeasonalEvent[] = [];
  const diwali = DIWALI[year];
  if (diwali)
    out.push({
      id: `diwali-protein-${year}`,
      slug: "diwali-protein",
      year,
      title: "Diwali protein challenge",
      blurb: "Mithai season. Hit your protein on 10 days around Diwali.",
      from: addDays(diwali, -10),
      to: addDays(diwali, 4),
      metric: "protein_days",
      target: 10,
      badge: { name: `Diya ${year}`, shape: "octagon", metal: GOLD, gem: ["#ffe29a", "#ff9f1c", "#b4540a"] },
    });
  out.push({
    id: `monsoon-steps-${year}`,
    slug: "monsoon-steps",
    year,
    title: "Monsoon steps",
    blurb: `Rain or not: ${MONSOON_STEP_GOAL.toLocaleString("en-IN")}+ steps on 30 days between July and September.`,
    from: `${year}-07-01`,
    to: `${year}-09-30`,
    metric: "step_days",
    target: 30,
    stepGoal: MONSOON_STEP_GOAL,
    badge: { name: `Monsoon ${year}`, shape: "round", metal: PLATINUM, gem: ["#bfe6ff", "#2a7fb8", "#0b3a5c"] },
  });
  out.push({
    id: `new-year-${year}`,
    slug: "new-year",
    year,
    title: "New Year transformation",
    blurb: "January reset: log food on 25 days and train on 12.",
    from: `${year}-01-01`,
    to: `${year}-01-31`,
    metric: "log_train",
    target: 25,
    trainTarget: 12,
    badge: { name: `Resolution ${year}`, shape: "diamond", metal: PLATINUM, gem: ["#e0c8ff", "#8b5cf6", "#3b1a7a"] },
  });
  return out;
}

/** Events whose window includes today, then the next ones starting within `aheadDays`. */
export function eventsAround(today: string, aheadDays = 45): { live: SeasonalEvent[]; soon: SeasonalEvent[] } {
  const y = Number(today.slice(0, 4));
  const all = [...eventsForYear(y), ...eventsForYear(y + 1)];
  const horizon = addDays(today, aheadDays);
  const live = all.filter((e) => e.from <= today && today <= e.to);
  const soon = all.filter((e) => e.from > today && e.from <= horizon).sort((a, b) => (a.from < b.from ? -1 : 1));
  return { live, soon };
}

export function eventById(id: string): SeasonalEvent | null {
  const m = /-(\d{4})$/.exec(id);
  if (!m) return null;
  return eventsForYear(Number(m[1])).find((e) => e.id === id) ?? null;
}

export type EventData = {
  /** Days the protein target was hit (≥ 90 %). */
  proteinDays: Iterable<string>;
  /** Steps per day (summed from the exercise log / Health Connect). */
  stepsByDay: Record<string, number>;
  /** Days with food logged. */
  logDays: Iterable<string>;
  /** Days trained. */
  trainDays: Iterable<string>;
};

export type EventProgress = { value: number; target: number; fraction: number; done: boolean; line: string };

const inWindow = (d: string, e: SeasonalEvent) => d >= e.from && d <= e.to;
const countIn = (days: Iterable<string>, e: SeasonalEvent) => {
  const s = new Set<string>();
  for (const d of days) if (inWindow(d, e)) s.add(d);
  return s.size;
};

export function eventProgress(e: SeasonalEvent, data: EventData): EventProgress {
  if (e.metric === "protein_days") {
    const v = countIn(data.proteinDays, e);
    return { value: v, target: e.target, fraction: Math.min(1, v / e.target), done: v >= e.target, line: `${Math.min(v, e.target)} of ${e.target} protein days` };
  }
  if (e.metric === "step_days") {
    const goal = e.stepGoal ?? MONSOON_STEP_GOAL;
    const v = Object.entries(data.stepsByDay).filter(([d, n]) => inWindow(d, e) && n >= goal).length;
    return { value: v, target: e.target, fraction: Math.min(1, v / e.target), done: v >= e.target, line: `${Math.min(v, e.target)} of ${e.target} days over ${goal.toLocaleString("en-IN")} steps` };
  }
  const logs = countIn(data.logDays, e);
  const trains = countIn(data.trainDays, e);
  const tt = e.trainTarget ?? 12;
  const fraction = Math.min(1, Math.min(logs / e.target, trains / tt));
  return { value: Math.min(logs, e.target) + Math.min(trains, tt), target: e.target + tt, fraction, done: logs >= e.target && trains >= tt, line: `${Math.min(logs, e.target)}/${e.target} log days · ${Math.min(trains, tt)}/${tt} training days` };
}

/** "Ends in 3 days" / "Ends today" / "Starts 29 Oct". */
export function eventWhen(e: SeasonalEvent, today: string): string {
  if (today < e.from) {
    const [y, m, d] = e.from.split("-").map(Number);
    return `Starts ${new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  }
  const left = Math.round((Date.parse(e.to) - Date.parse(today)) / 864e5);
  if (left <= 0) return today > e.to ? "Ended" : "Ends today";
  return `Ends in ${left} ${left === 1 ? "day" : "days"}`;
}
