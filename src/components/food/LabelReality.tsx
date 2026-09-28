"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/lib/image";
import type { LabelReport } from "@/lib/types";
import { Rise } from "../ui";

type Check = { checked: boolean; gaps?: { field: string }[]; lines?: string[]; source?: { label: string; url: string } | null; matched_name?: string };

/** One web check per product and numbers per session (reopening a scan from History doesn't re-ask). */
const seen = new Map<string, Promise<Check | null>>();

/**
 * v2.18 A8 label vs reality: after a label or barcode report, one quiet web check of the same product
 * (/api/label-check). When the pack's numbers are more than 20 % off what the web says, a calm note
 * with the source. Nothing shows while it checks, when they agree, or when the web has nothing.
 */
export function LabelReality({ report }: { report: LabelReport }) {
  const [res, setRes] = useState<Check | null>(null);
  // (the fetch below resolves from the per-session cache when this product was already checked)
  const per = report.per_100g;
  const product = report.product;
  const key = `${product}|${per?.calories ?? ""}|${per?.protein_g ?? ""}`;
  useEffect(() => {
    if (!product || !per || per.calories == null) return;
    let live = true;
    let p = seen.get(key);
    if (!p) {
      p = postJson<Check>("/api/label-check", { product, per_100g: { calories: per.calories, protein_g: per.protein_g, carbs_g: per.carbs_g, fat_g: per.fat_g } }).catch(() => null);
      seen.set(key, p);
    }
    void p.then((r) => {
      if (live && r) setRes(r);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per product + numbers
  }, [key]);
  if (!res?.checked || !res.lines?.length) return null;
  return (
    <Rise index={2}>
      <div className="flex gap-3 rounded-[20px] px-4 py-3.5" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }} role="note" aria-label="Label and web numbers differ">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--orange-bg)", color: "var(--orange-ink, var(--orange))" }} aria-hidden="true">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v5M12 16h.01" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Worth a second look</p>
          <p className="mt-0.5 text-[12px] leading-[17px] muted">This pack&apos;s numbers don&apos;t match what the web says about {res.matched_name || "it"}. Labels are allowed some tolerance, so it may be fine.</p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px]">
            {res.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {res.source ? (
            <a href={res.source.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[12px] font-semibold underline" style={{ color: "var(--ink)" }}>
              Source: {res.source.label}
            </a>
          ) : null}
        </div>
      </div>
    </Rise>
  );
}
