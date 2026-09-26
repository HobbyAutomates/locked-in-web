"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMeasurement, saveMeasurement } from "@/lib/platformActions";
import { MEASURES, series, type MeasureKey, type Measurement } from "@/lib/body";
import { parseIso, today as todayIso } from "@/lib/dates";
import SubPage from "../SubPage";
import { CountUp, MRise, STAGGER } from "../motion";
import { LineIcon } from "../lineIcons";
import { Trash } from "../icons";
import { BottomSheet, ErrorNote } from "../ui";
import { CardLabel, ComingSoon, DrawLine, PCard } from "./kit";

const dm = (d: string) => parseIso(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const f1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Draft = { id?: string; date: string; note: string } & Record<MeasureKey, string>;

function draftOf(m: Measurement | null): Draft {
  const d = { id: m?.id, date: m?.date ?? todayIso(), note: m?.note ?? "" } as Draft;
  for (const x of MEASURES) d[x.key] = m?.[x.key] != null ? String(m[x.key]) : "";
  return d;
}

/** v2.13 body measurements (spec §11): entry sheet, a small chart per measure, history with edit and delete. */
export default function BodyScreen({ available, list }: { available: boolean; list: Measurement[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<Measurement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const values: Partial<Record<MeasureKey, number | null>> = {};
    for (const m of MEASURES) values[m.key] = draft[m.key].trim() === "" ? null : Number(draft[m.key]);
    const r = await saveMeasurement({ id: draft.id, date: draft.date, values, note: draft.note });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setDraft(null);
      router.refresh();
    }
  }

  async function remove(m: Measurement) {
    setBusy(true);
    const r = await deleteMeasurement(m.id);
    setBusy(false);
    setConfirm(null);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  if (!available)
    return (
      <SubPage title="Body measurements" back="/progress">
        <ComingSoon what="Body measurements" />
      </SubPage>
    );

  const tracked = MEASURES.map((m) => ({ ...m, s: series(list, m.key) })).filter((m) => m.s.length);

  return (
    <SubPage title="Body measurements" back="/progress">
      <MRise delay={0}>
        <button type="button" className="press flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }} onClick={() => setDraft(draftOf(null))}>
          <LineIcon name="plus" size={18} /> Add measurements
        </button>
        <p className="mt-2 px-1 text-[12px] muted">Measure in the morning, relaxed, tape snug but not tight. Your latest waist feeds the waist ÷ height check on Progress.</p>
      </MRise>

      {tracked.length === 0 ? (
        <MRise delay={STAGGER}>
          <PCard label="No measurements yet">
            <p className="text-[15px] font-semibold">No measurements yet</p>
            <p className="text-[13px] muted">Waist, chest, hips, neck, arm, thigh, calf and body-fat %. Add whichever you like; every one is optional.</p>
          </PCard>
        </MRise>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {tracked.map((m, i) => {
            const last = m.s[m.s.length - 1].value;
            const delta = m.s.length >= 2 ? Math.round((last - m.s[0].value) * 10) / 10 : null;
            return (
              <MRise key={m.key} delay={STAGGER + i * 90}>
                <section aria-label={m.label} className="flex h-full flex-col gap-1.5 rounded-[22px] p-4" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
                  <span className="text-[12px] font-semibold muted">{m.label}</span>
                  <span className="num text-[26px] font-extrabold leading-none" style={{ letterSpacing: "-1px" }}>
                    <CountUp value={last} decimals={1} delay={STAGGER + i * 90 + 200} format={(n) => f1(Math.round(n * 10) / 10)} />
                    <span className="ml-0.5 text-[12px] font-semibold muted">{m.unit}</span>
                  </span>
                  <span className="num text-[11px] font-semibold" style={{ color: delta == null || delta === 0 ? "var(--muted)" : "var(--ink)" }}>
                    {delta == null ? "1 entry" : delta === 0 ? "No change" : `${delta < 0 ? "−" : "+"}${f1(Math.abs(delta))} ${m.unit} since ${parseIso(m.s[0].date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                  </span>
                  {m.s.length >= 2 ? <DrawLine values={m.s.slice(-20).map((p) => p.value)} width={140} height={44} delay={STAGGER + i * 90 + 300} label={`${m.label} over time`} /> : null}
                </section>
              </MRise>
            );
          })}
        </div>
      )}

      {list.length ? (
        <MRise delay={STAGGER * 3}>
          <PCard label="History">
            <CardLabel>History</CardLabel>
            <ul className="m-0 flex list-none flex-col p-0">
              {list.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2 py-2.5" style={{ borderTop: i ? "1px solid var(--hair)" : 0 }}>
                  <button type="button" className="press flex min-w-0 flex-1 flex-col text-left" style={{ background: "none", border: 0, color: "var(--ink)", padding: 0 }} onClick={() => setDraft(draftOf(m))} aria-label={`Edit the ${dm(m.date)} entry`}>
                    <span className="text-[14px] font-semibold">{dm(m.date)}</span>
                    <span className="num truncate text-[12px] muted">
                      {MEASURES.filter((x) => m[x.key] != null)
                        .map((x) => `${x.label} ${f1(m[x.key] as number)}${x.unit === "%" ? "%" : ""}`)
                        .join(" · ")}
                    </span>
                  </button>
                  <button type="button" aria-label={`Delete the ${dm(m.date)} entry`} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => setConfirm(m)}>
                    <Trash size={17} />
                  </button>
                </li>
              ))}
            </ul>
          </PCard>
        </MRise>
      ) : null}

      <ErrorNote text={error} />

      <BottomSheet open={draft !== null} title={draft?.id ? "Edit measurements" : "Add measurements"} onClose={() => setDraft(null)} primary={{ label: busy ? "Saving…" : "Save", onClick: () => void save(), disabled: busy }}>
        {draft ? (
          <div className="flex flex-col gap-3 pb-1">
            <label className="flex items-center justify-between gap-3 text-[14px] font-semibold">
              Date
              <input type="date" value={draft.date} max={todayIso()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="rounded-xl px-2.5 py-2 text-[14px]" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MEASURES.map((m) => (
                <label key={m.key} className="flex flex-col gap-1 rounded-2xl px-3 py-2" style={{ background: "var(--card2)" }}>
                  <span className="text-[12px] font-semibold muted">
                    {m.label} ({m.unit})
                  </span>
                  <input inputMode="decimal" value={draft[m.key]} placeholder="—" onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value.replace(/[^\d.]/g, "") })} className="num bg-transparent text-[18px] font-bold outline-none" style={{ border: 0, color: "var(--ink)" }} aria-label={`${m.label} in ${m.unit}`} />
                </label>
              ))}
            </div>
            <input value={draft.note} maxLength={120} placeholder="Note (optional)" onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="rounded-2xl px-3.5 py-3 text-[14px] outline-none" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} aria-label="Note" />
            {error ? <ErrorNote text={error} /> : null}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet open={confirm !== null} title="Delete this entry?" subtitle={confirm ? dm(confirm.date) : undefined} onClose={() => setConfirm(null)} primary={{ label: busy ? "Deleting…" : "Delete", onClick: () => confirm && void remove(confirm), disabled: busy }}>
        <p className="text-[14px] muted">This can&rsquo;t be undone.</p>
      </BottomSheet>
    </SubPage>
  );
}

