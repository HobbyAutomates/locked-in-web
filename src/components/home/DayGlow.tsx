"use client";

import { useEffect, useState } from "react";

/**
 * v2.14 "The day warms up" (canvas "Ember is earned", idea 04): Home starts monochrome and a soft
 * ember glow grows behind the top of the screen as today's targets are hit (calories, protein,
 * a workout, the log streak), up to ~18 % opacity. Subtle, capped, and off with reduced motion or
 * a low battery (power saving).
 */
export const GLOW_MAX = 0.18;

/** 0..1 warmth from four equal parts. Pure (Android's port uses the same weights). */
export function warmth(i: { calories: number; calorieTarget: number; protein: number; proteinTarget: number; trainedToday: boolean; loggedToday: boolean }): number {
  const kcal = i.calorieTarget > 0 ? i.calories / i.calorieTarget : 0;
  // Calories count once you're in the 85–110 % band (over the top doesn't earn more glow).
  const calPart = kcal >= 0.85 && kcal <= 1.1 ? 1 : kcal > 1.1 ? 0.5 : Math.max(0, kcal / 0.85) * 0.6;
  const proPart = i.proteinTarget > 0 ? Math.min(1, i.protein / i.proteinTarget) : 0;
  return (calPart + proPart + (i.trainedToday ? 1 : 0) + (i.loggedToday ? 1 : 0)) / 4;
}

export default function DayGlow({ level }: { level: number }) {
  const [off, setOff] = useState(true);
  useEffect(() => {
    let live = true;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = async () => {
      let lowPower = false;
      try {
        const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
        const b = await nav.getBattery?.();
        lowPower = !!b && !b.charging && b.level <= 0.2;
      } catch {
        lowPower = false;
      }
      if (live) setOff(mq.matches || lowPower);
    };
    void decide();
    mq.addEventListener("change", decide);
    return () => {
      live = false;
      mq.removeEventListener("change", decide);
    };
  }, []);
  const a = Math.max(0, Math.min(1, level)) * GLOW_MAX;
  if (off || a < 0.01) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 mx-auto max-w-[520px]"
      style={{
        height: 520,
        background: `radial-gradient(70% 60% at 50% 18%, rgba(255, 91, 31, ${a.toFixed(3)}), transparent 72%)`,
        transition: "background 1.2s ease",
      }}
    />
  );
}
