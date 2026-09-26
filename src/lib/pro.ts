/**
 * v2.13 Locked In Pro (spec §1). Pure: no Supabase, no React, so scripts/check-pro.ts runs it and
 * Android's util/Pro.kt can port it line for line.
 *
 * hasPro = plan ∈ {beta, pro} and (pro_until is null or in the future). While schema_v36 isn't
 * applied (no `plan` column) everyone has Pro. During the beta every account is on 'beta', so the
 * paywall below exists and is tested but can't trigger.
 */

export type Plan = "free" | "beta" | "pro";

export type ProConfig = { price_inr: number; period: "month" | "year"; beta_all_pro: boolean; payments_enabled: boolean };

/** Fallback when app_config.pro is missing (v36 not applied, or the row was removed). */
export const DEFAULT_PRO_CONFIG: ProConfig = { price_inr: 700, period: "month", beta_all_pro: true, payments_enabled: false };

export type ProState = {
  plan: Plan;
  /** ISO timestamp, or null (no end date). */
  pro_until: string | null;
  /** False while the v36 columns are missing (then `pro` is true for everyone). */
  columns: boolean;
  pro: boolean;
  config: ProConfig;
};

export function parsePlan(v: unknown): Plan {
  return v === "free" || v === "pro" || v === "beta" ? v : "beta";
}

/**
 * The single rule both apps use. `columnMissing` = the profile has no plan column yet (v36 not
 * applied), which counts as Pro. `now` is injectable for the tests.
 */
export function hasPro(plan: Plan | null | undefined, proUntil: string | null | undefined, now: Date = new Date(), columnMissing = false): boolean {
  if (columnMissing) return true;
  if (plan !== "beta" && plan !== "pro") return false;
  if (proUntil == null || proUntil === "") return true;
  const t = Date.parse(proUntil);
  if (!Number.isFinite(t)) return true;
  return t > now.getTime();
}

export function parseProConfig(v: unknown): ProConfig {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const price = Number(o.price_inr);
  return {
    price_inr: Number.isFinite(price) && price > 0 ? Math.round(price) : DEFAULT_PRO_CONFIG.price_inr,
    period: o.period === "year" ? "year" : "month",
    beta_all_pro: o.beta_all_pro !== false,
    payments_enabled: o.payments_enabled === true,
  };
}

/** "₹700 / month" */
export function priceText(c: ProConfig): string {
  return `₹${c.price_inr.toLocaleString("en-IN")} / ${c.period}`;
}

export type ProFeature =
  | "adaptive_targets"
  | "what_to_eat"
  | "menu_scan"
  | "recipes"
  | "micronutrients"
  | "fasting"
  | "routines"
  | "pr_charts"
  | "muscle_map"
  | "recap"
  | "share_cards"
  | "before_after";

/** The Pro screen's benefits list, in order. */
export const PRO_FEATURES: { key: ProFeature; title: string; sub: string }[] = [
  { key: "adaptive_targets", title: "Adaptive weekly targets", sub: "Your calorie target learns from your real trend" },
  { key: "what_to_eat", title: "What should I eat?", sub: "Indian picks that fit what's left today" },
  { key: "menu_scan", title: "Restaurant menu scan", sub: "Best picks off any menu, in one photo" },
  { key: "recipes", title: "Recipe builder", sub: "Your home recipes, logged per serving" },
  { key: "micronutrients", title: "Micronutrient dashboard", sub: "Iron, calcium, fibre and more, week by week" },
  { key: "fasting", title: "Fasting timer", sub: "12:12 to 20:4, with gentle stage notes" },
  { key: "routines", title: "Routines and planner", sub: "Templates, your own splits, today's session" },
  { key: "pr_charts", title: "PR charts", sub: "Best sets and estimated 1RM per exercise" },
  { key: "muscle_map", title: "Muscle map", sub: "What you trained this week, set by set" },
  { key: "recap", title: "Weekly and monthly recap", sub: "Your story, slide by slide" },
  { key: "share_cards", title: "Share cards", sub: "Story-sized cards for PRs and streaks" },
  { key: "before_after", title: "Before / after slider", sub: "Compare two progress photos side by side" },
];

/** Free forever, shown under the list so nobody thinks logging will be paywalled. */
export const FREE_FOREVER = ["Logging meals and workouts", "Photo, barcode and label scans", "Squads", "Water", "Progress basics", "Body measurements", "Progress photos"];

export function isProFeature(key: string): key is ProFeature {
  return PRO_FEATURES.some((f) => f.key === key);
}

/**
 * Paywall decision for one feature: "open" (use it), "locked" (show the Pro screen). With payments
 * off, a locked user sees the Pro screen without a buy button. Free features are always open.
 */
export function gate(feature: string, pro: boolean): "open" | "locked" {
  if (!isProFeature(feature)) return "open";
  return pro ? "open" : "locked";
}

/** What the Pro screen's button says. */
export function proButton(s: Pick<ProState, "plan" | "pro" | "config">): { label: string; disabled: boolean } {
  if (s.plan === "beta" && s.pro) return { label: "You're in the beta", disabled: true };
  if (s.plan === "pro" && s.pro) return { label: "You're on Pro", disabled: true };
  if (!s.config.payments_enabled) return { label: "Coming soon", disabled: true };
  return { label: `Get Pro · ${priceText(s.config)}`, disabled: false };
}

/** Builds the state the UI reads, from raw DB values (null row = columns missing). */
export function proState(row: { plan?: unknown; pro_until?: unknown } | null, config: unknown, now: Date = new Date()): ProState {
  const columns = row != null;
  const plan = parsePlan(row?.plan);
  const until = typeof row?.pro_until === "string" && row.pro_until ? row.pro_until : null;
  return { plan, pro_until: until, columns, pro: hasPro(plan, until, now, !columns), config: parseProConfig(config) };
}
