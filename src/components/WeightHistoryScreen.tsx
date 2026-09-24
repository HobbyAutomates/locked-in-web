"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { deleteWeight, logWeight } from "@/lib/actions";
import { daysBetween, parseIso, shortDate, today as todayIso } from "@/lib/dates";
import type { Profile, WeightEntry } from "@/lib/types";
import { weightText } from "@/lib/display";
import SubPage from "./SubPage";
import { Plus, Scale, Trash } from "./icons";
import { Card, ErrorNote, Hair, IconTile, NumberField, PillButton, Rise, fmt } from "./ui";

/** "Today" / "Yesterday" / "3 days ago" / a short date. */
function relative(date: string) {
  const d = daysBetween(date, todayIso());
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d > 1 && d < 7) return `${d} days ago`;
  return shortDate(date);
}

const monthYear = (iso: string) => parseIso(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/** Big current number, the movement since the first weigh-in, and the full log. */
export default function WeightHistoryScreen({ profile, weights, openLog = false }: { profile: Profile; weights: WeightEntry[]; openLog?: boolean }) {
  const router = useRouter();
  const [showLog, setShowLog] = useState(openLog);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const latest = weights[0]?.weight_kg ?? profile.weight_kg;
  const first = weights[weights.length - 1];
  const delta = latest != null && first ? latest - first.weight_kg : null;
  const tint = (d: number) => (d > 0.05 ? "var(--green)" : d < -0.05 ? "var(--blue)" : "var(--muted)");
  const signed = (d: number) => `${d > 0 ? "+" : ""}${fmt(Math.round(d * 10) / 10)}`;
  // v2.4: shown in the Preferences → Weight units (stored in kg).
  const signedWeight = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${weightText(Math.abs(d), profile.units)}`;

  async function remove(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await deleteWeight(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <SubPage title="Weight history" back="/profile">
      <Rise index={0}>
        <Card padding={20}>
          <p className="text-[13px] font-medium muted">Current weight</p>
          <p className="num mt-1.5 text-[44px] font-extrabold leading-[46px]" style={{ letterSpacing: "-0.04em" }}>
            {weightText(latest, profile.units)}
          </p>
          {delta != null && first ? (
            <p className="text-sm font-semibold" style={{ color: tint(delta) }}>
              {signedWeight(delta)} since {monthYear(first.date)}
            </p>
          ) : null}
          {profile.goal_weight_kg != null ? <p className="mt-0.5 text-xs muted">Goal {weightText(profile.goal_weight_kg, profile.units)}</p> : null}
        </Card>
      </Rise>
      <Rise index={1}>
        <PillButton onClick={() => setShowLog(true)}>
          <Plus size={18} />
          Log Weight
        </PillButton>
      </Rise>
      <Rise index={1}>
        <ErrorNote text={error} />
      </Rise>
      <Rise index={2}>
        {weights.length === 0 ? (
          <p className="text-[13px] muted">No weigh-ins yet. Log one to start the chart on Progress.</p>
        ) : (
          <Card padding={0}>
            <div className="px-3.5">
              {weights.map((r, i) => {
                const prev = weights[i + 1];
                const d = prev ? r.weight_kg - prev.weight_kg : null;
                return (
                  <div key={r.id}>
                    {i > 0 ? <Hair /> : null}
                    <div className="flex items-center gap-3 py-2.5">
                      <IconTile>
                        <Scale size={22} />
                      </IconTile>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="num text-base font-bold">{weightText(r.weight_kg, profile.units)}</span>
                        <span className="truncate text-xs muted">
                          {relative(r.date)}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                      </span>
                      {d != null ? (
                        <span className="num text-[13px] font-bold" style={{ color: tint(d) }}>
                          {signed(d)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Delete weigh-in of ${fmt(r.weight_kg)} kg`}
                        disabled={deleting === r.id}
                        onClick={() => remove(r.id)}
                        className="press grid place-items-center rounded-full"
                        style={{ width: 32, height: 32, background: "none", border: 0, color: "var(--muted)" }}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Rise>
      <AnimatePresence>{showLog ? <LogWeightDialog initialKg={latest} onClose={() => setShowLog(false)} /> : null}</AnimatePresence>
    </SubPage>
  );
}

function LogWeightDialog({ initialKg, onClose }: { initialKg: number | null; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [kg, setKg] = useState(initialKg != null ? fmt(initialKg) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Number.isFinite(Number(kg)) && Number(kg) >= 20 && Number(kg) <= 300;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await logWeight({ date, weight_kg: Number(kg), note });
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center px-6"
      style={{ background: "rgba(0,0,0,0.45)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Log weight"
      onClick={onClose}
    >
      <motion.form
        className="w-full max-w-[360px]"
        style={{ background: "var(--card)", borderRadius: 28, padding: 22 }}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void save();
        }}
      >
        <h2 className="text-xl font-extrabold">Log weight</h2>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <label htmlFor="lw-date" className="text-[15px] font-medium">
            Date
          </label>
          <input id="lw-date" type="date" className="pickfield num" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-[15px] font-medium">Weight</span>
          <NumberField value={kg} onChange={setKg} unit="kg" label="Weight in kilograms" decimal />
        </div>
        <input className="field mt-3.5" placeholder="Note (optional)" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <PillButton type="submit" disabled={busy || !valid}>
            {busy ? "Saving…" : "Save"}
          </PillButton>
          <PillButton soft height={44} onClick={onClose}>
            Cancel
          </PillButton>
        </div>
      </motion.form>
    </motion.div>
  );
}
