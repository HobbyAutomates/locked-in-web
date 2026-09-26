"use client";

import Link from "next/link";
import { REGIONS } from "@/lib/muscles";
import { heat, regionSets, WEEKLY_SETS_LOW } from "@/lib/training";
import { addDays, longDate, weekStart } from "@/lib/dates";
import { totalsFor } from "@/lib/totals";
import { MEASURES, type Measurement } from "@/lib/body";
import type { Meal, ProgressPhoto, Workout } from "@/lib/types";
import { md } from "../motion";
import { LineIcon } from "../lineIcons";
import MuscleMap from "./MuscleMap";
import ShareButton from "./ShareButton";
import { CardLabel, PCard, ProChip } from "./kit";

/**
 * v2.13 additions to Progress (spec §11–13): Training (this week's muscle map → /train), Body
 * (measurements + photos → their managers), Recaps, and the share row for streak / today.
 */

export function TrainingCard({ workouts, today, b }: { workouts: Workout[]; today: string; b: number }) {
  const ws = weekStart(today);
  const sets = regionSets(workouts, ws, addDays(ws, 6));
  const trained = REGIONS.filter((r) => sets[r] > 0);
  const inRange = trained.filter((r) => sets[r] >= WEEKLY_SETS_LOW).length;
  const total = Math.round(REGIONS.reduce((a, r) => a + sets[r], 0));
  return (
    <Link href="/train" className="press block" style={{ color: "var(--ink)" }} aria-label="Training: routines, muscle map and PR charts">
      <PCard label="Training">
        <CardLabel pro right={<LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />}>
          Training · this week
        </CardLabel>
        <div className="flex items-center gap-4">
          <div className="w-[46%] shrink-0">
            <MuscleMap mode={{ kind: "heat", heat: Object.fromEntries(REGIONS.map((r) => [r, heat(sets[r])])) }} delay={b + 200} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="num text-[30px] font-extrabold leading-none" style={{ letterSpacing: "-1px" }}>
              {trained.length}
              <span className="text-[14px] font-semibold muted"> / 18 muscles</span>
            </p>
            <p className="text-[13px] muted">
              {total ? `${total} sets · ${inRange} muscle${inRange === 1 ? "" : "s"} at 10+ sets` : "Nothing trained yet this week"}
            </p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              Routines, planner & PR charts
            </p>
          </div>
        </div>
      </PCard>
    </Link>
  );
}

export function BodyCard({ measurements, photos, b }: { measurements: Measurement[] | null; photos: ProgressPhoto[]; b: number }) {
  const latest = measurements?.[0] ?? null;
  const shown = latest ? MEASURES.filter((m) => latest[m.key] != null).slice(0, 3) : [];
  return (
    <PCard label="Body">
      <CardLabel>Body</CardLabel>
      <Link href="/progress/body" className="press flex min-h-12 items-center justify-between gap-3 rounded-2xl p-3" style={{ background: "var(--card2)", color: "var(--ink)" }}>
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold">Body measurements</span>
          <span className="num truncate text-[12px] muted">
            {measurements == null ? "Coming with the next update" : shown.length ? shown.map((m) => `${m.label} ${latest?.[m.key]}${m.unit === "%" ? "%" : " cm"}`).join(" · ") : "Waist, chest, hips, arms and more"}
          </span>
        </span>
        <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
      </Link>
      <Link href="/progress/photos" className="press flex min-h-12 items-center justify-between gap-3 rounded-2xl p-3" style={{ background: "var(--card2)", color: "var(--ink)" }}>
        <span className="flex min-w-0 items-center gap-3">
          {photos.length ? (
            <span className="flex -space-x-3">
              {photos.slice(0, 3).map((p, i) =>
                p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.url} alt="" className="m-pop h-10 w-8 rounded-lg object-cover" style={md(b + 300 + i * 120, { boxShadow: "0 0 0 2px var(--card2)" })} />
                ) : null,
              )}
            </span>
          ) : null}
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 text-[15px] font-semibold">Progress photos</span>
            <span className="truncate text-[12px] muted">{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} · before / after` : "Private until you share one"}</span>
          </span>
        </span>
        <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
      </Link>
    </PCard>
  );
}

export function RecapsCard() {
  return (
    <PCard label="Recaps">
      <CardLabel pro>Recaps</CardLabel>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["weekly", "Last week", "Mon–Sun, slide by slide"],
            ["monthly", "Last month", "Your month as a story"],
          ] as const
        ).map(([k, t, s]) => (
          <Link key={k} href={`/recap/${k}`} className="press flex min-h-[76px] flex-col justify-between rounded-2xl p-3" style={{ background: "linear-gradient(145deg, var(--cover-a), var(--cover-b))", color: "var(--bg)" }}>
            <LineIcon name="spark" size={18} />
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{t}</span>
              <span className="text-[11px]" style={{ opacity: 0.7 }}>
                {s}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </PCard>
  );
}

/** Share the streak or today's summary as a story card (no kcal when hide_numbers is on). */
export function ShareRow({ streak, best, meals, today, proteinTarget, calorieTarget, hide, workoutsToday }: { streak: number; best: number; meals: Meal[]; today: string; proteinTarget: number; calorieTarget: number; hide: boolean; workoutsToday: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold muted">
        Share <ProChip />
      </span>
      <ShareButton compact label="Streak" filename="locked-in-streak.png" card={() => ({ kind: "streak", days: streak, best })} />
      <ShareButton
        compact
        label="Today"
        filename="locked-in-today.png"
        card={() => {
          const t = totalsFor(meals, today);
          return {
            kind: "today",
            date: longDate(today),
            stats: [
              { label: "Protein", value: `${Math.round(t.protein)} / ${Math.round(proteinTarget)} g` },
              ...(hide ? [] : [{ label: "Calories", value: `${Math.round(t.calories).toLocaleString("en-IN")} / ${calorieTarget.toLocaleString("en-IN")}` }]),
              { label: "Meals logged", value: String(meals.filter((m) => m.date === today).length) },
              { label: "Workouts", value: String(workoutsToday) },
              { label: "Day streak", value: String(streak) },
            ],
          };
        }}
      />
    </div>
  );
}
