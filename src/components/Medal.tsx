"use client";

import { useId } from "react";
import { ALL_BADGES, earned, progressValue, type Badge, type BadgeGroup, type BadgeProgress } from "@/lib/badges";
import { drawLen, md } from "./motion";

/**
 * v2.12 Medals v2: a knurled gold / silver / bronze rim, a dark enamel centre with a soft
 * highlight and an engraved thin-line icon. Locked medals are a dark disc with an accent progress
 * ring. Tiers come from where a badge sits in its group: the easiest third bronze, the middle
 * silver, the hardest gold (Rookie 3 d = bronze … Immortal 1000 d = gold).
 */

export type Tier = "gold" | "silver" | "bronze";

const METALS: Record<Tier, [string, string, string, string]> = {
  gold: ["#fff1c4", "#e2b04a", "#8a5a12", "#3b2606"],
  silver: ["#ffffff", "#c9c9d1", "#6c6c75", "#26262a"],
  bronze: ["#ffd9b8", "#c97a42", "#7a3d17", "#2e1407"],
};

export function badgeTier(b: Badge): Tier {
  const group = ALL_BADGES.filter((x) => x.group === b.group);
  const i = group.findIndex((x) => x.name === b.name);
  const pos = group.length <= 1 ? 1 : i / (group.length - 1);
  return pos < 1 / 3 ? "bronze" : pos < 2 / 3 ? "silver" : "gold";
}

const TIER_RANK: Record<Tier, number> = { gold: 3, silver: 2, bronze: 1 };

/** Thin-line icons engraved in the medal, one per badge group (24-unit paths). */
export const GROUP_ICON: Record<BadgeGroup, string> = {
  STREAK: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  MEALS: "M3 11h18a9 9 0 0 1-18 0zM7 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M17 7c0-1.5 1-2 1-3.5",
  CALORIES: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
};
export const TROPHY_ICON = "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3";

const KNURL = Array.from({ length: 60 }, (_, k) => {
  const a = (k * Math.PI) / 30;
  const r = (n: number) => Math.round(n * 10) / 10;
  return [r(38 + 33 * Math.cos(a)), r(38 + 33 * Math.sin(a)), r(38 + 36.5 * Math.cos(a)), r(38 + 36.5 * Math.sin(a))];
});

/** An earned medal. `delay` pops it in (ms); null = no entrance animation. */
export function MetalMedal({ tier, icon, size = 76, delay = null }: { tier: Tier; icon: string; size?: number; delay?: number | null }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hi, mid, lo, deep] = METALS[tier];
  const rim = `mr${uid}`;
  const enamel = `me${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 76 76"
      aria-hidden="true"
      className={delay != null ? "m-pop" : undefined}
      style={md(delay ?? 0, { filter: "drop-shadow(0 6px 10px var(--medal-drop))", flex: "none" })}
    >
      <defs>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset=".45" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
        <radialGradient id={enamel} cx=".35" cy=".3" r=".9">
          <stop offset="0" stopColor="#2a2a2d" />
          <stop offset="1" stopColor={deep} />
        </radialGradient>
      </defs>
      <circle cx="38" cy="38" r="37" fill={`url(#${rim})`} />
      {KNURL.map(([x1, y1, x2, y2], k) => (
        <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lo} strokeOpacity=".55" strokeWidth="1.2" />
      ))}
      <circle cx="38" cy="38" r="29" fill={`url(#${rim})`} transform="rotate(180 38 38)" />
      <circle cx="38" cy="38" r="26" fill={`url(#${enamel})`} />
      <circle cx="38" cy="38" r="23" fill="none" stroke={`url(#${rim})`} strokeWidth=".7" strokeDasharray="1.5 2.5" opacity=".9" />
      <g transform="translate(27 27)">
        <path d={icon} transform="scale(.92)" fill="none" stroke={`url(#${rim})`} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M14,24 A28,28 0 0 1 34,11" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A locked medal: dark disc, faint icon, accent ring showing how far along it is. */
export function LockedMedal({ progress, icon, size = 76, delay = null }: { progress: number; icon: string; size?: number; delay?: number | null }) {
  const animate = delay != null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 76 76"
      aria-hidden="true"
      className={animate ? "m-pop" : undefined}
      style={md(delay ?? 0, { filter: "drop-shadow(0 6px 10px var(--medal-drop))", flex: "none" })}
    >
      <circle cx="38" cy="38" r="33" fill="none" stroke="var(--track)" strokeWidth="3" />
      <circle
        cx="38"
        cy="38"
        r="33"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={1}
        transform="rotate(-90 38 38)"
        className={animate ? "m-draw" : undefined}
        style={drawLen(progress, (delay ?? 0) + 300, animate ? undefined : { strokeDasharray: `${Math.max(0, Math.min(1, progress))} 3` })}
      />
      <circle cx="38" cy="38" r="27" fill="var(--medal-well)" />
      <g transform="translate(28 28)" opacity=".7">
        <path d={icon} transform="scale(.83)" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Ribbon text under a medal: "GOLD" in the metal's colour, or "5 OF 7" in the accent. */
export function TierLabel({ tier, locked }: { tier?: Tier; locked?: string }) {
  return (
    <span className="text-[9.5px] font-semibold uppercase" style={{ letterSpacing: "1.4px", color: locked ? "var(--accent)" : `var(--tier-${tier})` }}>
      {locked ?? tier}
    </span>
  );
}

export type ShelfItem = { badge: Badge; tier: Tier; got: boolean; value: number; fraction: number };

function item(p: BadgeProgress, b: Badge): ShelfItem {
  const value = progressValue(p, b.group);
  return { badge: b, tier: badgeTier(b), got: earned(p, b), value, fraction: Math.max(0, Math.min(1, value / b.need)) };
}

/** Up to three earned medals (best tier first) and the locked one closest to done. */
export function medalShelf(p: BadgeProgress): { earned: ShelfItem[]; next: ShelfItem | null } {
  const all = ALL_BADGES.map((b) => item(p, b));
  const got = all
    .filter((x) => x.got)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.badge.need - a.badge.need)
    .slice(0, 3);
  const locked = all.filter((x) => !x.got).sort((a, b) => b.fraction - a.fraction || a.badge.need - b.badge.need);
  return { earned: got, next: locked[0] ?? null };
}

/** "2 more days" / "12 more meals" / "3 more days on target". */
export function moreText(x: ShelfItem): string {
  const k = Math.max(0, x.badge.need - x.value);
  if (x.badge.group === "MEALS") return `${k} more meal${k === 1 ? "" : "s"}`;
  if (x.badge.group === "CALORIES") return `${k} more day${k === 1 ? "" : "s"} on target`;
  return `${k} more day${k === 1 ? "" : "s"}`;
}
