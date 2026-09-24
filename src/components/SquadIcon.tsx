"use client";

import { useState } from "react";
import { People } from "./icons";

/**
 * v2.6: the 12 pre-made squad icons (Cal AI's "Choose a group photo"): a gradient disc with a
 * flat illustration. `groups.icon` stores the key; Android draws the same keys.
 */
export const SQUAD_ICON_KEYS = ["biceps", "salad", "cherry", "flame", "dumbbell", "runner", "bowl", "trophy", "apple", "bolt", "yoga", "bike"] as const;
export type SquadIconKey = (typeof SQUAD_ICON_KEYS)[number];

export const SQUAD_ICON_LABELS: Record<SquadIconKey, string> = {
  biceps: "Biceps",
  salad: "Salad",
  cherry: "Cherry",
  flame: "Flame",
  dumbbell: "Dumbbell",
  runner: "Runner",
  bowl: "Dal bowl",
  trophy: "Trophy",
  apple: "Apple",
  bolt: "Bolt",
  yoga: "Yoga",
  bike: "Bike",
};

const BG: Record<SquadIconKey, [string, string]> = {
  biceps: ["#ff7a59", "#e8352b"],
  salad: ["#6fdc7e", "#23a047"],
  cherry: ["#ff8fb0", "#c9184a"],
  flame: ["#ffb347", "#ff5f1f"],
  dumbbell: ["#8fa6c4", "#44546e"],
  runner: ["#5ee0c8", "#12937c"],
  bowl: ["#ffd36b", "#e99a1c"],
  trophy: ["#b18cff", "#6c3fd6"],
  apple: ["#c8f06a", "#6fae1c"],
  bolt: ["#7aa7ff", "#2d5bd8"],
  yoga: ["#f6a6ff", "#a445c7"],
  bike: ["#7fd6ff", "#1a8fd0"],
};

function Art({ k }: { k: SquadIconKey }) {
  switch (k) {
    case "biceps":
      return (
        <g stroke="#b5651d" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M9 31c0-6 5-10 10.5-10 3 0 5 1.6 6 3.8L27.5 16c.6-3 2.3-4.8 5-4.8h2.6c2.7 0 4.2 2.2 3.4 4.7L36.3 21c-1 2.6-1.6 4.6-1.6 7.2V33c0 3.3-2.4 5.2-5.6 5.2H13.4C10.8 38.2 9 36.4 9 33.8z" fill="#ffd166" />
          <path d="M15.5 27.5c2.6-3 7-3.1 9.6.2" fill="none" />
          <path d="M30 16.5h5.5" fill="none" />
        </g>
      );
    case "salad":
      return (
        <g>
          <path d="M16 20c-1-4 2-7 5-6 1-3 6-4 8-1 3-1 6 2 5 5 3 1 3 5 1 6H14c-2-1-1-4 2-4z" fill="#7bd25a" stroke="#2f7d20" strokeWidth="1.2" />
          <circle cx="30" cy="19" r="2.4" fill="#ff5a5a" />
          <path d="M10 25h28a14 12 0 0 1-28 0z" fill="#fff" stroke="#cfd8dc" strokeWidth="1.4" />
        </g>
      );
    case "cherry":
      return (
        <g>
          <path d="M24 10c-2 6-7 10-9 16M24 10c1 6 5 10 9 14" stroke="#3a7d1e" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M24 10c4-3 9-2 11 1-4 2-8 2-11-1z" fill="#56b33b" />
          <circle cx="15" cy="30" r="7" fill="#e5173f" />
          <circle cx="33" cy="28" r="7" fill="#d10f37" />
          <circle cx="13" cy="28" r="1.8" fill="#fff" opacity="0.7" />
          <circle cx="31" cy="26" r="1.8" fill="#fff" opacity="0.7" />
        </g>
      );
    case "flame":
      return (
        <g>
          <path d="M24 8c2 6 10 9 10 19a10 10 0 0 1-20 0c0-5 3-8 5-10 0 3 1 5 3 6-1-6 0-11 2-15z" fill="#fff3d6" />
          <path d="M24 22c1.5 3 5 4.5 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" fill="#ffb020" />
        </g>
      );
    case "dumbbell":
      return (
        <g fill="#eef3f8" stroke="#2b3647" strokeWidth="1.4">
          <rect x="8" y="17" width="5" height="14" rx="1.5" />
          <rect x="13" y="19" width="4" height="10" rx="1.2" />
          <rect x="35" y="17" width="5" height="14" rx="1.5" />
          <rect x="31" y="19" width="4" height="10" rx="1.2" />
          <rect x="17" y="22.5" width="14" height="3" rx="1" />
        </g>
      );
    case "runner":
      return (
        <g stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx="29" cy="11" r="3" fill="#fff" stroke="none" />
          <path d="M16 37l5-9 5 3 2 7" />
          <path d="M21 28l2-8 6-2 4 5 5 1" />
          <path d="M23 20l-6 2-3-3" />
        </g>
      );
    case "bowl":
      return (
        <g>
          <path d="M14 21c2-4 6-6 10-6s8 2 10 6z" fill="#fff8e1" />
          <circle cx="19" cy="19" r="1.3" fill="#e0a800" />
          <circle cx="26" cy="17.5" r="1.3" fill="#e0a800" />
          <circle cx="30" cy="20" r="1.1" fill="#6ab04c" />
          <path d="M9 22h30a15 12 0 0 1-30 0z" fill="#8d5524" />
          <path d="M11 24h26" stroke="#c68642" strokeWidth="1.6" />
        </g>
      );
    case "trophy":
      return (
        <g>
          <path d="M16 11h16v7a8 8 0 0 1-16 0z" fill="#ffd54a" stroke="#b8860b" strokeWidth="1.4" />
          <path d="M16 13h-4a4 4 0 0 0 4 6M32 13h4a4 4 0 0 1-4 6" stroke="#ffd54a" strokeWidth="2.2" fill="none" />
          <rect x="22" y="25" width="4" height="6" fill="#e0b000" />
          <rect x="17" y="31" width="14" height="5" rx="1.5" fill="#ffd54a" stroke="#b8860b" strokeWidth="1.2" />
        </g>
      );
    case "apple":
      return (
        <g>
          <path d="M24 15c-3-3-11-2-11 7 0 8 5 14 8 14 2 0 2-1 3-1s1 1 3 1c3 0 8-6 8-14 0-9-8-10-11-7z" fill="#e53935" />
          <path d="M24 15c0-3 1-5 3-6" stroke="#5d4037" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M25 12c2-3 6-3 7-2-2 2-5 3-7 2z" fill="#7cb342" />
          <ellipse cx="18" cy="21" rx="1.6" ry="3" fill="#fff" opacity="0.5" />
        </g>
      );
    case "bolt":
      return <path d="M27 8L14 27h9l-3 13 14-20h-9z" fill="#fff59d" stroke="#f9a825" strokeWidth="1.4" strokeLinejoin="round" />;
    case "yoga":
      return (
        <g stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx="24" cy="11" r="3" fill="#fff" stroke="none" />
          <path d="M24 16v10" />
          <path d="M13 17l11 3 11-3" />
          <path d="M14 36l10-10 10 10" />
          <path d="M14 36h20" />
        </g>
      );
    case "bike":
      return (
        <g stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="14" cy="30" r="6" />
          <circle cx="34" cy="30" r="6" />
          <path d="M14 30l6-11h9l5 11M20 19l4 11h4l5-11M18 15h5M29 15h3" />
        </g>
      );
  }
}

export function isSquadIcon(k: string | null | undefined): k is SquadIconKey {
  return !!k && (SQUAD_ICON_KEYS as readonly string[]).includes(k);
}

/** The preset disc for `k` at `size` px. */
export function SquadIconArt({ k, size = 48 }: { k: SquadIconKey; size?: number }) {
  const [a, b] = BG[k];
  const id = `sq-${k}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="block shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${id})`} />
      <Art k={k} />
    </svg>
  );
}

/** A squad's picture: preset icon, else its cover / uploaded photo, else a people glyph. */
export function SquadIcon({ icon, cover, size = 48, rounded = "full" }: { icon?: string | null; cover?: string | null; size?: number; rounded?: "full" | "2xl" }) {
  const [broken, setBroken] = useState(false);
  if (isSquadIcon(icon)) return <SquadIconArt k={icon} size={size} />;
  const radius = rounded === "full" ? 999 : Math.round(size * 0.28);
  if (cover && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external / Storage URL
      <img src={cover} alt="" width={size} height={size} onError={() => setBroken(true)} referrerPolicy="no-referrer" loading="lazy" className="block shrink-0 object-cover" style={{ width: size, height: size, borderRadius: radius, background: "var(--card2)" }} />
    );
  }
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: radius, background: "var(--card2)", color: "var(--muted)" }} aria-hidden="true">
      <People size={Math.round(size * 0.45)} />
    </span>
  );
}
