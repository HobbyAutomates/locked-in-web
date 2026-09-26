import { useId } from "react";
import type { CoachStyle } from "@/lib/onboardingV2";

/**
 * Brand v1 coach voices (custom marks, not stock icons):
 * Calm = Tide (a horizon with swells and a low sun, iris gradient), Balanced = Axis (a gyroscope
 * with two orbits), No excuses = Edge (a blade chevron over a hard line, ember gradient).
 */
export function CoachMark({ style, size = 40 }: { style: CoachStyle; size?: number }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = `cm${raw}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ flex: "none" }}>
      <defs>
        <linearGradient id={`${g}i`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B9AEFF" />
          <stop offset="1" stopColor="#6B5CE6" />
        </linearGradient>
        <linearGradient id={`${g}e`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8B5E" />
          <stop offset="1" stopColor="#FF5B1F" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" style={{ fill: "var(--surf2)" }} />
      {style === "calm" ? (
        <g fill="none" strokeLinecap="round">
          <path d="M11 22a9 9 0 0 1 18 0z" fill={`url(#${g}i)`} />
          <path d="M7 22h26" stroke={`url(#${g}i)`} strokeWidth="1.6" />
          <path d="M9 26.5c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 3 1 4 .6" stroke={`url(#${g}i)`} strokeWidth="1.5" />
          <path d="M12 30.5c1.7-1.1 3.3-1.1 5 0s3.3 1.1 5 0 3.3-1.1 5 0" stroke={`url(#${g}i)`} strokeWidth="1.4" opacity=".6" />
        </g>
      ) : style === "balanced" ? (
        <g fill="none" strokeWidth="1.5" style={{ stroke: "var(--ink)" }}>
          <ellipse cx="20" cy="20" rx="12" ry="5" transform="rotate(-28 20 20)" />
          <ellipse cx="20" cy="20" rx="12" ry="5" transform="rotate(28 20 20)" />
          <circle cx="20" cy="20" r="2.6" style={{ fill: "var(--ink)", stroke: "none" }} />
          <path d="M20 6.5v4M20 29.5v4" strokeLinecap="round" />
        </g>
      ) : (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 22 20 10l9 12-9-4.2z" fill={`url(#${g}e)`} />
          <path d="M9 28h22" stroke={`url(#${g}e)`} strokeWidth="2.4" />
        </g>
      )}
    </svg>
  );
}
