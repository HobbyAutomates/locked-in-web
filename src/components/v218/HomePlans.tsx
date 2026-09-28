"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HOME_TEMPLATES } from "@/lib/v218/homeWorkouts";
import { createHomeRoutine } from "@/lib/v218/actions";
import { LineIcon } from "../lineIcons";
import { ErrorNote } from "../ui";
import { PCard } from "../nutrition/kit";

/**
 * v2.18 C1 home and hostel workouts in the routine planner: no-equipment and band-only plans,
 * beginner and intermediate. Tapping one adds it as the active routine (editable like any other).
 * Also links the sports presets (C3) and the AI form check (C2).
 */
export default function HomePlans() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function add(key: string) {
    setBusy(key);
    setErr(null);
    const r = await createHomeRoutine(key);
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  }
  return (
    <PCard label="Home and hostel workouts">
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
          Home &amp; hostel
        </p>
        <span className="text-[12px] muted">no gym needed</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {HOME_TEMPLATES.map((t) => (
          <button key={t.key} type="button" className="press flex min-h-[96px] flex-col items-start justify-between rounded-2xl p-3 text-left" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} disabled={!!busy} onClick={() => void add(t.key)}>
            <span className="text-[11px] font-bold uppercase" style={{ letterSpacing: ".06em", color: t.equipment === "band" ? "var(--iris)" : "var(--ember)" }}>
              {t.equipment === "band" ? "Band" : "No equipment"} · {t.level}
            </span>
            <span className="text-[14px] font-semibold leading-tight">{t.name}</span>
            <span className="text-[11px] leading-snug muted">{busy === t.key ? "Adding…" : t.sub}</span>
          </button>
        ))}
      </div>
      <ErrorNote text={err} />
      <div className="grid grid-cols-2 gap-2">
        <Link href="/train/form-check" className="press flex items-center gap-2 rounded-2xl px-3 py-3 text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
          <LineIcon name="camera" size={16} /> Form check
        </Link>
        <Link href="/train/sports" className="press flex items-center gap-2 rounded-2xl px-3 py-3 text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
          <LineIcon name="award" size={16} /> Sports &amp; steps
        </Link>
      </div>
    </PCard>
  );
}
