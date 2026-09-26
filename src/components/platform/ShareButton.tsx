"use client";

import { useState } from "react";
import { shareCard, type ShareCard } from "@/lib/shareCard";
import { LineIcon } from "../lineIcons";
import { Spinner } from "../icons";
import { ProChip } from "./kit";

/** "Share" → a 1080×1920 story card (spec §13). `card` is built lazily so it's fresh at tap time. */
export default function ShareButton({ card, label = "Share", filename, compact = false, pro = true, tone = "soft" }: { card: () => ShareCard; label?: string; filename?: string; compact?: boolean; pro?: boolean; tone?: "soft" | "solid" | "light" }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setNote(null);
    try {
      const r = await shareCard(card(), filename);
      if (r === "downloaded") setNote("Saved the image. Post it from your gallery.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't make the card");
    } finally {
      setBusy(false);
    }
  }
  const style: React.CSSProperties =
    tone === "solid"
      ? { background: "var(--accent)", color: "var(--accent-ink)", border: 0 }
      : tone === "light"
        ? { background: "rgba(255,255,255,0.16)", color: "#fff", border: 0 }
        : { background: "var(--card2)", color: "var(--ink)", border: 0 };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={`press inline-flex items-center gap-1.5 rounded-full font-semibold ${compact ? "h-9 px-3 text-[13px]" : "h-11 px-4 text-[14px]"}`} style={style} disabled={busy} onClick={() => void go()} aria-label={`${label} as a story image`}>
        {busy ? <Spinner size={14} /> : <LineIcon name="share" size={compact ? 14 : 16} />}
        {label}
        {pro && !compact ? <ProChip /> : null}
      </button>
      {note ? (
        <span role="status" className="text-[12px] muted">
          {note}
        </span>
      ) : null}
    </span>
  );
}
