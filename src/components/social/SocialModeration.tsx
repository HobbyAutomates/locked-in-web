"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideVerification, resolveReport, unverifySquad } from "@/lib/social/adminActions";

type Pending = { id: string; group_id: string; squad: string; org_name: string; org_kind: string; proof: string; created_at: string };
type Report = { id: string; reason: string; note: string; snapshot: string; post_id: string | null; group_id: string | null; reported_user: string | null; created_at: string };

const box: React.CSSProperties = { background: "var(--card)", borderRadius: 18, padding: 16, boxShadow: "var(--pcard-ring)" };

export default function SocialModeration({ verificationsAvailable, reportsAvailable, pending, reports, verified }: { verificationsAvailable: boolean; reportsAvailable: boolean; pending: Pending[]; reports: Report[]; verified: { id: string; name: string; org_name: string | null; org_kind: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Failed");
    router.refresh();
  }
  const btn = (label: string, onClick: () => void, danger = false, key?: string) => (
    <button type="button" disabled={busy === key} onClick={onClick} className="press rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: danger ? "var(--danger)" : "var(--ink)", color: danger ? "#fff" : "var(--bg)", border: 0 }}>
      {label}
    </button>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {error ? <p className="text-sm font-semibold lg:col-span-2" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Verification requests</h2>
        {!verificationsAvailable ? <p className="text-sm muted">Needs schema_v44.</p> : !pending.length ? <p className="text-sm muted">Nothing waiting.</p> : null}
        {pending.map((v) => (
          <article key={v.id} style={box} className="flex flex-col gap-2">
            <p className="font-bold">
              {v.squad} → {v.org_name} <span className="muted">({v.org_kind})</span>
            </p>
            {v.proof ? <p className="whitespace-pre-wrap text-sm">{v.proof}</p> : <p className="text-sm muted">No proof given.</p>}
            <p className="text-xs muted">{new Date(v.created_at).toLocaleString("en-IN")}</p>
            <input aria-label="Note to the owner" placeholder="Note (optional, shown if rejected)" value={notes[v.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value }))} className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
            <div className="flex gap-2">
              {btn("Approve", () => void run(v.id, () => decideVerification(v.id, true, notes[v.id] ?? "")), false, v.id)}
              {btn("Reject", () => void run(v.id, () => decideVerification(v.id, false, notes[v.id] ?? "")), true, v.id)}
            </div>
          </article>
        ))}
        {verified.length ? (
          <article style={box} className="flex flex-col gap-1.5">
            <p className="font-bold">Verified squads ({verified.length})</p>
            {verified.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {g.name} · {g.org_name} <span className="muted">({g.org_kind})</span>
                </span>
                <button type="button" className="text-xs underline" style={{ background: "none", border: 0, color: "var(--danger)" }} onClick={() => void run(g.id, () => unverifySquad(g.id))}>
                  Remove tick
                </button>
              </div>
            ))}
          </article>
        ) : null}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Squad reports</h2>
        {!reportsAvailable ? <p className="text-sm muted">Needs schema_v45.</p> : !reports.length ? <p className="text-sm muted">No open reports.</p> : null}
        {reports.map((r) => (
          <article key={r.id} style={box} className="flex flex-col gap-2">
            <p className="font-bold">{r.reason.replace("_", " ")}</p>
            {r.snapshot ? <p className="whitespace-pre-wrap text-sm">{r.snapshot}</p> : null}
            {r.note ? <p className="text-sm muted">Reporter: {r.note}</p> : null}
            <p className="text-xs muted">
              {new Date(r.created_at).toLocaleString("en-IN")}
              {r.reported_user ? ` · user ${r.reported_user.slice(0, 8)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {r.post_id ? btn("Delete post", () => void run(r.id, () => resolveReport(r.id, "actioned", true)), true, r.id) : null}
              {btn("Mark handled", () => void run(r.id, () => resolveReport(r.id, "actioned", false)), false, r.id)}
              {btn("Dismiss", () => void run(r.id, () => resolveReport(r.id, "dismissed", false)), false, r.id)}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
