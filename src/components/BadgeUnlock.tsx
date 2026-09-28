"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BadgeProgress } from "@/lib/badges";
import { SEEN_BADGES_KEY, jewelItems, newlyEarned, unlockCaption, unlockLine, type JewelItem } from "@/lib/jewels";
import { Jewel } from "./Jewel";

function readSeen(): string[] | null {
  try {
    const raw = window.localStorage.getItem(SEEN_BADGES_KEY);
    if (raw == null) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify(ids));
  } catch {
    // Private mode: the moment may play again next visit; harmless.
  }
}

/**
 * v2.16 unlock moment (board RefJewellery): when a badge is newly earned, a full-screen dark
 * vignette with "Here's some jewellery." (or another line), the big jewel popping in with a glow, a
 * one-line caption and a close button. Plays once per badge per device. The first time this runs on
 * a device it just records what's already earned, so nobody gets a flood of old badges.
 */
export default function BadgeUnlock({ progress }: { progress: BadgeProgress }) {
  const [queue, setQueue] = useState<JewelItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage once after mount (no SSR flash)
    setMounted(true);
    const seen = readSeen();
    const all = jewelItems(progress)
      .filter((x) => x.got)
      .map((x) => x.id);
    const fresh = newlyEarned(progress, seen);
    writeSeen([...new Set([...(seen ?? []), ...all])]);
    if (fresh.length) setQueue(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.streakDays, progress.meals, progress.goalDays]);

  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setQueue((q) => q.slice(1));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur]);

  if (!mounted || !cur) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${unlockLine(cur.id)} ${cur.badge.name}`}
      className="m-fade fixed inset-0 z-[80] flex flex-col"
      style={{ background: "radial-gradient(90% 60% at 50% 38%, #3a3d42, #1c1d20 55%, #0e0e10)", color: "#fff", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-7">
        <div className="flex justify-end pt-4">
          <button
            type="button"
            aria-label="Close"
            className="press grid h-11 w-11 place-items-center rounded-full"
            style={{ background: "none", border: 0, boxShadow: "inset 0 0 0 2.5px rgba(255,255,255,.55)", color: "rgba(255,255,255,.75)" }}
            onClick={() => setQueue((q) => q.slice(1))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <h2 className="m-rise mt-6 text-[34px] font-extrabold leading-[1.1]" style={{ letterSpacing: "-0.5px" }}>
          {unlockLine(cur.id)}
        </h2>
        <div className="relative grid flex-1 place-items-center">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,.14), transparent 65%)" }} />
          <Jewel key={cur.id} category={cur.category} tier={cur.tier} size={260} delay={200} label={`${cur.badge.name}, ${cur.tier} badge`} />
        </div>
        <p className="m-fade pb-[max(56px,env(safe-area-inset-bottom,0px))] text-center text-[19px] leading-[1.45]" style={{ color: "#b9bcc2", animationDelay: "700ms" }}>
          {unlockCaption(cur)}
        </p>
      </div>
    </div>,
    document.body,
  );
}
