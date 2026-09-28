"use client";

import { useId } from "react";
import { CATEGORY_SHAPE, GEM, METAL, type JewelCategory, type JewelShape, type JewelTier } from "@/lib/jewels";
import { md } from "./motion";

/**
 * v2.16 jewellery badge (board RefJewellery; mini version from SquadLeaderboard): a bevelled metal
 * frame (shape by category, metal by tier), a darker grainy face, and a glowing faceted gem (colour
 * by category). Locked: a dark frame, an unlit gem and a thin ember progress line round the frame.
 * All vector, 100 x 100 units; Android draws the same geometry in Compose Canvas.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

function polygon(n: number, r: number, rot: number): string {
  return (
    Array.from({ length: n }, (_, i) => {
      const a = ((rot + (360 / n) * i) * Math.PI) / 180;
      return `${i ? "L" : "M"}${r2(50 + r * Math.cos(a))} ${r2(50 + r * Math.sin(a))}`;
    }).join(" ") + " Z"
  );
}

export const SHAPE_PATH: Record<JewelShape, string> = {
  shield: "M50 4 L90 16 L90 50 C90 76 70 90 50 98 C30 90 10 76 10 50 L10 16 Z",
  hexagon: polygon(6, 48, -90),
  diamond: "M50 2 L98 50 L50 98 L2 50 Z",
  round: "M50 4 A46 46 0 1 1 49.9 4 Z",
  octagon: polygon(8, 48, -112.5),
};

/** Gem geometry: a six-facet brilliant seen from above, centred slightly high on shields. */
function gemFacets(cx: number, cy: number, r: number): { d: string; k: number }[] {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))] as const;
  });
  // Facet shade index per wedge: top-right lightest, bottom-left deepest.
  const shade = [0, 1, 2, 3, 2, 1];
  return pts.map((p, i) => {
    const q = pts[(i + 1) % 6];
    return { d: `M${cx} ${cy} L${p[0]} ${p[1]} L${q[0]} ${q[1]} Z`, k: shade[i] };
  });
}

function tableHex(cx: number, cy: number, r: number): string {
  return (
    Array.from({ length: 6 }, (_, i) => {
      const a = ((-90 + 60 * i) * Math.PI) / 180;
      return `${i ? "L" : "M"}${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`;
    }).join(" ") + " Z"
  );
}

const LOCKED_METAL: [string, string, string] = ["#4a4a4f", "#26262a", "#111113"];
const LOCKED_GEM: [string, string, string] = ["#5a5a60", "#34343a", "#1a1a1d"];

export function Jewel({
  category,
  tier,
  size = 72,
  locked = false,
  progress = 0,
  delay = null,
  label,
}: {
  category: JewelCategory;
  tier: JewelTier;
  size?: number;
  locked?: boolean;
  /** 0..1, drawn as the ember line round a locked frame. */
  progress?: number;
  /** Pop-in delay in ms; null = no entrance. */
  delay?: number | null;
  /** Accessible name; omitted = decorative. */
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shape = CATEGORY_SHAPE[category];
  const frame = SHAPE_PATH[shape];
  const [mHi, mMid, mLo] = locked ? LOCKED_METAL : METAL[tier];
  const [gHi, gMid, gLo] = locked ? LOCKED_GEM : GEM[category];
  const cy = shape === "shield" ? 47 : 50;
  const gr = shape === "diamond" ? 18 : 21;
  const facets = gemFacets(50, cy, gr);
  const facetFill = [gHi, gMid, gLo, gLo];
  const f = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const small = size < 44;
  const ids = { metal: `jm${uid}`, face: `jf${uid}`, gem: `jg${uid}`, glow: `jl${uid}`, grain: `jn${uid}` };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={delay != null ? "m-pop" : undefined}
      style={md(delay ?? 0, { flex: "none", overflow: "visible", filter: small ? undefined : `drop-shadow(0 ${size > 120 ? 18 : 6}px ${size > 120 ? 24 : 10}px var(--medal-drop))` })}
    >
      <defs>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mHi} />
          <stop offset=".45" stopColor={mMid} />
          <stop offset="1" stopColor={mLo} />
        </linearGradient>
        <radialGradient id={ids.face} cx=".5" cy=".42" r=".7">
          <stop offset="0" stopColor={mMid} stopOpacity={locked ? 0.5 : 0.85} />
          <stop offset=".55" stopColor={mLo} />
          <stop offset="1" stopColor="#0c0c0d" />
        </radialGradient>
        <radialGradient id={ids.gem} cx=".4" cy=".35" r=".75">
          <stop offset="0" stopColor={gHi} />
          <stop offset=".55" stopColor={gMid} />
          <stop offset="1" stopColor={gLo} />
        </radialGradient>
        <radialGradient id={ids.glow} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={gHi} stopOpacity=".9" />
          <stop offset=".5" stopColor={gMid} stopOpacity=".35" />
          <stop offset="1" stopColor={gMid} stopOpacity="0" />
        </radialGradient>
        {small ? null : (
          <filter id={ids.grain}>
            <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .1 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        )}
      </defs>
      {/* frame + bevel */}
      <path d={frame} fill={`url(#${ids.metal})`} />
      <path d={frame} fill="none" stroke={locked ? "rgba(255,255,255,.12)" : mHi} strokeOpacity=".7" strokeWidth="1.5" />
      {/* face */}
      <g transform="translate(50 50) scale(.8) translate(-50 -50)">
        <path d={frame} fill={`url(#${ids.face})`} />
        {small ? null : <path d={frame} fill="#fff" filter={`url(#${ids.grain})`} />}
        <path d={frame} fill="none" stroke={mHi} strokeOpacity={locked ? 0.15 : 0.5} strokeWidth="1.2" />
      </g>
      {/* gem */}
      {locked ? null : <circle cx="50" cy={cy} r="36" fill={`url(#${ids.glow})`} />}
      {facets.map((x, i) => (
        <path key={i} d={x.d} fill={facetFill[x.k]} />
      ))}
      <path d={facets.map((x) => x.d).join(" ")} fill="none" stroke={locked ? "rgba(255,255,255,.08)" : gLo} strokeOpacity=".55" strokeWidth=".8" strokeLinejoin="round" />
      {/* the table: a small flat hexagon on top of the facets */}
      <path d={tableHex(50, cy, gr * 0.42)} fill={`url(#${ids.gem})`} opacity={locked ? 0.5 : 0.9} stroke={locked ? "none" : gHi} strokeOpacity=".6" strokeWidth=".6" />
      {locked ? null : <path d={`M${50 - gr * 0.55} ${cy - gr * 0.55} L${50 - gr * 0.1} ${cy - gr * 0.8}`} stroke="#fff" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" />}
      {/* locked: how far along, as an ember line round the frame */}
      {locked ? (
        <>
          <path d={frame} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.5" />
          {f > 0.005 ? <path d={frame} fill="none" stroke="var(--ember)" strokeWidth="2.5" strokeLinecap="round" pathLength={1} strokeDasharray={`${r2(f)} 2`} /> : null}
        </>
      ) : null}
    </svg>
  );
}
