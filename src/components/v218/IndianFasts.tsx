"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CITIES, PRESETS, hhmm, presetWindow, startPlan, type PresetKey } from "@/lib/v218/fastingPresets";
import { startPresetFast } from "@/lib/v218/actions";
import { localNow } from "@/lib/notify";
import { ErrorNote } from "../ui";
import { AccentButton, CardHead, PCard } from "../nutrition/kit";

/**
 * v2.18 B10 Indian fasting presets on top of the timer: Navratri, Ramadan, Ekadashi, Jain
 * chauvihar and a weekly vrat. Today's timings come from an approximate sunrise / sunset for the
 * chosen city; "Start" runs the normal fasting timer (backdated to the window's start when you're
 * already inside it). Food lists are common practice, and families differ.
 */
const CITY_KEY = "lockedin-fast-city";
const noop = () => () => {};

export default function IndianFasts({ available }: { available: boolean }) {
  const router = useRouter();
  const stored = useSyncExternalStore(noop, () => {
    try {
      return window.localStorage.getItem(CITY_KEY) ?? "delhi";
    } catch {
      return "delhi";
    }
  }, () => "delhi");
  const [cityKey, setCityKey] = useState<string | null>(null);
  const city = CITIES.find((c) => c.key === (cityKey ?? stored)) ?? CITIES[0];
  const [open, setOpen] = useState<PresetKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = localNow();

  async function start(key: PresetKey) {
    const p = PRESETS.find((x) => x.key === key)!;
    const w = presetWindow(p, now.date, city.lat, city.lng);
    const plan = startPlan(w, now.minutes);
    setBusy(true);
    setErr(null);
    const r = await startPresetFast(key, plan.hours, plan.backdateMin);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  }

  return (
    <PCard label="Indian fasts">
      <CardHead
        icon="flame"
        title="Indian fasts"
        sub="Vrat and roza timings for today, with what's usually eaten."
        right={
          <select
            aria-label="City for sunrise and sunset"
            className="h-9 rounded-full px-3 text-[12px] font-semibold"
            style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
            value={city.key}
            onChange={(e) => {
              setCityKey(e.target.value);
              try {
                window.localStorage.setItem(CITY_KEY, e.target.value);
              } catch {
                // per-device nicety
              }
            }}
          >
            {CITIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />
      <div className="flex flex-col gap-2">
        {PRESETS.map((p) => {
          const w = presetWindow(p, now.date, city.lat, city.lng);
          const on = open === p.key;
          return (
            <div key={p.key} className="rounded-2xl" style={{ background: "var(--card2)" }}>
              <button type="button" aria-expanded={on} className="press flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => setOpen(on ? null : p.key)}>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold">{p.name}</span>
                  <span className="block text-[12px] muted">{p.sub}</span>
                </span>
                <span className="num shrink-0 text-right text-[12px] font-semibold">
                  {w.hours} h
                  <span className="block text-[11px] font-medium muted">{w.startMin >= 0 ? w.label : "your start"}</span>
                </span>
              </button>
              {on ? (
                <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
                  {w.sehri ? (
                    <p className="num text-[13px]">
                      Sehri ends ~<b>{w.sehri}</b> · Iftar ~<b>{w.iftar}</b> <span className="muted">({city.name}, approximate: follow your local calendar)</span>
                    </p>
                  ) : w.startMin >= 0 ? (
                    <p className="num text-[13px]">
                      Today: <b>{hhmm(w.startMin)}</b> → <b>{hhmm(w.endMin)}</b> <span className="muted">({city.name}, approximate)</span>
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 text-[12.5px] leading-[17px]">
                    <div>
                      <p className="mb-1 font-semibold" style={{ color: "var(--green-ink, var(--green))" }}>
                        Usually eaten
                      </p>
                      <ul className="flex flex-col gap-0.5">
                        {p.eat.map((x) => (
                          <li key={x}>· {x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold muted">Usually avoided</p>
                      <ul className="flex flex-col gap-0.5 muted">
                        {p.avoid.map((x) => (
                          <li key={x}>· {x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-[12.5px] leading-[17px]">{p.note}</p>
                  <ErrorNote text={err} />
                  <AccentButton onClick={() => void start(p.key)} disabled={busy || !available}>
                    {busy ? "Starting…" : `Start ${p.name.toLowerCase()} timer`}
                  </AccentButton>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-4 muted">Practice varies by family and community; adjust the hours if yours differ. Skip nirjala (no-water) fasts on hard training days.</p>
    </PCard>
  );
}
