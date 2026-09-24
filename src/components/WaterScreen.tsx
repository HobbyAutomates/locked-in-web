"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { logWater, saveProfile, undoLastWater } from "@/lib/actions";
import { formatTime } from "@/lib/display";
import { shortDate } from "@/lib/dates";
import type { WaterEntry, WaterVessel } from "@/lib/types";
import { hasServiceWorker, notificationsSupported, scheduleWaterReminders, WATER_FREQUENCIES } from "@/lib/waterReminders";
import { ConfettiBurst } from "./Confetti";
import { Check, Minus, Plus, Spinner } from "./icons";
import { litres, WaterBottle } from "./WaterBottle";
import { Card, ErrorNote, Rise } from "./ui";

const GLASS_SIZES = [150, 200, 250, 300, 350, 400, 500];

let tempSeq = 0;
/** Placeholder id / timestamp for an optimistic row (replaced by the saved one). */
const tempId = () => `temp-${++tempSeq}`;
const nowIso = () => new Date().toISOString();

type Vessel = { key: WaterVessel; ml: number | null; label: string; Art: (p: { size?: number }) => React.ReactNode };

const VESSELS: Vessel[] = [
  { key: "glass", ml: 250, label: "Glass", Art: GlassArt },
  { key: "bottle", ml: 500, label: "Bottle", Art: BottleArt },
  { key: "large", ml: 1000, label: "Large bottle", Art: LargeBottleArt },
  { key: "custom", ml: null, label: "Custom", Art: CustomArt },
];

type Props = {
  date: string;
  isToday: boolean;
  entries: WaterEntry[];
  goalMl: number;
  glassMl: number;
  reminder: { from: string; to: string; every: number };
};

/**
 * v2.6 Water page — Fittr's "Your daily water intake" blended with the vessel sheet: the goal as
 * glasses (editable), a bottle that fills with + / − beside it, one-tap vessels with a + under
 * each (and a custom amount), confetti when the goal is hit, and the reminder window + interval.
 * Every add is one water_log row; − removes the latest (an undo).
 */
export default function WaterScreen({ date, isToday, entries: initial, goalMl: initialGoal, glassMl: initialGlass, reminder }: Props) {
  const [entries, setEntries] = useState<WaterEntry[]>(initial);
  const [goalMl, setGoalMl] = useState(initialGoal);
  const [glassMl, setGlassMl] = useState(initialGlass);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const total = entries.reduce((a, e) => a + e.ml, 0);
  const goal = Math.max(glassMl, goalMl || 2500);
  const done = total >= goal;
  const glasses = Math.max(1, Math.round(goal / glassMl));
  const last = entries[0];

  async function add(ml: number, vessel: WaterVessel) {
    if (!(ml > 0) || ml > 5000) return setError("Enter between 1 and 5000 mL");
    setError(null);
    setBusy(vessel);
    const temp: WaterEntry = { id: tempId(), date, ml, created_at: nowIso(), vessel };
    const before = total;
    setEntries((list) => [temp, ...list]);
    try {
      const row = await logWater(ml, date, vessel);
      setEntries((list) => list.map((e) => (e.id === temp.id ? row : e)));
      if (before < goal && before + ml >= goal) celebrate();
    } catch (e) {
      setEntries((list) => list.filter((x) => x.id !== temp.id));
      setError(e instanceof Error ? e.message : "Could not log that");
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (!entries.length) return;
    setError(null);
    setBusy("minus");
    const [removed, ...rest] = entries;
    setEntries(rest);
    try {
      await undoLastWater(date);
    } catch (e) {
      setEntries((list) => [removed, ...list]);
      setError(e instanceof Error ? e.message : "Could not undo that");
    } finally {
      setBusy(null);
    }
  }

  /** Confetti once per day per device when the goal is crossed. */
  function celebrate() {
    const key = `lockedin-water-goal-${date}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // No storage: celebrate anyway.
    }
    setConfetti((n) => n + 1);
  }

  async function saveGoal(nextGlasses: number, nextGlassMl = glassMl) {
    const g = Math.max(1, Math.min(40, Math.round(nextGlasses)));
    const ml = g * nextGlassMl;
    setGoalMl(ml);
    setGlassMl(nextGlassMl);
    try {
      await saveProfile({ water_goal_ml: ml, water_glass_ml: nextGlassMl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your goal");
    }
  }

  return (
    <>
      <Rise index={0}>
        <Card padding={20}>
          <h2 className="text-[22px] font-extrabold leading-tight" style={{ letterSpacing: "-0.025em" }}>
            Your daily water intake
          </h2>
          <p className="text-[13px] muted">{isToday ? "for today" : `for ${shortDate(date)}`}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <p className="text-[13px] font-bold">Goal</p>
              <GoalField glasses={glasses} onCommit={(g) => void saveGoal(g)} />
              <label className="mt-2 flex items-center gap-1.5 text-[12px] muted">
                1 gl =
                <select
                  className="rounded-lg px-1.5 py-1 text-[12px] font-semibold"
                  style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }}
                  value={glassMl}
                  aria-label="Glass size"
                  onChange={(e) => void saveGoal(glasses, Number(e.target.value))}
                >
                  {(GLASS_SIZES.includes(glassMl) ? GLASS_SIZES : [...GLASS_SIZES, glassMl].sort((a, b) => a - b)).map((s) => (
                    <option key={s} value={s}>
                      {s} mL
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-[12px] muted">= {litres(goal)} a day</p>
              <AnimatePresence>
                {done ? (
                  <motion.div
                    className="mt-4 flex flex-col items-center rounded-2xl px-2 py-3 text-center"
                    style={{ background: "var(--blue-bg)" }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    role="status"
                  >
                    <span className="text-[26px] leading-none" aria-hidden="true">
                      🎉
                    </span>
                    <span className="mt-1 text-[14px] font-extrabold">Congratulations!</span>
                    <span className="text-[11px] leading-tight muted">You are done with your water goal for the day</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="flex flex-col">
              <p className="text-[13px] font-bold">Consumed</p>
              <p className="text-[11px] muted">{last ? `Last logged ${formatTime(last.created_at)}` : "Nothing yet"}</p>
              <div className="mt-2 flex items-center gap-2">
                <WaterBottle fraction={total / goal} label={litres(total)} height={200} />
                <div className="flex flex-col items-center justify-between gap-16 self-stretch py-6">
                  <RoundButton label={`Add a ${glassMl} mL glass`} onClick={() => void add(glassMl, "glass")} busy={busy === "glass"}>
                    <Plus size={18} />
                  </RoundButton>
                  <RoundButton label="Remove the last one" onClick={() => void undo()} busy={busy === "minus"} disabled={!entries.length}>
                    <Minus size={18} />
                  </RoundButton>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Rise>

      {error ? <ErrorNote text={error} /> : null}

      <Rise index={1}>
        <Card padding={18}>
          <p className="text-[15px] font-extrabold">Add water</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {VESSELS.map((v) => (
              <div key={v.key} className="flex flex-col items-center gap-1.5">
                <span className="grid h-16 place-items-center">
                  <v.Art size={v.key === "large" ? 56 : 46} />
                </span>
                <span className="num text-center text-[12px] font-bold leading-tight">{v.ml ? `${v.ml} mL` : "Custom"}</span>
                <span className="text-center text-[11px] leading-tight muted">{v.ml ? v.label : "amount"}</span>
                <button
                  type="button"
                  className="press mt-0.5 grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: "var(--blue-bg)", color: "var(--blue)", border: 0 }}
                  aria-label={v.ml ? `Add ${v.ml} mL ${v.label.toLowerCase()}` : "Add a custom amount"}
                  disabled={busy !== null}
                  onClick={() => (v.ml ? void add(v.ml, v.key) : setCustomOpen((o) => !o))}
                >
                  {busy === v.key ? <Spinner size={14} /> : <Plus size={18} />}
                </button>
              </div>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {customOpen ? (
              <motion.form
                className="mt-3 flex gap-2 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const ml = Number(custom);
                  if (ml > 0) {
                    void add(ml, "custom");
                    setCustom("");
                    setCustomOpen(false);
                  }
                }}
              >
                <div className="relative flex-1">
                  <input className="field num pr-12" inputMode="numeric" placeholder="e.g. 330" autoFocus value={custom} aria-label="Custom amount in mL" onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm muted">mL</span>
                </div>
                <button type="submit" className="pill press !w-auto shrink-0 !px-5" style={{ minHeight: 48 }} disabled={!(Number(custom) > 0)}>
                  Add
                </button>
              </motion.form>
            ) : null}
          </AnimatePresence>
          <div className="mt-4 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "var(--card2)" }}>
            <span className="text-[13px] font-semibold muted">Total</span>
            <span className="num text-[15px] font-extrabold">
              {litres(total)} <span className="font-semibold muted">of {litres(goal)}</span>
            </span>
          </div>
          {entries.length ? (
            <ul className="mt-3 flex flex-col">
              {entries.slice(0, 8).map((e, i) => (
                <li key={e.id} className="flex items-center justify-between py-1.5 text-[13px]" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                  <span className="muted">{formatTime(e.created_at)}</span>
                  <span className="font-semibold">
                    {VESSELS.find((v) => v.key === e.vessel)?.label ?? "Water"} · <span className="num">{e.ml} mL</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </Rise>

      <Rise index={2}>
        <ReminderCard initial={reminder} />
      </Rise>

      {confetti ? <ConfettiBurst key={confetti} /> : null}
    </>
  );
}

function RoundButton({ children, label, onClick, busy, disabled }: { children: React.ReactNode; label: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card2)", color: "var(--ink)", border: "1.5px solid var(--hair)" }} aria-label={label} onClick={onClick} disabled={disabled || busy}>
      {busy ? <Spinner size={14} /> : children}
    </button>
  );
}

/** The big editable glasses number with its "gl" chip (commit on blur / Enter). */
function GoalField({ glasses, onCommit }: { glasses: number; onCommit: (g: number) => void }) {
  const [text, setText] = useState(String(glasses));
  const [prev, setPrev] = useState(glasses);
  if (prev !== glasses) {
    setPrev(glasses);
    setText(String(glasses));
  }
  const commit = () => {
    const n = Number(text);
    if (n > 0 && n !== glasses) onCommit(n);
    else setText(String(glasses));
  };
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        className="num w-[72px] rounded-2xl text-center text-[32px] font-extrabold"
        style={{ background: "var(--card2)", border: 0, color: "var(--ink)", height: 60, letterSpacing: "-0.03em" }}
        inputMode="numeric"
        aria-label="Daily goal in glasses"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <span className="rounded-md px-2 py-0.5 text-[12px] font-bold" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
        gl
      </span>
    </div>
  );
}

/** Water reminder: from–to timings and how often (saved to the profile; in-tab notifications on the web). */
function ReminderCard({ initial }: { initial: { from: string; to: string; every: number } }) {
  const [cfg, setCfg] = useState(initial);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [sw, setSw] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Read browser-only state after mount (keeps the server render identical).
    const t = setTimeout(() => {
      setPerm(notificationsSupported() ? Notification.permission : "unsupported");
      void hasServiceWorker().then(setSw);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function update(next: { from: string; to: string; every: number }) {
    setCfg(next);
    setError(null);
    if (next.every && notificationsSupported() && Notification.permission === "default") {
      try {
        setPerm(await Notification.requestPermission());
      } catch {
        // Permission prompt blocked.
      }
    }
    scheduleWaterReminders(next);
    try {
      await saveProfile({ water_reminder_from: next.from, water_reminder_to: next.to, water_reminder_every_min: next.every });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the reminder");
    }
  }

  return (
    <Card padding={18}>
      <div className="flex items-center justify-between">
        <p className="text-[18px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
          Water reminder
        </p>
        {saved ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--green)" }}>
            <Check size={14} /> Saved
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] font-bold muted">Timings</p>
      <div className="mt-2 flex items-center gap-2">
        <input type="time" className="field num flex-1 text-center" value={cfg.from} aria-label="From" onChange={(e) => e.target.value && void update({ ...cfg, from: e.target.value })} />
        <span className="text-[13px] muted">to</span>
        <input type="time" className="field num flex-1 text-center" value={cfg.to} aria-label="To" onChange={(e) => e.target.value && void update({ ...cfg, to: e.target.value })} />
      </div>
      <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="How often">
        {WATER_FREQUENCIES.map((f) => {
          const sel = f.every === cfg.every;
          return (
            <button
              key={f.every}
              type="button"
              role="radio"
              aria-checked={sel}
              className="press flex items-center justify-between rounded-2xl px-4 text-left text-[15px] font-semibold"
              style={{ minHeight: 52, background: sel ? "var(--card)" : "var(--card2)", border: sel ? "2px solid var(--ink)" : "2px solid transparent", color: "var(--ink)" }}
              onClick={() => void update({ ...cfg, every: f.every })}
            >
              {f.label}
              {sel ? <Check size={16} /> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] leading-snug muted">
        {cfg.every === 0
          ? "Reminders are off."
          : perm === "unsupported"
            ? "This browser can't show notifications — the Android app reminds you for real."
            : perm === "denied"
              ? "Notifications are blocked for Locked In in your browser settings."
              : perm === "default"
                ? "Allow notifications when your browser asks, to get reminders."
                : sw
                  ? "Reminders pop up on this phone while Locked In is open."
                  : "Reminders on this phone only while Locked In is open (the Android app reminds you even when it's closed)."}
      </p>
      {error ? (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </Card>
  );
}

/* ---- vessel illustrations (tinted with the app's blue) ---- */

function GlassArt({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M11 8h26l-3 34a3 3 0 0 1-3 2.6H17a3 3 0 0 1-3-2.6z" fill="var(--blue-bg)" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.2 22h21.6l-1.8 19.6a1.6 1.6 0 0 1-1.6 1.4H16.6a1.6 1.6 0 0 1-1.6-1.4z" fill="var(--blue)" opacity="0.55" />
      <circle cx="36" cy="9" r="5" fill="#9bd36a" stroke="#6aa83b" strokeWidth="1.5" />
    </svg>
  );
}

function BottleArt({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="20" y="3" width="8" height="6" rx="1.5" fill="var(--ink)" opacity="0.8" />
      <path d="M19 9h10v4l4 5v24a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V18l4-5z" fill="var(--blue-bg)" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16.5 26h15v16a1.5 1.5 0 0 1-1.5 1.5H18a1.5 1.5 0 0 1-1.5-1.5z" fill="var(--blue)" opacity="0.55" />
    </svg>
  );
}

function LargeBottleArt({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="18" y="1.5" width="12" height="6" rx="2" fill="var(--ink)" opacity="0.8" />
      <path d="M17 7.5h14v3l5 5v27a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4v-27l5-5z" fill="var(--blue-bg)" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 22h21v20.5a2.5 2.5 0 0 1-2.5 2.5H16a2.5 2.5 0 0 1-2.5-2.5z" fill="var(--blue)" opacity="0.55" />
      <path d="M13.5 30h21M13.5 37h21" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

function CustomArt({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 5c7 9 12 15.5 12 22a12 12 0 0 1-24 0c0-6.5 5-13 12-22z" fill="var(--blue-bg)" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 22v12M18 28h12" stroke="var(--blue)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
