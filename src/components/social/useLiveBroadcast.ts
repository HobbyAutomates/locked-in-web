"use client";

import { useEffect } from "react";
import { liveBeat, liveEnd } from "@/lib/social/actions";
import { LIVE_HEARTBEAT_MS, LIVE_PREF_KEY } from "@/lib/social/live";

/**
 * v2.18 D7: while a live workout runs and the person opted in (Social → "Show squads when I'm
 * training", OFF by default), keep their live_sessions row fresh so squadmates see "… is training
 * now 🔥". Ends the row when the workout finishes or the page closes. The server also checks
 * profiles.live_share, so a stale device flag can't show anyone.
 */
export function useLiveBroadcast(active: boolean, label: string, startedAt: number | null) {
  useEffect(() => {
    let opted = false;
    try {
      opted = localStorage.getItem(LIVE_PREF_KEY) === "1";
    } catch {
      opted = false;
    }
    if (!active || !opted) return;
    const started = startedAt ? new Date(startedAt).toISOString() : null;
    const beat = () => void liveBeat(label, started).catch(() => undefined);
    beat();
    const t = setInterval(beat, LIVE_HEARTBEAT_MS);
    const bye = () => void liveEnd().catch(() => undefined);
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, [active, label, startedAt]);
}
