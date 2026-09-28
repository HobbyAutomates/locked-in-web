/**
 * v2.18 D12 squad vs squad leagues. UNCONFIRMED by the owner, so it's behind two switches that are
 * both OFF: this client flag and app_config.leagues.enabled (schema_v44). Squads sit in tiers
 * 1 (Diamond) … 5 (Bronze); a squad's weekly score is its members' average week points; each week
 * the top 20 % of a tier go up and the bottom 20 % go down (at least one each way once a tier has
 * 5+ squads). Pure. Android: util/Leagues.kt.
 */
export const LEAGUES_ENABLED = false;

export const TIERS = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"] as const;
export const TOP_TIER = 1;
export const BOTTOM_TIER = 5;
export const MOVE_SHARE = 0.2;

export function tierName(tier: number): string {
  const t = Math.max(TOP_TIER, Math.min(BOTTOM_TIER, Math.floor(tier) || BOTTOM_TIER));
  return TIERS[t - 1];
}

export type Standing = { group_id: string; points: number; name?: string };
export type Movement = "up" | "down" | "stay";

/** How many squads move each way in a tier of `n`. */
export function movers(n: number): number {
  if (n < 5) return 0;
  return Math.max(1, Math.floor(n * MOVE_SHARE));
}

/**
 * Closes one tier's week. Ranked by points (ties: the order given, i.e. older squad first).
 * The top tier can't go up and the bottom tier can't go down.
 */
export function closeWeek(standings: Standing[], tier: number): { group_id: string; rank: number; movement: Movement; nextTier: number }[] {
  const ranked = standings.map((s, i) => ({ s, i })).sort((a, b) => b.s.points - a.s.points || a.i - b.i);
  const m = movers(ranked.length);
  return ranked.map(({ s }, idx) => {
    let movement: Movement = "stay";
    if (idx < m && tier > TOP_TIER) movement = "up";
    else if (idx >= ranked.length - m && tier < BOTTOM_TIER) movement = "down";
    return { group_id: s.group_id, rank: idx + 1, movement, nextTier: movement === "up" ? tier - 1 : movement === "down" ? tier + 1 : tier };
  });
}

/** Whether the leagues screen shows at all. */
export function leaguesOn(serverEnabled: boolean | null | undefined): boolean {
  return LEAGUES_ENABLED && serverEnabled === true;
}
