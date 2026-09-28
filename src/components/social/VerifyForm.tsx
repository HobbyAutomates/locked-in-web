"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "../ui";
import { requestVerification } from "@/lib/social/actions";
import type { Verification } from "@/lib/social/data";

const KINDS = [
  { key: "gym", label: "Gym" },
  { key: "college", label: "College" },
  { key: "office", label: "Office" },
  { key: "club", label: "Club" },
];

export default function VerifyForm({ squadId, squadName, latest }: { squadId: string; squadName: string; latest: Verification | null }) {
  const router = useRouter();
  const [org, setOrg] = useState("");
  const [kind, setKind] = useState("gym");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = latest?.status === "pending";

  async function send() {
    setBusy(true);
    setError(null);
    const r = await requestVerification(squadId, org, kind, proof);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  if (pending)
    return (
      <section className="flex flex-col gap-2" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[17px] font-bold">Waiting for review</p>
        <p className="text-[13.5px] muted">
          You asked to verify {squadName} as {latest?.org_name}. The Locked In team checks these by hand, usually within a few days.
        </p>
      </section>
    );

  return (
    <section className="flex flex-col gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
      <div className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 1.5l2.6 2 3.2-.4 1.2 3 3 1.2-.4 3.2 2 2.6-2 2.6.4 3.2-3 1.2-1.2 3-3.2-.4-2.6 2-2.6-2-3.2.4-1.2-3-3-1.2.4-3.2-2-2.6 2-2.6-.4-3.2 3-1.2 1.2-3 3.2.4z" fill="#D9B872" />
          <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#0B0B0C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-[17px] font-bold">Verify {squadName}</p>
      </div>
      <p className="text-[13.5px] muted">For squads that are a real gym, college, office or club. Verified squads get a gold tick and the place&rsquo;s name.</p>
      {latest?.status === "rejected" ? <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>The last request wasn&rsquo;t approved{latest.note ? `: ${latest.note}` : "."} You can try again.</p> : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold muted">Name of the place</span>
        <input value={org} onChange={(e) => setOrg(e.target.value)} maxLength={80} placeholder="e.g. Gold's Gym Andheri, IIT Bombay" className="h-12 rounded-2xl px-3.5 text-[15px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
      </label>
      <div role="radiogroup" aria-label="Kind of place" className="grid grid-cols-4 gap-1.5">
        {KINDS.map((k) => (
          <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)} className="press h-10 rounded-xl text-[13px] font-semibold" style={{ background: kind === k.key ? "var(--ink)" : "var(--card2)", color: kind === k.key ? "var(--bg)" : "var(--ink)", border: 0 }}>
            {k.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold muted">How can we check? (optional)</span>
        <textarea value={proof} onChange={(e) => setProof(e.target.value)} maxLength={500} placeholder="A website, an Instagram handle, or who to contact" className="min-h-20 rounded-2xl px-3.5 py-3 text-[14px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
      </label>
      <ErrorNote text={error} />
      <button type="button" disabled={busy || org.trim().length < 2} onClick={() => void send()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0, opacity: org.trim().length < 2 ? 0.5 : 1 }}>
        {busy ? "Sending…" : "Ask for verification"}
      </button>
    </section>
  );
}
