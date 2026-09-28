"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BottomSheet, ErrorNote } from "../ui";
import { closePledge, createPledge } from "@/lib/social/actions";
import { MONEY_STEP_NOTE, PLEDGE_KIND_LABEL, pledgeProgress, stakeLine, validatePledge, type Pledge, type PledgeKind } from "@/lib/social/pledges";
import { shortDate } from "@/lib/dates";

type Days = Record<Exclude<PledgeKind, "custom">, string[]>;

function Progress({ p, days, today }: { p: Pledge; days: Days; today: string }) {
  const pr = pledgeProgress(p, p.kind === "custom" ? [] : days[p.kind], today);
  const tone = pr.outcome === "kept" ? "var(--green-ink)" : pr.outcome === "broken" ? "var(--danger)" : pr.onTrack ? "var(--ink)" : "var(--orange-ink)";
  if (p.kind === "custom")
    return <p className="text-[12.5px] muted">{p.status === "active" ? `Self-reported · ends ${shortDate(p.ends_on)}` : p.status === "kept" ? "Kept" : "Broken"}</p>;
  const f = pr.needed ? Math.min(1, pr.done / pr.needed) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
        <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: pr.outcome === "broken" ? "var(--danger)" : "var(--accent)" }} />
      </div>
      <p className="text-[12.5px] font-semibold" style={{ color: tone }}>
        {pr.done} of {pr.needed} days · {pr.outcome === "kept" ? "Kept" : pr.outcome === "broken" ? "Can't be kept now" : pr.onTrack ? `On track, ${pr.daysLeft} ${pr.daysLeft === 1 ? "day" : "days"} left` : `Behind, ${pr.daysLeft} ${pr.daysLeft === 1 ? "day" : "days"} left`}
      </p>
    </div>
  );
}

function PledgeCard({ p, days, today, mine, onClose }: { p: Pledge; days: Days; today: string; mine: boolean; onClose?: (status: "kept" | "broken" | "cancelled") => void }) {
  const pr = pledgeProgress(p, p.kind === "custom" ? [] : days[p.kind], today);
  const ended = today > p.ends_on;
  return (
    <article className="flex flex-col gap-2.5" style={{ background: "var(--card)", borderRadius: 20, padding: 16, boxShadow: "var(--pcard-ring)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          {!mine && p.name ? <span className="text-[12px] font-semibold muted">{p.name}</span> : null}
          <span className="text-[15.5px] font-bold leading-snug">{p.goal}</span>
          <span className="text-[12px] muted">
            {shortDate(p.starts_on)} to {shortDate(p.ends_on)}
          </span>
        </div>
        {p.status !== "active" ? (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase" style={{ background: p.status === "kept" ? "var(--green-bg)" : "var(--card2)", color: p.status === "kept" ? "var(--green-ink)" : "var(--muted)", letterSpacing: "0.06em" }}>
            {p.status}
          </span>
        ) : null}
      </div>
      <p className="text-[13px]" style={{ color: "#9c7a35" }}>
        {stakeLine(p.stake, p.stake_inr)}
      </p>
      {mine || p.kind !== "custom" ? <Progress p={p} days={days} today={today} /> : null}
      {mine && onClose && p.status === "active" ? (
        <div className="flex gap-2">
          {p.kind === "custom" || pr.outcome !== "active" || ended ? (
            <>
              <button type="button" onClick={() => onClose(pr.outcome === "broken" ? "broken" : "kept")} className="press h-10 flex-1 rounded-xl text-[13px] font-semibold" style={{ background: "var(--ink)", color: "var(--bg)", border: 0 }}>
                {p.kind === "custom" ? "I kept it" : pr.outcome === "broken" ? "Close it out" : "Mark kept"}
              </button>
              {p.kind === "custom" ? (
                <button type="button" onClick={() => onClose("broken")} className="press h-10 flex-1 rounded-xl text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }}>
                  I broke it
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" onClick={() => onClose("cancelled")} className="press h-10 rounded-xl px-3 text-[13px] font-semibold muted" style={{ background: "none", border: 0 }}>
            Cancel
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function PledgesScreen({ today, me, mine, squads, squadId, squadPledges, days }: { today: string; me: string; mine: Pledge[]; squads: { id: string; name: string }[]; squadId: string | null; squadPledges: Pledge[]; days: Days }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PledgeKind>("log_days");
  const [goal, setGoal] = useState("");
  const [lenDays, setLenDays] = useState(7);
  const [target, setTarget] = useState(6);
  const [stake, setStake] = useState("");
  const [inr, setInr] = useState("");
  const [group, setGroup] = useState<string | null>(squadId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = { goal: kind === "custom" ? goal : PLEDGE_KIND_LABEL[kind], kind, target: kind === "custom" ? null : target, stake, stake_inr: Number(inr || 0), starts_on: today, days: lenDays };
  const problem = validatePledge(draft, today);

  async function save() {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const r = await createPledge({ ...draft, group_id: group }, today);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  }
  async function close(id: string, status: "kept" | "broken" | "cancelled") {
    const r = await closePledge(id, status);
    if (!r.ok) setError(r.error);
    router.refresh();
  }

  const others = squadPledges.filter((p) => p.user_id !== me);
  return (
    <>
      <section className="flex flex-col gap-2" style={{ background: "linear-gradient(160deg, #0B0B0C, #1c1410)", color: "#F4F1EA", borderRadius: 26, padding: 20 }}>
        <p className="display text-[26px] font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
          Say it out loud.
        </p>
        <p className="text-[13.5px]" style={{ opacity: 0.75 }}>
          Pledge a goal, put something on the line, and let your squad hold you to it.
        </p>
        <button type="button" onClick={() => setOpen(true)} className="press mt-1 flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold" style={{ background: "#FF5B1F", color: "#0B0B0C", border: 0 }}>
          Make a pledge
        </button>
      </section>
      <ErrorNote text={error} />

      <p className="px-1 text-[13px] font-bold muted">Mine</p>
      {mine.length ? mine.map((p) => <PledgeCard key={p.id} p={p} days={days} today={today} mine onClose={(s) => void close(p.id, s)} />) : <p className="px-1 text-[13.5px] muted">No pledges yet.</p>}

      {squads.length ? (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-[13px] font-bold muted">In your squad</p>
            {squads.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto">
                {squads.map((s) => (
                  <Link key={s.id} href={`/pledges?squad=${s.id}`} replace className="press whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: s.id === squadId ? "var(--ink)" : "var(--card2)", color: s.id === squadId ? "var(--bg)" : "var(--ink)" }}>
                    {s.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          {others.length ? others.map((p) => <PledgeCard key={p.id} p={p} days={days} today={today} mine={false} />) : <p className="px-1 text-[13.5px] muted">Nobody in this squad has pledged yet.</p>}
        </>
      ) : null}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Make a pledge" subtitle={MONEY_STEP_NOTE}>
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-1.5">
            {(["log_days", "train_days", "protein_days", "custom"] as PledgeKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className="press h-11 rounded-xl text-[13px] font-semibold" style={{ background: kind === k ? "var(--ink)" : "var(--card2)", color: kind === k ? "var(--bg)" : "var(--ink)", border: 0 }}>
                {k === "custom" ? "My own goal" : PLEDGE_KIND_LABEL[k].replace(" on", "")}
              </button>
            ))}
          </div>
          {kind === "custom" ? <input aria-label="Your goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} placeholder="No sugar till Sunday" className="h-12 rounded-2xl px-3.5 text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} /> : null}
          <div className="flex items-center gap-2 text-[14px]">
            {kind !== "custom" ? (
              <>
                <input aria-label="Days needed" type="number" min={1} max={lenDays} value={target} onChange={(e) => setTarget(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="num h-11 w-16 rounded-xl px-2 text-center text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
                <span className="muted">of</span>
              </>
            ) : (
              <span className="muted">For</span>
            )}
            <select aria-label="Pledge length" value={lenDays} onChange={(e) => setLenDays(Number(e.target.value))} className="h-11 rounded-xl px-2 text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }}>
              {[3, 5, 7, 14, 21, 30].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
            <span className="muted">from today</span>
          </div>
          <input aria-label="The stake" value={stake} onChange={(e) => setStake(e.target.value)} maxLength={120} placeholder="Stake: chai for the whole squad" className="h-12 rounded-2xl px-3.5 text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">₹</span>
            <input aria-label="Amount into the squad pot" inputMode="numeric" value={inr} onChange={(e) => setInr(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="Into the squad pot (optional)" className="num h-12 min-w-0 flex-1 rounded-2xl px-3.5 text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          </div>
          <div className="flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--card2)" }}>
            <span className="font-semibold">Pay into the pot in the app</span>
            <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: "var(--card)", color: "var(--muted)" }}>
              Coming soon
            </span>
          </div>
          {squads.length ? (
            <select aria-label="Squad that sees it" value={group ?? ""} onChange={(e) => setGroup(e.target.value || null)} className="h-11 rounded-xl px-2 text-[14px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }}>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  Visible to {s.name}
                </option>
              ))}
              <option value="">Just me</option>
            </select>
          ) : null}
          {error ? <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p> : null}
          <button type="button" disabled={busy || !!problem} onClick={() => void save()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: problem ? 0.5 : 1 }}>
            {busy ? "Saving…" : problem ?? "Pledge it"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
