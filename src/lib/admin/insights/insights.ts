import type { FeatureUsageRow } from "./usage";
import type { FunnelStep } from "./funnel";
import { biggestDrop } from "./funnel";
import type { Stickiness } from "./engagement";
import type { MethodMix } from "./tracking";

/**
 * Plain-English observations, generated from the computed metrics (never from raw rows), each
 * with the numbers behind it. Ordered by how actionable they are; the page shows them as a list.
 */

export type Insight = { key: string; tone: "good" | "warn" | "info"; text: string };

export type InsightUser = {
  label: string;
  /** Days since the last activity; null = never active in the window. */
  daysSinceActive: number | null;
  signedUpDaysAgo: number;
};

export type InsightErrors = { total: number; users: number; top: { message: string; count: number } | null };

export type InsightInput = {
  features: FeatureUsageRow[];
  funnel: FunnelStep[];
  stickiness: Stickiness;
  methods: MethodMix;
  users: InsightUser[];
  errors: InsightErrors;
  /** Days of inactivity that count as "at risk". */
  riskDays?: number;
  /** Days of inactivity that earn a named per-user line. */
  quietDays?: number;
};

const pc = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** "a, b and c" */
export function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

const METHOD_LABEL: Record<string, string> = {
  food_search: "Search",
  food_voice: "Voice",
  food_text: "Typed-text",
  food_photo: "Photo",
  food_barcode: "Barcode",
  food_label: "Label",
};

export function generateInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { features, funnel, stickiness: st, methods, users, errors } = input;
  const riskDays = input.riskDays ?? 3;
  const quietDays = input.quietDays ?? 5;
  const active30 = features[0]?.active30 ?? 0;
  const by = new Map(features.map((f) => [f.key, f]));

  if (!active30) {
    out.push({ key: "no-active", tone: "warn", text: `No one has been active in the last 30 days (${plural(users.length, "user")} signed up).` });
  }

  // 1. Logging methods: most- and least-used, with "x of N".
  const m = features.filter((f) => f.key in METHOD_LABEL).sort((a, b) => b.users30 - a.users30 || b.uses30 - a.uses30);
  if (active30 && m.length) {
    const used = m.filter((f) => f.users30 > 0);
    const unused = m.filter((f) => f.users30 === 0).map((f) => lower(METHOD_LABEL[f.key]));
    if (used.length) {
      const top = used[0];
      const rest = used.slice(1).map((f) => `${lower(METHOD_LABEL[f.key])} by ${f.users30}`);
      const tail = [...rest, ...(unused.length ? [`${list(unused)} by 0`] : [])];
      out.push({
        key: "methods",
        tone: "info",
        text: `${METHOD_LABEL[top.key]} logging used by ${top.users30} of ${active30} active users in 30 days${tail.length ? `; ${tail.join("; ")}` : ""}.`,
      });
    } else if (methods.total) {
      out.push({ key: "methods", tone: "info", text: `No logging method recorded in 30 days: ${plural(methods.untracked, "meal")} predate app events.` });
    }
  }

  // 2. Most adopted feature.
  const top = features.find((f) => f.users30 > 0);
  if (top && active30) out.push({ key: "top-feature", tone: "good", text: `${top.label} is the most adopted feature: ${top.users30} of ${active30} active users (${pc(top.adoption30)}) in 30 days, ${top.perUserWeek ?? 0} uses per active user per week.` });

  // 3. Social: which feature carries it.
  const social = features.filter((f) => f.group === "Social").sort((a, b) => b.uses30 - a.uses30 || b.users30 - a.users30);
  if (active30 && social.length) {
    const s = social[0];
    if (s.uses30) out.push({ key: "social", tone: "info", text: `${s.label} is the most-used social feature (${plural(s.uses30, "use")} by ${plural(s.users30, "user")} in 30 days).` });
    else out.push({ key: "social", tone: "warn", text: "No one used any social feature (squads, chat, reactions, challenges, battle) in 30 days." });
  }

  // 4. Never / rarely used.
  const never = features.filter((f) => f.status === "never").map((f) => f.label);
  if (active30 && never.length) out.push({ key: "never", tone: "warn", text: `Never used in the last 30 days: ${list(never)}.` });
  const rare = features.filter((f) => f.status === "rare").map((f) => `${f.label} (${f.users30} of ${f.active30})`);
  if (rare.length) out.push({ key: "rare", tone: "info", text: `Rarely used: ${list(rare)}.` });
  const unmeasured = features.filter((f) => f.status === "not-measured").map((f) => f.label);
  if (unmeasured.length) out.push({ key: "unmeasured", tone: "info", text: `Not measured yet (no event reports it): ${list(unmeasured)}.` });

  // 5. Big week-on-week movers (need enough volume to mean something).
  for (const f of features) {
    if (f.trendPct == null || f.thisWeek + f.lastWeek < 4 || Math.abs(f.trendPct) < 0.5 || (f.key.startsWith("food_") && f.key !== "food_any")) continue;
    out.push({ key: `trend-${f.key}`, tone: f.trendPct > 0 ? "good" : "warn", text: `${f.label} ${f.trendPct > 0 ? "up" : "down"} ${Math.round(Math.abs(f.trendPct) * 100)}% this week (${f.thisWeek} vs ${f.lastWeek} uses the week before).` });
  }

  // 6. Activation funnel: the leakiest step.
  const drop = biggestDrop(funnel);
  if (drop) out.push({ key: "funnel", tone: "warn", text: `Biggest activation drop: ${drop.from.users} reached "${lower(drop.from.label)}" but only ${drop.to.users} went on to "${lower(drop.to.label)}" (${pc(drop.to.ofPrev)}).` });

  // 7. Stickiness.
  if (st.wau && st.dauWau != null) {
    const perWeek = Math.round(st.dauWau * 7 * 10) / 10;
    out.push({ key: "stickiness", tone: st.dauWau >= 0.4 ? "good" : "info", text: `DAU/WAU is ${pc(st.dauWau)}: a weekly active user is active on about ${perWeek} of 7 days (avg DAU ${st.dauAvg7}, WAU ${st.wau}).` });
  }

  // 8. Users going quiet, and users who never started.
  const atRisk = users.filter((u) => u.daysSinceActive != null && u.daysSinceActive >= riskDays);
  if (atRisk.length) out.push({ key: "at-risk", tone: "warn", text: `${plural(atRisk.length, "user")} at risk: no activity in ${riskDays}+ days.` });
  const quiet = atRisk.filter((u) => (u.daysSinceActive ?? 0) >= quietDays).sort((a, b) => (a.daysSinceActive ?? 0) - (b.daysSinceActive ?? 0));
  for (const u of quiet.slice(0, 8)) out.push({ key: `quiet-${u.label}`, tone: "warn", text: `${u.label} hasn't been active in ${u.daysSinceActive} days.` });
  if (quiet.length > 8) out.push({ key: "quiet-more", tone: "warn", text: `…and ${quiet.length - 8} more quiet for ${quietDays}+ days.` });
  const neverStarted = users.filter((u) => u.daysSinceActive == null);
  if (neverStarted.length) out.push({ key: "never-started", tone: "warn", text: `${plural(neverStarted.length, "user")} signed up but ${neverStarted.length === 1 ? "has" : "have"} no activity in the last 90 days: ${list(neverStarted.slice(0, 6).map((u) => u.label))}${neverStarted.length > 6 ? "…" : ""}.` });

  // 9. Errors.
  if (errors.total) out.push({ key: "errors", tone: "warn", text: `Errors shown ${plural(errors.total, "time")} to ${plural(errors.users, "user")} in 30 days${errors.top ? `; most common: "${errors.top.message}" (${errors.top.count})` : ""}.` });

  // 10. Food logging frequency.
  const food = by.get("food_any");
  if (food?.perUserWeek != null && food.users30) out.push({ key: "food-frequency", tone: "info", text: `Active users log food ${food.perUserWeek} times a week on average (${food.uses30} meals in 30 days).` });

  return out;
}
