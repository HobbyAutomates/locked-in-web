"use client";

import { useState } from "react";
import { Toggle } from "../ui";
import { setLiveShare } from "@/lib/social/actions";
import { LIVE_PREF_KEY } from "@/lib/social/live";

/** v2.18 D7: the opt-in (OFF by default) for "Ayan is training now 🔥" in your squads. */
export default function LiveShareToggle({ available, on: on0 }: { available: boolean; on: boolean }) {
  const [on, setOn] = useState(on0);
  const [error, setError] = useState<string | null>(null);
  async function flip(v: boolean) {
    setOn(v);
    setError(null);
    try {
      localStorage.setItem(LIVE_PREF_KEY, v ? "1" : "0");
    } catch {
      // Device copy only.
    }
    const r = await setLiveShare(v);
    if (!r.ok) {
      setOn(!v);
      setError(r.error);
    }
  }
  return (
    <section aria-label="Live squad sessions" className="flex items-center gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: "14px 16px", boxShadow: "var(--pcard-ring)" }}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15.5px] font-semibold">Show squads when I&rsquo;m training</span>
        <span className="text-[12.5px] leading-4 muted">{available ? (error ?? "Off by default. During a live workout your squads see you're training and can cheer.") : "Coming with the next update"}</span>
      </span>
      <Toggle on={on} onChange={(v) => void flip(v)} label="Show squads when I'm training" disabled={!available} />
    </section>
  );
}
