"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SubPage from "@/components/SubPage";
import { SPORTS, STEP_PACES, sportKcal, stepsBurn } from "@/lib/v218/sports";
import { logSport, logSteps } from "@/lib/v218/actions";
import { ErrorNote } from "../ui";
import { AccentButton, PCard } from "../nutrition/kit";

/**
 * v2.18 C3 sports presets with realistic MET-based burn: cricket (gully, nets, match fielding, fast
 * bowling), football, badminton, kabaddi, and steps → distance / minutes / kcal. Logs to the normal
 * exercise log, so Home's burn, streaks and the squad all see it.
 */
export default function SportsLog({ weightKg, heightCm, hideNumbers }: { weightKg: number | null; heightCm: number | null; hideNumbers: boolean }) {
  const router = useRouter();
  const [sport, setSport] = useState(SPORTS[0].key);
  const s = SPORTS.find((x) => x.key === sport)!;
  const [variant, setVariant] = useState(s.variants[0].key);
  const v = s.variants.find((x) => x.key === variant) ?? s.variants[0];
  const [minutes, setMinutes] = useState(v.minutes);
  const [steps, setSteps] = useState("");
  const [pace, setPace] = useState<(typeof STEP_PACES)[number]["key"]>("brisk");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const kcal = sportKcal(v.met, weightKg, minutes);
  const st = Number(steps.replace(/\D/g, "")) || 0;
  const sb = stepsBurn(st, { weightKg, heightCm, pace });

  async function go(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, what: string) {
    setBusy(true);
    setErr(null);
    setDone(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDone(`Logged ${what}.`);
    router.refresh();
  }

  return (
    <SubPage title="Sports & steps" back="/train">
      <div className="flex flex-col gap-3.5">
        <PCard label="Sport">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sport">
            {SPORTS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={sport === x.key}
                className="chip press"
                style={{ height: 38 }}
                onClick={() => {
                  setSport(x.key);
                  setVariant(x.variants[0].key);
                  setMinutes(x.variants[0].minutes);
                }}
              >
                {x.name}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Type">
            {s.variants.map((x) => (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={variant === x.key}
                className="press flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-left"
                style={{ border: variant === x.key ? "1.5px solid var(--ink)" : "1.5px solid transparent", background: "var(--card2)", color: "var(--ink)" }}
                onClick={() => {
                  setVariant(x.key);
                  setMinutes(x.minutes);
                }}
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{x.label}</span>
                  <span className="block text-[11.5px] leading-snug muted">{x.note}</span>
                </span>
                <span className="num shrink-0 text-[12px] font-semibold muted">MET {x.met}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={{ minHeight: 48, background: "var(--card2)" }}>
            <span className="text-[14px] font-semibold">Minutes</span>
            <input className="num w-20 bg-transparent text-right text-[15px] font-semibold" style={{ border: 0, color: "var(--ink)" }} inputMode="numeric" value={minutes || ""} onChange={(e) => setMinutes(Math.min(300, Number(e.target.value.replace(/\D/g, "")) || 0))} aria-label="Minutes" />
          </label>
          {!hideNumbers ? (
            <p className="num text-[13px] muted">
              ≈ <b style={{ color: "var(--ink)" }}>{Math.round(kcal)} kcal</b> at {weightKg ?? 60} kg
            </p>
          ) : null}
          <AccentButton onClick={() => void go(() => logSport({ sport, variant, minutes, weightKg }), `${s.name}, ${minutes} min`)} disabled={busy || minutes < 5}>
            {busy ? "Logging…" : `Log ${s.name.toLowerCase()}`}
          </AccentButton>
        </PCard>

        <PCard label="Steps">
          <p className="text-[16px] font-semibold">Steps</p>
          <label className="flex items-center justify-between gap-3 rounded-2xl px-3.5" style={{ minHeight: 48, background: "var(--card2)" }}>
            <span className="text-[14px] font-semibold">Steps</span>
            <input className="num w-28 bg-transparent text-right text-[15px] font-semibold" style={{ border: 0, color: "var(--ink)" }} inputMode="numeric" placeholder="8000" value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Steps" />
          </label>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Pace">
            {STEP_PACES.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={pace === p.key} className="chip press justify-center" style={{ height: 36 }} onClick={() => setPace(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          {st > 0 ? (
            <p className="num text-[13px] muted">
              ≈ {sb.km} km · {sb.minutes} min{!hideNumbers ? <> · <b style={{ color: "var(--ink)" }}>{Math.round(sb.kcal)} kcal</b> above resting</> : null}
            </p>
          ) : null}
          <AccentButton onClick={() => void go(() => logSteps({ steps: st, pace, weightKg, heightCm }), `${st.toLocaleString("en-IN")} steps`)} disabled={busy || st < 100}>
            {busy ? "Logging…" : "Log steps"}
          </AccentButton>
        </PCard>
        <ErrorNote text={err} />
        {done ? (
          <p role="status" className="text-center text-[13px] font-semibold" style={{ color: "var(--green)" }}>
            {done}
          </p>
        ) : null}
        <p className="px-1 text-[11px] leading-4 muted">Burn = MET × body weight × time (2024 Compendium of Physical Activities). Kabaddi has no Compendium entry, so it&apos;s priced like similar team drills.</p>
      </div>
    </SubPage>
  );
}
