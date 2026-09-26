"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyCheckin } from "@/lib/nutrition-actions";
import { dismiss, useDismissed } from "@/lib/dismiss";
import type { CheckinRow } from "@/lib/nutritionTypes";
import { LineIcon } from "../lineIcons";
import { ErrorNote } from "../ui";
import { AccentButton, GhostButton, PCard, Pill } from "./kit";

export const checkinKey = (row: Pick<CheckinRow, "id" | "week_start">) => `checkin:${row.id || row.week_start}`;

/**
 * The Monday check-in (spec §5): old → new target, the plain-English reason, and Apply / Keep
 * current. Apply sets the target (macros follow the diet mode); Keep just hides it on this device.
 * Nothing ever applies by itself.
 */
export function CheckinCard({ row, compact = false, hideNumbers = false }: { row: CheckinRow; compact?: boolean; hideNumbers?: boolean }) {
  const router = useRouter();
  const kept = useDismissed(checkinKey(row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(row.applied);
  const oldT = row.old_target ?? 0;
  const newT = row.new_target ?? oldT;
  const delta = newT - oldT;

  async function apply() {
    if (!row.id) return setError("This check-in couldn't be saved yet. Try again in a moment.");
    setBusy(true);
    setError(null);
    const r = await applyCheckin(row.id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setApplied(true);
    router.refresh();
  }

  if (applied) {
    return (
      <PCard label="Weekly check-in" padding={16}>
        <div className="flex items-center gap-2.5">
          <LineIcon name="check" size={18} style={{ color: "var(--green)" }} />
          <p className="text-[14px] font-semibold">{hideNumbers ? "New weekly target applied" : `This week's target: ${newT.toLocaleString("en-IN")} kcal`}</p>
        </div>
      </PCard>
    );
  }
  if (compact && kept) return null;

  return (
    <PCard label="Weekly check-in" padding={18}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold muted">
          <LineIcon name="chart" size={16} />
          Monday check-in
        </p>
        {delta === 0 ? <Pill tone="flat">No change</Pill> : <Pill tone="accent">{delta > 0 ? `+${delta}` : `−${-delta}`} kcal</Pill>}
      </div>
      {!hideNumbers ? (
        <div className="flex items-baseline gap-2">
          <span className="num text-[15px] font-semibold muted line-through">{oldT.toLocaleString("en-IN")}</span>
          <LineIcon name="chev" size={14} style={{ color: "var(--muted)" }} />
          <span className="num text-[30px] font-semibold leading-none" style={{ letterSpacing: "-0.03em" }}>
            {newT.toLocaleString("en-IN")}
          </span>
          <span className="text-[13px] muted">kcal a day</span>
        </div>
      ) : null}
      <p className="text-[13px] leading-[19px]" style={{ color: "var(--ink)" }}>
        {row.reason}
      </p>
      <ErrorNote text={error} />
      {kept ? (
        <p className="text-[12px] muted">You kept your current target this week.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <AccentButton onClick={() => void apply()} disabled={busy || delta === 0}>
            {busy ? "Applying…" : "Apply"}
          </AccentButton>
          <GhostButton onClick={() => dismiss(checkinKey(row))} disabled={busy}>
            Keep current
          </GhostButton>
        </div>
      )}
    </PCard>
  );
}
