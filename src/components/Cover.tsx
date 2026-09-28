"use client";

import { useId, useMemo } from "react";
import { COVER_ART } from "@/lib/coverArt";
import { coverPreset } from "@/lib/covers";
import { md } from "./motion";

/**
 * v2.16 profile cover. #01 (the default) is the v2.12 plates cover exactly as it was; the other 33
 * are the CoverPresets board's vector art (lib/coverArt.ts), each with its own gradient ids.
 */
export function Cover({ id, animate = true, align = "bottom" }: { id: string | null | undefined; animate?: boolean; align?: "bottom" | "middle" }) {
  const preset = coverPreset(id);
  if (preset.n === 1) return <PlatesCover animate={animate} />;
  return <ArtCover index={preset.n - 1} align={align} />;
}

function ArtCover({ index, align }: { index: number; align: "bottom" | "middle" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const html = useMemo(() => (COVER_ART[index] ?? "").replaceAll("__U", uid), [index, uid]);
  return <svg viewBox="0 0 390 250" preserveAspectRatio={align === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true" className="block h-full w-full" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Monochrome sculptural cover: three weight plates and a bar, light on dark (or dark on light). */
export function PlatesCover({ animate = true }: { animate?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const plate = (cx: number, cy: number, r: number, d: number) => (
    <g className={animate ? "m-fade" : undefined} style={animate ? md(d) : undefined}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#pl${uid})`} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth={r * 0.06} />
      <circle cx={cx} cy={cy} r={r * 0.16} fill={`url(#hub${uid})`} />
      <path d={`M${cx - r * 0.7},${cy - r * 0.5} A${r * 0.86},${r * 0.86} 0 0 1 ${cx + r * 0.2},${cy - r * 0.84}`} fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="block h-full w-full">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--cover-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--cover-b)" }} />
        </linearGradient>
        <radialGradient id={`pl${uid}`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#3a3a3d" />
          <stop offset=".6" stopColor="#151516" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <radialGradient id={`hub${uid}`} cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#f4f4f6" />
          <stop offset="1" stopColor="#77777d" />
        </radialGradient>
      </defs>
      <rect x="-200" y="-200" width="790" height="700" fill={`url(#bg${uid})`} />
      {plate(70, 60, 92, 200)}
      {plate(330, 210, 110, 380)}
      {plate(250, -10, 60, 560)}
      <rect x="120" y="120" width="170" height="16" rx="8" transform="rotate(-32 205 128)" fill={`url(#hub${uid})`} opacity=".85" />
    </svg>
  );
}
