"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadGraffiti } from "@/lib/actions";
import { ALL_BADGES, earnedCount, type BadgeProgress } from "@/lib/badges";
import { longDate } from "@/lib/dates";
import { CATEGORY_SHAPE, jewelItems, nextJewel, type JewelItem } from "@/lib/jewels";
import type { GraffitiEntry } from "@/lib/types";
import { Jewel, SHAPE_PATH } from "./Jewel";
import { NextUp } from "./BadgesScreen";
import { LineIcon } from "./lineIcons";
import { md } from "./motion";

const GOAL_LABEL: Record<string, string> = { gain: "Bulk", lose: "Cut", maintain: "Maintain" };
const PER_SHELF = 4;

/** Brushed-concrete grain as a tiny SVG (fractal noise, stretched sideways for the brushed look). */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9 .18' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/**
 * v2.17 Trophy wall on Profile (was the v2.16 badge shelf + the v2.7 "Graffiti wall"): a dark
 * gallery wall with a brushed-concrete grain and soft spotlight pools. Earned badges hang as the
 * v2.16 jewellery shields on small lit plinths along shelves edged with a thin gold rule; locked
 * ones are engraved outlines with their progress traced in ember. Food Battle crowns get their own
 * shelf once there is one. Same data and taps as before: every badge opens /badges, "Next up" sits
 * underneath. The wall stays dark in both themes (a lit gallery reads as premium on bone too).
 */
export default function TrophyWall({ progress, delay = 0 }: { progress: BadgeProgress; delay?: number }) {
  const got = earnedCount(progress);
  const total = ALL_BADGES.length;
  const items = jewelItems(progress);
  const next = nextJewel(progress);
  const shelves: JewelItem[][] = [];
  for (let i = 0; i < items.length; i += PER_SHELF) shelves.push(items.slice(i, i + PER_SHELF));

  const [crowns, setCrowns] = useState<{ total: number; recent: GraffitiEntry[] } | null>(null);
  useEffect(() => {
    void loadGraffiti()
      .then(setCrowns)
      .catch(() => setCrowns({ total: 0, recent: [] }));
  }, []);

  return (
    <section
      aria-label={`Trophy wall: ${got} of ${total} badges earned`}
      className="relative mt-[26px] overflow-hidden rounded-[26px]"
      style={{
        background: "radial-gradient(120% 70% at 50% -10%, #2a2420 0%, #151315 45%, #0b0a0c 100%)",
        boxShadow: "0 0 0 1px rgba(217,184,114,.16), inset 0 1px 0 rgba(255,255,255,.05), 0 18px 40px rgba(0,0,0,.28)",
        color: "#f4f1ea",
      }}
    >
      {/* grain */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: GRAIN, backgroundSize: "220px 220px", mixBlendMode: "screen", opacity: 0.9 }} />
      <div className="relative flex flex-col px-3.5 pb-4 pt-[18px]">
        {/* header */}
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: ".22em", color: "#d9b872" }}>
              Collection
            </span>
            <h2 className="text-[21px] font-semibold" style={{ letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Trophy wall
            </h2>
          </div>
          <Link href="/badges" className="press -my-2 inline-flex min-h-11 items-center gap-1 text-[13.5px]" style={{ color: "rgba(244,241,234,.72)" }} aria-label={`All badges: ${got} of ${total} earned`}>
            <span className="num">
              <b className="font-semibold" style={{ color: "#f4f1ea" }}>
                {got}
              </b>{" "}
              of {total}
            </span>
            <LineIcon name="chev" size={14} />
          </Link>
        </div>
        <div className="mx-1 mt-2.5 h-px overflow-hidden" style={{ background: "rgba(244,241,234,.1)" }} role="progressbar" aria-label="Badges earned" aria-valuemin={0} aria-valuemax={total} aria-valuenow={got}>
          <div className="m-growx h-full" style={md(delay + 300, { width: `${Math.max(got ? 2 : 0, (got / total) * 100)}%`, background: "linear-gradient(90deg, #a8823a, #d9b872 60%, #ff8b5e)" })} />
        </div>

        {/* shelves */}
        <div className="mt-2 flex flex-col">
          {shelves.map((row, r) => (
            <div key={r} className="relative pt-4">
              <div className="grid grid-cols-4">
                {row.map((x, i) => (
                  <Slot key={x.id} item={x} delay={delay + 400 + (r * PER_SHELF + i) * 70} />
                ))}
              </div>
              <Shelf />
            </div>
          ))}
          {crowns && crowns.total > 0 ? <CrownShelf total={crowns.total} recent={crowns.recent} delay={delay + 1300} /> : null}
        </div>

        <div className="mx-1 mt-4 rounded-2xl px-3.5 py-3" style={{ background: "rgba(244,241,234,.05)", boxShadow: "inset 0 0 0 1px rgba(244,241,234,.07)", ["--track" as string]: "rgba(244,241,234,.12)", ["--ink" as string]: "#f4f1ea", ["--muted" as string]: "rgba(244,241,234,.6)" } as React.CSSProperties}>
          <NextUp next={next} bare />
        </div>
      </div>
    </section>
  );
}

/** One mount: a spotlight pool from above, the jewel (or its engraved outline), a small plinth, the name. */
function Slot({ item: x, delay }: { item: JewelItem; delay: number }) {
  const label = x.got ? `${x.badge.name}, ${x.tier} badge` : `${x.badge.name}, locked: ${Math.min(x.value, x.badge.need)} of ${x.badge.need}`;
  return (
    <Link href="/badges" className="press relative flex flex-col items-center text-center" aria-label={label} style={{ color: "inherit" }}>
      {/* spotlight pool */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-18px] h-[118px] w-[92px] -translate-x-1/2"
        style={{
          background: x.got ? "radial-gradient(50% 60% at 50% 30%, rgba(255,232,196,.2), rgba(255,232,196,.06) 55%, transparent 75%)" : "radial-gradient(50% 60% at 50% 30%, rgba(255,255,255,.06), transparent 70%)",
          filter: "blur(2px)",
        }}
      />
      <span className="relative grid h-[62px] w-[62px] place-items-center">
        {x.got ? <Jewel category={x.category} tier={x.tier} size={56} delay={delay} /> : <Engraved item={x} size={52} />}
      </span>
      {/* plinth */}
      <span
        aria-hidden="true"
        className="relative mt-1 block h-[7px] w-[42px] rounded-[2px]"
        style={{
          background: x.got ? "linear-gradient(180deg, #3a332c, #1c1917)" : "linear-gradient(180deg, #26221f, #151315)",
          boxShadow: x.got ? "inset 0 1px 0 rgba(251,231,168,.35), 0 3px 6px rgba(0,0,0,.5)" : "inset 0 1px 0 rgba(255,255,255,.06), 0 3px 6px rgba(0,0,0,.4)",
        }}
      />
      <span className="relative mt-1.5 line-clamp-2 min-h-[26px] px-0.5 text-[10.5px] font-medium leading-[13px]" style={{ color: x.got ? "#f4f1ea" : "rgba(244,241,234,.45)" }}>
        {x.badge.name}
      </span>
      <span className="relative text-[9px] font-semibold uppercase" style={{ letterSpacing: ".16em", color: x.got ? "#d9b872" : "#ff8b5e" }}>
        {x.got ? x.tier : `${Math.min(x.value, x.badge.need)} / ${x.badge.need}`}
      </span>
    </Link>
  );
}

/** A locked slot: the badge's frame cut into the wall (dark groove + a highlight below), progress in ember. */
function Engraved({ item: x, size }: { item: JewelItem; size: number }) {
  const frame = SHAPE_PATH[CATEGORY_SHAPE[x.category]];
  const f = Math.max(0, Math.min(1, x.fraction));
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ overflow: "visible" }}>
      <path d={frame} fill="rgba(0,0,0,.28)" />
      <path d={frame} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="2" transform="translate(0 1.4)" />
      <path d={frame} fill="none" stroke="rgba(0,0,0,.75)" strokeWidth="2.4" />
      <g transform="translate(50 50) scale(.8) translate(-50 -50)">
        <path d={frame} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1.2" strokeDasharray="2 3" />
      </g>
      {f > 0.005 ? <path d={frame} fill="none" stroke="#ff5b1f" strokeOpacity=".85" strokeWidth="2.4" strokeLinecap="round" pathLength={1} strokeDasharray={`${Math.round(f * 100) / 100} 2`} /> : null}
    </svg>
  );
}

/** The shelf under each row: a thin gold rule with a soft shadow falling onto the wall. */
function Shelf() {
  return (
    <div aria-hidden="true" className="relative mx-1 mt-2">
      <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(217,184,114,.25) 8%, #d9b872 50%, rgba(217,184,114,.25) 92%, transparent)" }} />
      <div className="h-[10px]" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.45), transparent)" }} />
    </div>
  );
}

/** Food Battle crowns (the old Graffiti wall data): a gold crown trophy and the last wins as engraved plaques. */
function CrownShelf({ total, recent, delay }: { total: number; recent: GraffitiEntry[]; delay: number }) {
  return (
    <div className="relative pt-4">
      <div className="flex items-end gap-3 px-1">
        <div className="flex shrink-0 flex-col items-center">
          <span className="m-pop relative grid h-[58px] w-[58px] place-items-center" style={md(delay)}>
            <span aria-hidden="true" className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(50% 50% at 50% 45%, rgba(255,214,120,.28), transparent 70%)" }} />
            <CrownTrophy />
          </span>
          <span aria-hidden="true" className="mt-1 block h-[7px] w-[42px] rounded-[2px]" style={{ background: "linear-gradient(180deg, #3a332c, #1c1917)", boxShadow: "inset 0 1px 0 rgba(251,231,168,.35), 0 3px 6px rgba(0,0,0,.5)" }} />
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <p className="text-[14px] font-semibold">
            <span className="num" style={{ color: "#d9b872" }}>
              {total}
            </span>{" "}
            food battle crown{total === 1 ? "" : "s"}
          </p>
          {recent.length ? (
            <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {recent.map((w, i) => (
                <span key={`${w.group_id}-${w.date}-${i}`} className="shrink-0 rounded-md px-2 py-1" style={{ background: "linear-gradient(180deg, rgba(217,184,114,.14), rgba(217,184,114,.05))", boxShadow: "inset 0 0 0 1px rgba(217,184,114,.28)" }}>
                  <span className="block text-[9px] font-semibold uppercase" style={{ letterSpacing: ".12em", color: "#d9b872" }}>
                    {longDate(w.date)}
                  </span>
                  <span className="block max-w-[140px] truncate text-[11.5px] font-semibold">{w.group_name}</span>
                  <span className="block text-[10px]" style={{ color: "rgba(244,241,234,.6)" }}>
                    {Math.round(w.score)} pts · {GOAL_LABEL[w.goal_type] ?? w.goal_type}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <Shelf />
    </div>
  );
}

function CrownTrophy() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,.5))" }}>
      <defs>
        <linearGradient id="tw-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a8" />
          <stop offset=".45" stopColor="#d9b872" />
          <stop offset="1" stopColor="#5e4518" />
        </linearGradient>
      </defs>
      <path d="M8 16 L16 24 L24 10 L32 24 L40 16 L37 36 L11 36 Z" fill="url(#tw-gold)" stroke="#fbe7a8" strokeOpacity=".7" strokeWidth="1" strokeLinejoin="round" />
      <rect x="11" y="37.5" width="26" height="4" rx="1.2" fill="url(#tw-gold)" />
      <circle cx="24" cy="27" r="3.2" fill="#ff5b1f" stroke="#ffb08a" strokeWidth=".8" />
      <circle cx="8" cy="15" r="2" fill="#fbe7a8" />
      <circle cx="24" cy="9" r="2" fill="#fbe7a8" />
      <circle cx="40" cy="15" r="2" fill="#fbe7a8" />
    </svg>
  );
}
