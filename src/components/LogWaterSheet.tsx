"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logWater } from "@/lib/actions";
import { Bottle, Glass } from "./icons";
import { BottomSheet, ErrorNote } from "./ui";

export const WATER_SIZES = [
  { label: "Glass", ml: 250, Icon: Glass },
  { label: "Bottle", ml: 500, Icon: Bottle },
  { label: "Large bottle", ml: 750, Icon: Bottle },
];

/**
 * Log water: an amount in mL, three quick "+1" buttons that add a glass / bottle / large bottle to
 * it, and Log. Writes one `water_log` row for `date` (today when omitted).
 */
export default function LogWaterSheet({ open, onClose: close, date }: { open: boolean; onClose: () => void; date?: string }) {
  const router = useRouter();
  const [ml, setMl] = useState("250");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(ml) || 0;
  function onClose() {
    setMl("250");
    setError(null);
    setBusy(false);
    close();
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await logWater(amount, date);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log that");
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} title="Log water" subtitle="Tap to add, or type the amount." onClose={onClose} primary={{ label: busy ? "Logging…" : `Log ${amount.toLocaleString("en-IN")} mL`, onClick: () => void save(), disabled: busy || amount <= 0 || amount > 5000 }}>
      <div className="flex items-baseline justify-center gap-2 py-2">
        <input
          className="num w-[150px] bg-transparent text-center text-[48px] font-extrabold outline-none"
          style={{ border: 0, color: "var(--ink)", letterSpacing: "-0.04em" }}
          inputMode="numeric"
          aria-label="Amount of water in millilitres"
          value={ml}
          onChange={(e) => setMl(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
        <span className="text-lg font-semibold muted">mL</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {WATER_SIZES.map(({ label, ml: size, Icon }) => (
          <button key={label} type="button" className="press flex flex-col items-center gap-1 rounded-2xl px-2 py-3" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => setMl(String(Math.min(5000, amount + size)))}>
            <span style={{ color: "var(--blue)" }}>
              <Icon size={label === "Large bottle" ? 24 : 20} />
            </span>
            <span className="whitespace-nowrap text-[12px] font-bold">+1 {label}</span>
            <span className="num text-[11px] muted">{size} mL</span>
          </button>
        ))}
      </div>
      <button type="button" className="hit press mx-auto mt-2 block py-1 text-[12px] font-semibold muted" onClick={() => setMl("")}>
        Clear
      </button>
      {error ? (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </BottomSheet>
  );
}
