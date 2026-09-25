"use client";

import { useEffect, useState } from "react";
import { loadGraffiti } from "@/lib/actions";
import { longDate } from "@/lib/dates";
import type { GraffitiEntry } from "@/lib/types";
import { Crown } from "./icons";
import { Card, Rise } from "./ui";

const GOAL_LABEL: Record<string, string> = { gain: "Bulk", lose: "Cut", maintain: "Maintain" };

/**
 * Profile's "Graffiti wall" (docs/food-battle-spec.md): total Squad Food Battle crowns, plus the
 * last 7 wins. Quiet when the user has never won one — no empty-state nagging.
 */
export default function GraffitiWall() {
  const [data, setData] = useState<{ total: number; recent: GraffitiEntry[] } | null>(null);

  useEffect(() => {
    void loadGraffiti()
      .then(setData)
      .catch(() => setData({ total: 0, recent: [] }));
  }, []);

  if (!data || data.total === 0) return null;

  return (
    <Rise index={1}>
      <Card padding={0}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)", color: "var(--ink)" }} aria-hidden="true">
            <Crown size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-bold">Graffiti wall</span>
            <span className="text-[12px] muted">
              <span className="num font-extrabold" style={{ color: "var(--ink)" }}>
                {data.total}
              </span>{" "}
              food battle crown{data.total === 1 ? "" : "s"} won
            </span>
          </span>
        </div>
        {data.recent.length ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3.5">
            {data.recent.map((w, i) => (
              <span key={`${w.group_id}-${w.date}-${i}`} className="graffiti-card shrink-0" style={{ padding: "10px 12px", borderRadius: 16 }}>
                <span className="graffiti-tag block text-[10px] uppercase tracking-wide" style={{ color: "#ffd23c", opacity: 0.9 }}>
                  {longDate(w.date)}
                </span>
                <span className="graffiti-name mt-0.5 block text-[15px]">{w.group_name}</span>
                <span className="mt-0.5 block text-[11px] font-semibold" style={{ color: "#fff", opacity: 0.85 }}>
                  {Math.round(w.score)} pts · {GOAL_LABEL[w.goal_type] ?? w.goal_type}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </Rise>
  );
}
