import { ALL_BADGES, earned, progressValue, type Badge, type BadgeGroup, type BadgeProgress } from "./badges";

/**
 * v2.16 "jewellery" badges (board RefJewellery): a bevelled metal frame, a grainy face and a glowing
 * faceted gem. Frame SHAPE by category, frame METAL by tier, gem COLOUR by category. The badge list
 * and criteria are unchanged (lib/badges.ts); this is only how they look. Shared with Android via
 * docs/v216-shared.md, so ids, tiers and colours must stay in step. Pure data, no React.
 */

export type JewelCategory = "streak" | "nutrition" | "training" | "squad" | "special";
export type JewelTier = "bronze" | "silver" | "gold" | "platinum";
export type JewelShape = "shield" | "hexagon" | "diamond" | "round" | "octagon";

export const CATEGORY_SHAPE: Record<JewelCategory, JewelShape> = {
  streak: "shield",
  nutrition: "hexagon",
  training: "diamond",
  squad: "round",
  special: "octagon",
};

/** [highlight, mid, shadow] for the frame's diagonal gradient. */
export const METAL: Record<JewelTier, [string, string, string]> = {
  bronze: ["#f0b48a", "#b0643a", "#5a2c12"],
  silver: ["#f4f5f7", "#a9adb4", "#4f535a"],
  gold: ["#fbe7a8", "#D9B872", "#5E4518"],
  platinum: ["#ffffff", "#cfd8e2", "#66717e"],
};

/** [light, mid, deep] for the gem's radial gradient and facets. */
export const GEM: Record<JewelCategory, [string, string, string]> = {
  streak: ["#ffb08a", "#FF5B1F", "#C2410C"],
  nutrition: ["#b8f5d8", "#1fae6f", "#0a4d31"],
  training: ["#9fd0ff", "#2a6fd8", "#0e2d66"],
  squad: ["#e0c8ff", "#8b5cf6", "#3b1a7a"],
  special: ["#fff1c4", "#e2b04a", "#6b4a10"],
};

/** Which jewel category each existing badge group wears. Training / squad are ready for new badges. */
export const GROUP_CATEGORY: Record<BadgeGroup, JewelCategory> = {
  STREAK: "streak",
  MEALS: "nutrition",
  CALORIES: "special",
};

/** Fixed tier per badge (by name, as in lib/badges.ts / Android util/Badges.kt). */
const TIER_BY_NAME: Record<string, JewelTier> = {
  Rookie: "bronze",
  "Getting Serious": "silver",
  "Locked In": "gold",
  "Triple Threat": "gold",
  "No Days Off": "platinum",
  Immortal: "platinum",
  "Forking Around": "bronze",
  "Mission: Nutrition": "silver",
  "The Logfather": "gold",
  "One Hit Wonder": "bronze",
  "Loyalty III": "silver",
  Bullseye: "gold",
};

export const TIER_RANK: Record<JewelTier, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };

/** "Getting Serious" → "getting-serious", "Mission: Nutrition" → "mission-nutrition". */
export function badgeId(b: Badge): string {
  return b.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function jewelTier(b: Badge): JewelTier {
  return TIER_BY_NAME[b.name] ?? "bronze";
}

export function jewelCategory(b: Badge): JewelCategory {
  return GROUP_CATEGORY[b.group];
}

export type JewelItem = { badge: Badge; id: string; category: JewelCategory; tier: JewelTier; got: boolean; value: number; fraction: number };

export function jewelItems(p: BadgeProgress): JewelItem[] {
  return ALL_BADGES.map((b) => {
    const value = progressValue(p, b.group);
    return { badge: b, id: badgeId(b), category: jewelCategory(b), tier: jewelTier(b), got: earned(p, b), value, fraction: Math.max(0, Math.min(1, value / b.need)) };
  });
}

/** The best earned badge (highest tier, then the hardest), or null. */
export function topJewel(p: BadgeProgress): JewelItem | null {
  const got = jewelItems(p).filter((x) => x.got);
  got.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.badge.need - a.badge.need);
  return got[0] ?? null;
}

/** The locked badge closest to done ("Next up"), or null when every badge is earned. */
export function nextJewel(p: BadgeProgress): JewelItem | null {
  const locked = jewelItems(p).filter((x) => !x.got);
  locked.sort((a, b) => b.fraction - a.fraction || a.badge.need - b.badge.need);
  return locked[0] ?? null;
}

/**
 * A squadmate's top badge from what the leaderboard knows: their current day streak (a lower bound
 * of their best run), mapped onto the streak badges. Null below the first one (3 days).
 */
export function streakJewel(flames: number): { category: JewelCategory; tier: JewelTier; name: string } | null {
  const hit = ALL_BADGES.filter((b) => b.group === "STREAK" && flames >= b.need).pop();
  return hit ? { category: "streak", tier: jewelTier(hit), name: hit.name } : null;
}

/** Unlock-moment headlines, picked per badge so the same badge always gets the same line. */
export const UNLOCK_LINES = ["Here’s some jewellery.", "New hardware.", "That’s going on the wall."] as const;

export function unlockLine(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return UNLOCK_LINES[h % UNLOCK_LINES.length];
}

/** "You logged 7 days straight and earned the Bronze Streak badge." style caption. */
export function unlockCaption(x: { badge: Badge; tier: JewelTier }): string {
  const tier = x.tier.charAt(0).toUpperCase() + x.tier.slice(1);
  const b = x.badge;
  const what = b.group === "STREAK" ? `You logged ${b.need} days in a row` : b.group === "MEALS" ? `You logged ${b.need} meals` : b.need === 1 ? "You landed a day on target" : `You landed ${b.need} days on target`;
  return `${what} and earned ${b.name}, a ${tier} badge.`;
}

/** Badges seen on this device, so the unlock moment plays once per badge. */
export const SEEN_BADGES_KEY = "li-badges-seen-v216";

/** Newly earned ids given what was seen before. `seen` null = first run: nothing is "new". */
export function newlyEarned(p: BadgeProgress, seen: string[] | null): JewelItem[] {
  if (seen == null) return [];
  const s = new Set(seen);
  return jewelItems(p).filter((x) => x.got && !s.has(x.id));
}
