"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ProNote } from "../platform/kit";
import { useRouter } from "next/navigation";
import { deleteFast, endFast, setFastingHours, startFast } from "@/lib/nutrition-actions";
import { PROTOCOLS, STAGES, clampHours, clock, durationText, hoursBetween, stageAt, type FastingAccess } from "@/lib/fasting";
import type { FastSession } from "@/lib/nutritionTypes";
import type { EdFlag } from "@/lib/goals";
import SubPage from "../SubPage";
import { SafetyNote } from "../Science";
import { LineIcon } from "../lineIcons";
import { MRise, STAGGER } from "../motion";
import { ErrorNote } from "../ui";
import { AccentButton, ComingSoon, GhostButton, PCard, Pill } from "./kit";

/** A ticking "now" (1 s) while `on`. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

const noop = () => () => undefined;
const notifiedKey = (id: string) => `lockedin-fast-done:${id}`;

/** One "goal reached" notification per fast, when the page is open and notifications are allowed. */
function useGoalNotice(active: FastSession | null, reached: boolean) {
  useEffect(() => {
    if (!active || !reached) return;
    try {
      if (window.localStorage.getItem(notifiedKey(active.id))) return;
      window.localStorage.setItem(notifiedKey(active.id), "1");
      if ("Notification" in window && Notification.permission === "granted") new Notification("Fasting goal reached", { body: `${durationText(active.target_hours)} done. Nice work. Break your fast whenever you're ready.`, tag: `fast-${active.id}` });
    } catch {
      // Notifications are a bonus; the page already shows it.
    }
  }, [active, reached]);
}

/**
 * v2.13 fasting timer (spec §7): protocols 12:12 → 20:4 or custom 1–72 h, a ring that counts up
 * to the target through fed → fat-burning (12 h+) → ketosis (18 h+), start / end, the last 14
 * fasts, and a notification at the target. Not available under 18 or with a safety flag.
 */
export default function FastingScreen({ access, flags, available, active, history, defaultHours }: { access: FastingAccess; flags: EdFlag[]; available: boolean; active: FastSession | null; history: FastSession[]; defaultHours: number }) {
  const router = useRouter();
  const [hours, setHours] = useState(clampHours(defaultHours));
  const [custom, setCustom] = useState(!PROTOCOLS.some((p) => p.fastHours === clampHours(defaultHours)));
  const [earlier, setEarlier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permNow = useSyncExternalStore(noop, () => ("Notification" in window ? Notification.permission : "unsupported"), () => "unsupported");
  const [asked, setAsked] = useState<string | null>(null);
  const perm = asked ?? permNow;
  const now = useNow(!!active);
  // The server render (and hydration) shows 0; the real time takes over once mounted.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const elapsedMs = active && mounted ? Math.max(0, now - Date.parse(active.started_at)) : 0;
  const elapsedH = elapsedMs / 3_600_000;
  const target = active?.target_hours ?? hours;
  const reached = !!active && elapsedH >= target;
  const stage = stageAt(elapsedH);
  useGoalNotice(active, reached);

  if (!access.ok) {
    return (
      <SubPage title="Fasting" back="/profile/goals">
      <ProNote className="mb-3" />
        <MRise>
          <PCard label="Fasting">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]" style={{ background: "var(--card2)" }}>
                <LineIcon name="shield" size={20} />
              </span>
              <div>
                <p className="text-[16px] font-semibold">{access.title}</p>
                <p className="mt-1 text-[13px] leading-[19px] muted">{access.body}</p>
              </div>
            </div>
          </PCard>
        </MRise>
        {access.reason === "safety" ? <SafetyNote flags={flags} /> : null}
      </SubPage>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    const started = earlier ? new Date(earlier).toISOString() : undefined;
    const r = await startFast(hours, started);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    void setFastingHours(hours);
    setEarlier("");
    router.refresh();
  }
  async function stop() {
    if (!active) return;
    setBusy(true);
    setError(null);
    const r = await endFast(active.id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }
  async function remove(id: string) {
    const r = await deleteFast(id);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }
  async function askNotify() {
    try {
      setAsked(await Notification.requestPermission());
    } catch {
      setAsked("denied");
    }
  }

  return (
    <SubPage title="Fasting" back="/profile/goals">
      <ProNote className="mb-3" />
      {!available ? (
        <MRise>
          <ComingSoon what="Fasting timer" />
        </MRise>
      ) : null}

      <MRise delay={0}>
        <PCard label="Timer">
          <div className="flex flex-col items-center gap-2 pt-1">
            <FastRing elapsedH={active ? elapsedH : 0} target={target} />
            <div className="-mt-[172px] flex h-[172px] flex-col items-center justify-center text-center">
              <span className="text-[12px] font-semibold uppercase muted" style={{ letterSpacing: ".08em" }}>
                {active ? (reached ? "Goal reached" : "Fasting") : "Ready"}
              </span>
              <span className="num text-[34px] font-semibold leading-none" style={{ letterSpacing: "-0.03em" }} suppressHydrationWarning>
                {active ? clock(elapsedMs) : `${durationText(hours)}`}
              </span>
              <span className="mt-1 text-[13px] muted">{active ? `of ${durationText(target)}` : "fast"}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {STAGES.map((s) => {
              const on = active && s.key === stage.key;
              return (
                <div key={s.key} className="rounded-2xl px-2.5 py-2 text-center" style={{ background: on ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--card2)", color: on ? "var(--accent)" : "var(--ink)" }}>
                  <p className="text-[13px] font-semibold">{s.label}</p>
                  <p className="num text-[11px] muted">{s.from ? `${s.from} h+` : "0–12 h"}</p>
                </div>
              );
            })}
          </div>
          <p className="text-[13px] leading-[18px] muted">{active ? stage.note : "Stages are rough guides that vary between people, not medical claims."}</p>

          {active ? (
            <>
              <p className="num text-[13px]">
                Started {new Date(active.started_at).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })} · ends around{" "}
                {new Date(Date.parse(active.started_at) + active.target_hours * 3_600_000).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}
              </p>
              <ErrorNote text={error} />
              <AccentButton onClick={() => void stop()} disabled={busy}>
                {busy ? "Ending…" : reached ? "End fast" : "End fast early"}
              </AccentButton>
              {perm === "default" ? (
                <button type="button" className="press self-center text-[13px] font-semibold underline" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => void askNotify()}>
                  Notify me when I reach {durationText(active.target_hours)}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Protocol">
                {PROTOCOLS.map((p) => (
                  <button key={p.key} type="button" role="radio" aria-checked={!custom && hours === p.fastHours} className="chip press num" style={{ height: 36 }} onClick={() => { setCustom(false); setHours(p.fastHours); }}>
                    {p.label}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={custom} className="chip press" style={{ height: 36 }} onClick={() => setCustom(true)}>
                  Custom
                </button>
              </div>
              {custom ? (
                <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={{ minHeight: 48, background: "var(--card2)" }}>
                  <span className="text-[14px] font-semibold">Hours (1–72)</span>
                  <input className="num w-20 bg-transparent text-right text-[15px] font-semibold" style={{ border: 0, color: "var(--ink)" }} inputMode="decimal" aria-label="Fast length in hours" value={hours} onChange={(e) => setHours(clampHours(Number(e.target.value.replace(/[^\d.]/g, "")) || 1))} />
                </label>
              ) : null}
              <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={{ minHeight: 48, background: "var(--card2)" }}>
                <span className="text-[14px] font-semibold">Started earlier?</span>
                <input type="datetime-local" className="num bg-transparent text-right text-[13px] font-semibold" style={{ border: 0, color: "var(--ink)", minHeight: 44 }} aria-label="When the fast started" value={earlier} max={localNow()} onChange={(e) => setEarlier(e.target.value)} />
              </label>
              <ErrorNote text={error} />
              <AccentButton onClick={() => void start()} disabled={busy || !available}>
                {busy ? "Starting…" : `Start ${durationText(hours)} fast`}
              </AccentButton>
            </>
          )}
        </PCard>
      </MRise>

      <MRise delay={STAGGER}>
        <History items={history} onDelete={(id) => void remove(id)} />
      </MRise>
      <p className="px-1 text-[11px] leading-4 muted">Fasting isn&apos;t for everyone. Skip it if you&apos;re pregnant, have diabetes, or have a history of eating disorders, and talk to a doctor if you&apos;re unsure.</p>
    </SubPage>
  );
}

/** "2026-09-26T14:05" for the datetime-local max. */
function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The big ring: progress to the target, with ticks where the 12 h and 18 h stages begin. */
export function FastRing({ elapsedH, target, size = 172 }: { elapsedH: number; target: number; size?: number }) {
  const stroke = size > 100 ? 12 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, elapsedH / Math.max(1, target)));
  const ticks = STAGES.filter((s) => s.from > 0 && s.from < target).map((s) => s.from / target);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: "rotate(-90deg)", flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.16,1,.3,1)" }} />
      {size > 100
        ? ticks.map((t) => {
            const a = t * 2 * Math.PI;
            const x = size / 2 + r * Math.cos(a);
            const y = size / 2 + r * Math.sin(a);
            return <circle key={t} cx={x} cy={y} r={3} fill="var(--card)" stroke="var(--muted)" strokeWidth={1.5} />;
          })
        : null}
    </svg>
  );
}

function History({ items, onDelete }: { items: FastSession[]; onDelete: (id: string) => void }) {
  const rows = useMemo(() => items.slice(0, 14), [items]);
  return (
    <PCard label="Last 14 fasts">
      <p className="text-[15px] font-semibold">Last 14 fasts</p>
      {rows.length === 0 ? <p className="text-[13px] muted">Finished fasts show up here.</p> : null}
      <div className="flex flex-col">
        {rows.map((s, i) => {
          const h = hoursBetween(Date.parse(s.started_at), Date.parse(s.ended_at ?? s.started_at));
          const hit = h >= s.target_hours;
          return (
            <div key={s.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="num text-[14px] font-semibold">{durationText(h)}</span>
                <span className="text-[12px] muted">{new Date(s.started_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · goal {durationText(s.target_hours)}</span>
              </span>
              {hit ? <Pill tone="good">Goal hit</Pill> : <Pill tone="flat">{Math.round((h / s.target_hours) * 100)}%</Pill>}
              <GhostButton className="!h-8 !px-2.5 !text-[12px]" onClick={() => onDelete(s.id)}>
                <LineIcon name="plus" size={14} style={{ transform: "rotate(45deg)" }} />
                <span className="sr-only">Delete this fast</span>
              </GhostButton>
            </div>
          );
        })}
      </div>
    </PCard>
  );
}
