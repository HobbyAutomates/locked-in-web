import { pct } from "./time";

/**
 * Activation funnel. Steps are nested: a user counts at a step only if they also passed every
 * step before it, so each bar is ≤ the one above.
 */

export type FunnelUser = {
  id: string;
  onboarded: boolean;
  /** Meals logged (90-day window). */
  meals: number;
  /** Distinct days with any logging (food, activity, water, weight). */
  logDays: number;
  inSquad: boolean;
  /** Distinct active days (any event or logged row). */
  activeDays: number;
};

export type FunnelStep = { key: string; label: string; users: number; ofStart: number | null; ofPrev: number | null };

export const FUNNEL_STEPS: { key: string; label: string; test: (u: FunnelUser) => boolean }[] = [
  { key: "signed_up", label: "Signed up", test: () => true },
  { key: "onboarded", label: "Finished onboarding", test: (u) => u.onboarded },
  { key: "first_meal", label: "Logged a first meal", test: (u) => u.meals >= 1 },
  { key: "three_days", label: "Logged on 3+ days", test: (u) => u.logDays >= 3 },
  { key: "squad", label: "Joined a squad", test: (u) => u.inSquad },
  { key: "seven_days", label: "Active on 7+ days", test: (u) => u.activeDays >= 7 },
];

export function activationFunnel(users: FunnelUser[]): FunnelStep[] {
  let pool = users;
  const start = users.length;
  let prev = start;
  return FUNNEL_STEPS.map((s) => {
    pool = pool.filter(s.test);
    const n = pool.length;
    const step = { key: s.key, label: s.label, users: n, ofStart: pct(n, start), ofPrev: pct(n, prev) };
    prev = n;
    return step;
  });
}

/** The step with the lowest conversion from the one before (ignoring an empty previous step). */
export function biggestDrop(steps: FunnelStep[]): { from: FunnelStep; to: FunnelStep } | null {
  let best: { from: FunnelStep; to: FunnelStep } | null = null;
  for (let i = 1; i < steps.length; i++) {
    const to = steps[i];
    if (!steps[i - 1].users || to.ofPrev == null || to.ofPrev >= 1) continue;
    if (!best || to.ofPrev < (best.to.ofPrev ?? 1)) best = { from: steps[i - 1], to };
  }
  return best;
}
