"use client";

import { useEffect, useState } from "react";
import { Jewel } from "../Jewel";
import { awardEventBadge } from "@/lib/social/actions";
import { eventWhen, type EventProgress, type SeasonalEvent } from "@/lib/social/seasonal";

type Row = { event: SeasonalEvent; progress: EventProgress; earned: boolean; live: boolean };

function EventJewel({ e, locked, size = 72, progress = 0 }: { e: SeasonalEvent; locked: boolean; size?: number; progress?: number }) {
  return <Jewel category="special" tier="gold" size={size} locked={locked} progress={progress} metal={e.badge.metal} gem={e.badge.gem} shape={e.badge.shape} label={e.badge.name} />;
}

export default function EventsScreen({ today, rows, earned, available }: { today: string; rows: Row[]; earned: SeasonalEvent[]; available: boolean }) {
  const [got, setGot] = useState<Set<string>>(() => new Set(rows.filter((r) => r.earned).map((r) => r.event.id)));
  const [fresh, setFresh] = useState<SeasonalEvent | null>(null);

  // Goal met inside the window and not recorded yet: record it (once) and show the unlock.
  useEffect(() => {
    if (!available) return;
    for (const r of rows) {
      if (r.live && r.progress.done && !got.has(r.event.id)) {
        void awardEventBadge(r.event.id).then((res) => {
          if (res.ok) {
            setGot((g) => new Set(g).add(r.event.id));
            setFresh(r.event);
          }
        });
        break;
      }
    }
  }, [rows, got, available]);

  const all = [...earned, ...(fresh && !earned.some((e) => e.id === fresh.id) ? [fresh] : [])];

  return (
    <>
      {fresh ? (
        <section role="status" className="m-rise flex flex-col items-center gap-2 text-center" style={{ background: "linear-gradient(180deg, #0B0B0C, #1a1510)", color: "#F4F1EA", borderRadius: 26, padding: 24 }}>
          <EventJewel e={fresh} locked={false} size={120} />
          <p className="display text-[24px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
            {fresh.badge.name}
          </p>
          <p className="serif text-[17px] italic" style={{ opacity: 0.8 }}>
            Limited edition. It won&rsquo;t come back.
          </p>
        </section>
      ) : null}

      {rows.length ? (
        rows.map(({ event: e, progress: p, live }) => {
          const done = got.has(e.id);
          return (
            <article key={e.id} className="flex gap-4" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
              <EventJewel e={e} locked={!done} size={64} progress={p.fraction} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[15.5px] font-bold">{e.title}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase" style={{ letterSpacing: "0.06em", background: live ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--card2)", color: live ? "var(--accent)" : "var(--muted)" }}>
                    {live ? "Live" : "Soon"}
                  </span>
                </div>
                <p className="text-[12.5px] leading-4 muted">{e.blurb}</p>
                {live ? (
                  <>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.fraction * 100}%`, background: done ? "#D9B872" : "var(--accent)" }} />
                    </div>
                    <p className="text-[12.5px] font-semibold">{done ? `Earned: ${e.badge.name}` : p.line}</p>
                  </>
                ) : null}
                <p className="text-[12px] muted">{eventWhen(e, today)}</p>
              </div>
            </article>
          );
        })
      ) : (
        <p className="px-1 text-[14px] muted">No events running right now. The next one shows up here a few weeks ahead.</p>
      )}

      {!available ? <p className="px-1 text-[12.5px] muted">Badges are saved to your account after the next server update. Progress already counts.</p> : null}

      {all.length ? (
        <section aria-label="Limited editions" className="flex flex-col gap-3" style={{ background: "#0B0B0C", color: "#F4F1EA", borderRadius: 22, padding: 18 }}>
          <p className="text-[15px] font-semibold">Your limited editions</p>
          <div className="flex flex-wrap gap-4">
            {all.map((e) => (
              <div key={e.id} className="flex w-[84px] flex-col items-center gap-1.5 text-center">
                <EventJewel e={e} locked={false} size={64} />
                <span className="text-[11.5px] font-semibold" style={{ opacity: 0.8 }}>
                  {e.badge.name}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
