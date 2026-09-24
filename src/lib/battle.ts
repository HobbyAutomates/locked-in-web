/**
 * Squad Food Battle scoring — mirrors bandlog.battle_score / bandlog.battle_board in
 * supabase/schema_v28.sql exactly. Kept here so the UI can show "X pts to lead" and the goal
 * band without a round trip, and so scripts/check-battle.ts can test the formula offline.
 *
 * See docs/food-battle-spec.md for the rules. Any change here needs the matching SQL change.
 */
import type { GoalType } from "./types";

export type BattleGoal = GoalType; // "lose" | "maintain" | "gain"

/** The [low, high] r-band that scores 100 for a goal. */
export function goalBand(goal: BattleGoal): [number, number] {
  if (goal === "gain") return [1.0, 1.1];
  if (goal === "lose") return [0.9, 1.0];
  return [0.95, 1.05];
}

/** r = eaten / target, where target already includes burned calories when add_burned_to_goal is on. */
export function ratio(eaten: number, target: number): number {
  return target > 0 ? eaten / target : 0;
}

/** target = calorie_target, plus burned when add_burned_to_goal is on. */
export function battleTarget(calorieTarget: number, burned: number, addBurnedToGoal: boolean): number {
  return calorieTarget + (addBurnedToGoal ? burned : 0);
}

/**
 * The 0-100 score for one goal_type and ratio r = eaten / target. Matches
 * bandlog.battle_score(goal_type, r) in schema_v28.sql, case for case.
 */
export function battleScore(goal: BattleGoal, r: number): number {
  let score: number;
  if (goal === "gain") {
    if (r < 1.0) score = 100 - 200 * (1 - r);
    else if (r > 1.1) score = 100 - 150 * (r - 1.1);
    else score = 100;
  } else if (goal === "lose") {
    if (r > 1.0) score = 100 - 250 * (r - 1);
    else if (r < 0.9) {
      score = 100 - 200 * (0.9 - r);
      // Safety cap: badly under-fuelled (r < 0.75) never scores above 40, and never reads as praise.
      if (r < 0.75) score = Math.min(40, score);
    } else score = 100;
  } else {
    // maintain
    const dev = Math.abs(r - 1);
    score = dev > 0.05 ? 100 - 200 * (dev - 0.05) : 100;
  }
  return Math.min(100, Math.max(0, score));
}

/** True when eaten is dangerously low for a cutting goal — the board must show "under-fuelled", never praise. */
export function isUnderFuelled(goal: BattleGoal, r: number): boolean {
  return goal === "lose" && r < 0.75;
}

export type BattleRow = {
  userId: string;
  name: string;
  avatarPath: string | null;
  goalType: BattleGoal;
  eaten: number;
  target: number;
  meals: number;
  private: boolean;
};

export type ScoredBattleRow = BattleRow & {
  r: number;
  score: number;
  eligible: boolean;
  underFuelled: boolean;
  canWin: boolean;
};

/** At least 2 logged meals to count for the day — stops "logged nothing = 0 kcal = perfect cut". */
export function isEligible(meals: number): boolean {
  return meals >= 2;
}

/** Scores one row the way battle_board does: ineligible or private members can't win, but still show. */
export function scoreRow(row: BattleRow): ScoredBattleRow {
  const r = ratio(row.eaten, row.target);
  const eligible = isEligible(row.meals);
  const score = eligible ? battleScore(row.goalType, r) : 0;
  return {
    ...row,
    r,
    score,
    eligible,
    underFuelled: isUnderFuelled(row.goalType, r),
    canWin: eligible && !row.private,
  };
}

/**
 * Ranks a board's rows the way battle_board / battle_close pick a winner: only rows that
 * canWin are ordered by score; ties break by more meals, then the earlier last-log time
 * (lower `tieBreakTime`, e.g. an ISO string or ms timestamp — smaller sorts first).
 */
export function rankBattle<T extends ScoredBattleRow & { tieBreakTime?: string | number | null }>(rows: T[]): T[] {
  const winners = rows.filter((r) => r.canWin);
  const rest = rows.filter((r) => !r.canWin);
  winners.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.meals !== a.meals) return b.meals - a.meals;
    const at = a.tieBreakTime ? +new Date(a.tieBreakTime) : Infinity;
    const bt = b.tieBreakTime ? +new Date(b.tieBreakTime) : Infinity;
    return at - bt;
  });
  return [...winners, ...rest];
}

/** The leader's score among rows that can win, or null when nobody is eligible yet. */
export function leaderScore(rows: ScoredBattleRow[]): number | null {
  const winners = rows.filter((r) => r.canWin);
  if (!winners.length) return null;
  return Math.max(...winners.map((r) => r.score));
}

/** "X pts to lead" copy for a non-leading, eligible row; null for the leader or the ineligible. */
export function pointsToLead(row: ScoredBattleRow, rows: ScoredBattleRow[]): number | null {
  const lead = leaderScore(rows);
  if (lead == null || !row.canWin) return null;
  const gap = Math.round(lead - row.score);
  return gap > 0 ? gap : null;
}
