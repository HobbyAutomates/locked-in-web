"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FREEZE_TOKENS_KEY } from "@/lib/social/freezes";

/**
 * v2.18 D5: a small "2 freezes" chip under the Home streak, linking to /streak. It reads the count
 * the daily freeze sync left on this device (SocialBoot), so it costs no request; hidden until the
 * first sync (or without schema_v44).
 */
export default function FreezeChip() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const v = localStorage.getItem(FREEZE_TOKENS_KEY);
        setN(v == null ? null : Math.max(0, Math.min(3, Number(v) || 0)));
      } catch {
        setN(null);
      }
    };
    read();
    window.addEventListener(FREEZE_TOKENS_KEY, read);
    return () => window.removeEventListener(FREEZE_TOKENS_KEY, read);
  }, []);
  if (n == null) return null;
  return (
    <Link href="/streak" className="press mt-2 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold" style={{ background: "var(--card)", color: "var(--ink)", boxShadow: "var(--pcard-ring)" }} aria-label={`${n} streak ${n === 1 ? "freeze" : "freezes"}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2a7fb8" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" />
      </svg>
      {n === 0 ? "No freezes" : `${n} ${n === 1 ? "freeze" : "freezes"}`}
    </Link>
  );
}
