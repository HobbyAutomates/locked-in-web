"use client";

import { useEffect, useMemo, useState } from "react";
import { nextMilestone, type MilestoneInput } from "@/lib/milestones";
import { markMilestonesSeen } from "@/lib/v214Actions";
import { shareCard } from "@/lib/shareCard";
import { md } from "@/components/motion";

/**
 * v2.14 milestone flood: a full-screen ember takeover for a 7 / 30 / 100-day streak, the goal
 * weight, or a fresh PR. Big Bricolage number, one Fraunces line, Share and Done. Once per
 * milestone: seen keys live in localStorage and in profiles.milestones_seen (schema_v37).
 */
const KEY = "li_milestones_seen";

function localSeen(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function remember(keys: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...new Set([...localSeen(), ...keys])].slice(-200)));
  } catch {
    // Storage blocked: the server copy (v37) still stops a repeat.
  }
}

export default function MilestoneFlood({ input, serverSeen }: { input: MilestoneInput; serverSeen: string[] | null }) {
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage once after mount (no SSR flash)
    setReady(true);
  }, []);
  const pick = useMemo(() => (ready ? nextMilestone(input, [...localSeen(), ...(serverSeen ?? [])]) : null), [ready, input, serverSeen]);

  useEffect(() => {
    if (!pick) return;
    const keys = [...pick.silent, ...(pick.show ? [pick.show.key] : [])];
    if (!keys.length) return;
    // Seen as soon as it shows: a refresh never floods twice.
    remember(keys);
    void markMilestonesSeen(keys).catch(() => undefined);
  }, [pick]);

  useEffect(() => {
    if (!pick?.show || closed) return;
    try {
      navigator.vibrate?.([40, 60, 80]);
    } catch {
      // no vibration API
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClosed(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick, closed]);

  const m = pick?.show;
  if (!m || closed) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${m.eyebrow}: ${m.big} ${m.line}`} className="m-fade fixed inset-0 z-[100] flex flex-col" style={{ background: "#FF5B1F", color: "#0B0B0C", animationDuration: "500ms" }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 60% at 50% 40%, rgba(255,139,94,.9), transparent 70%)" }} />
      <div className="relative mx-auto flex w-full max-w-[480px] flex-1 flex-col" style={{ padding: "calc(40px + env(safe-area-inset-top, 0px)) 26px calc(28px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="display" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.04em" }}>
          locked in
        </div>
        <div className="mt-auto">
          <div className="m-rise mono" style={md(200, { fontSize: 13 })}>
            {m.eyebrow}
          </div>
          <div className="m-pop display num" style={md(350, { fontSize: m.big.length > 3 ? 120 : 168, fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.05em", marginTop: 10, transformOrigin: "left bottom" })}>
            {m.big}
          </div>
          <div className="m-rise serif" style={md(700, { fontSize: 38, lineHeight: 1.1, color: "#F4F1EA", marginTop: 8 })}>
            {m.line}
          </div>
          <p className="m-rise" style={md(900, { fontSize: 15.5, marginTop: 14, color: "rgba(11,11,12,.72)" })}>
            {m.sub} The whole screen goes ember. Only today.
          </p>
        </div>
        <div className="m-rise mt-10 flex flex-col gap-3" style={md(1100)}>
          <button
            type="button"
            className="press h-14 w-full rounded-full text-[17px] font-bold"
            style={{ background: "#0B0B0C", color: "#F4F1EA", border: 0 }}
            disabled={sharing}
            onClick={async () => {
              setSharing(true);
              await shareCard({ kind: "milestone", eyebrow: m.eyebrow, big: m.big, line: m.line }, `locked-in-${m.share}.png`).catch(() => null);
              setSharing(false);
            }}
          >
            {sharing ? "Making your card…" : "Share"}
          </button>
          <button type="button" className="press h-12 w-full rounded-full text-[16px] font-semibold" style={{ background: "transparent", color: "#0B0B0C", border: "1.5px solid rgba(11,11,12,.35)" }} onClick={() => setClosed(true)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
