"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createFromTemplate, deleteRoutine, setActiveRoutine } from "@/lib/platformActions";
import { REGIONS, REGION_LABEL } from "@/lib/muscles";
import { TEMPLATES, WEEKDAYS, WEEKLY_SETS_HIGH, WEEKLY_SETS_LOW, dayMinutes, daySets, heat, isoWeekday, regionSets, todaysDay, volumeBand, type Routine } from "@/lib/training";
import { loggedExercises } from "@/lib/e1rm";
import { addDays, weekStart } from "@/lib/dates";
import type { Workout } from "@/lib/types";
import SubPage from "../SubPage";
import { MRise, STAGGER, md } from "../motion";
import { LineIcon } from "../lineIcons";
import { Spinner, Trash } from "../icons";
import { BottomSheet, ErrorNote } from "../ui";
import MuscleMap, { MapLegend } from "./MuscleMap";
import { CardLabel, ComingSoon, PCard, ProLocked } from "./kit";
import { invalidateHomeEntries } from "./HomeEntries";

const BAND_TEXT = { none: "not trained", low: "below 10", good: "in range", high: "above 20" } as const;
const BAND_COLOR = { none: "var(--muted)", low: "var(--orange-ink)", good: "var(--green-ink)", high: "var(--blue-ink)" } as const;

/**
 * v2.13 Training (spec §12): today's session, the week planner, this week's muscles (heat map with
 * the 10–20 sets guideline), routines + templates, and PR charts.
 */
export default function TrainScreen({ pro, available, routines, workouts, lifts, today }: { pro: boolean; available: boolean; routines: Routine[]; workouts: Workout[]; lifts: Workout[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null);
  const active = routines.find((r) => r.active) ?? null;
  const session = todaysDay(active, today);
  const ws = weekStart(today);
  const sets = regionSets(workouts, ws, addDays(ws, 6));
  const trained = REGIONS.filter((r) => sets[r] > 0).sort((a, b) => sets[b] - sets[a]);
  const exercises = loggedExercises(lifts).slice(0, 12);
  const wd = isoWeekday(today);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>) {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) setError((r as { error?: string }).error ?? "Something went wrong");
      else {
        invalidateHomeEntries();
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  if (!pro)
    return (
      <SubPage title="Training" back="/progress">
        <ProLocked feature="Routines, PR charts and the muscle map" />
      </SubPage>
    );

  return (
    <SubPage title="Training" back="/progress">

      {/* ---- today's session ---- */}
      <MRise delay={STAGGER}>
        <PCard label="Today's session">
          <CardLabel pro>Today&rsquo;s session</CardLabel>
          {!available ? (
            <p className="text-[14px] muted">Routines are coming with the next update. Your logged workouts still count below.</p>
          ) : session && active ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[26px] font-semibold" style={{ letterSpacing: "-0.8px" }}>
                  {session.day.name}
                </p>
                <span className="num text-[13px] muted">
                  {session.day.exercises.length} exercises · {daySets(session.day)} sets · ~{dayMinutes(session.day)} min
                </span>
              </div>
              <p className="text-[13px] muted">{session.day.exercises.map((x) => x.name).join(" · ")}</p>
              <Link href={`/train/session?routine=${active.id}&day=${session.index}`} className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
                <LineIcon name="flame" size={18} />
                Start workout
              </Link>
            </>
          ) : active ? (
            <p className="text-[15px]">Rest day on {active.name}. Recovery is part of the plan.</p>
          ) : (
            <p className="text-[15px]">Pick a template or build a routine and your session shows up here every day.</p>
          )}
        </PCard>
      </MRise>

      {/* ---- planner ---- */}
      {available && active ? (
        <MRise delay={STAGGER * 2}>
          <PCard label="This week's plan">
            <CardLabel right={<Link href={`/train/routine?id=${active.id}`} className="press -my-2 inline-flex min-h-11 items-center text-[13px] font-semibold" style={{ color: "var(--accent)" }}>Edit</Link>}>
              {active.name}
            </CardLabel>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => {
                const idx = active.days.findIndex((x) => x.weekday === i + 1);
                const day = idx >= 0 ? active.days[idx] : null;
                const isToday = i + 1 === wd;
                return (
                  <div key={d} className="m-drop flex flex-col items-center gap-1 rounded-xl px-0.5 py-2" style={md(STAGGER * 2 + 200 + i * 80, { background: isToday ? "var(--card2)" : "transparent", outline: isToday ? "1.5px solid var(--accent)" : "none" })}>
                    <span className="text-[11px] font-semibold muted">{d}</span>
                    <span className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold" style={{ background: day ? "var(--accent)" : "var(--track)", color: day ? "var(--accent-ink)" : "var(--muted)" }}>
                      {day ? day.name.slice(0, 2) : "–"}
                    </span>
                    <span className="w-full truncate text-center text-[10px] muted">{day ? day.name : "Rest"}</span>
                  </div>
                );
              })}
            </div>
          </PCard>
        </MRise>
      ) : null}

      {/* ---- muscles this week ---- */}
      <MRise delay={STAGGER * 3}>
        <PCard label="Muscles trained this week">
          <CardLabel pro>Muscles this week</CardLabel>
          <MuscleMap mode={{ kind: "heat", heat: Object.fromEntries(REGIONS.map((r) => [r, heat(sets[r])])) }} delay={STAGGER * 3 + 200} />
          <MapLegend mode="heat" />
          {trained.length ? (
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1.5 p-0">
              {trained.map((r) => (
                <li key={r} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate">{REGION_LABEL[r]}</span>
                  <span className="num shrink-0 font-semibold" style={{ color: BAND_COLOR[volumeBand(sets[r])] }}>
                    {sets[r]} sets
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] muted">Log a gym or bodyweight session and the map fills in.</p>
          )}
          <p className="border-t pt-3 text-[12px] leading-snug muted" style={{ borderColor: "var(--hair)" }}>
            Research on muscle growth points to about {WEEKLY_SETS_LOW}–{WEEKLY_SETS_HIGH} hard sets per muscle per week. A secondary muscle counts as half a set.{" "}
            {trained.length ? `${trained.filter((r) => volumeBand(sets[r]) === "good").length} of ${trained.length} trained muscles are ${BAND_TEXT.good}.` : ""}
          </p>
        </PCard>
      </MRise>

      {/* ---- routines ---- */}
      {!available ? (
        <MRise delay={STAGGER * 4}>
          <ComingSoon what="Routines and the planner" />
        </MRise>
      ) : (
        <>
          <MRise delay={STAGGER * 4}>
            <PCard label="Your routines">
              <CardLabel right={<Link href="/train/routine" className="press -my-2 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--accent)" }}><LineIcon name="plus" size={15} /> Build your own</Link>}>
                Your routines
              </CardLabel>
              {routines.length === 0 ? <p className="text-[14px] muted">None yet. Start from a template below or build your own.</p> : null}
              {routines.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--card2)" }}>
                  <Link href={`/train/routine?id=${r.id}`} className="press flex min-w-0 flex-1 flex-col" style={{ color: "var(--ink)" }}>
                    <span className="flex items-center gap-2 truncate text-[15px] font-semibold">
                      {r.name}
                      {r.active ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--green-bg)", color: "var(--green-ink)" }}>
                          ACTIVE
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[12px] muted">{r.days.map((d) => (d.weekday ? `${WEEKDAYS[d.weekday - 1]} ${d.name}` : d.name)).join(" · ")}</span>
                  </Link>
                  {r.active ? null : (
                    <button type="button" className="press h-9 shrink-0 rounded-full px-3 text-[12px] font-bold" style={{ background: "var(--pcard)", color: "var(--ink)", border: 0 }} disabled={!!busy} onClick={() => void run(`act-${r.id}`, () => setActiveRoutine(r.id))}>
                      {busy === `act-${r.id}` ? <Spinner size={12} /> : "Use"}
                    </button>
                  )}
                  <button type="button" aria-label={`Delete ${r.name}`} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => setConfirmDelete(r)}>
                    <Trash size={16} />
                  </button>
                </div>
              ))}
              {active ? (
                <button type="button" className="press self-start text-[12px] font-semibold underline muted" style={{ background: "none", border: 0, padding: "4px 0" }} disabled={!!busy} onClick={() => void run("off", () => setActiveRoutine(null))}>
                  Stop using a routine
                </button>
              ) : null}
            </PCard>
          </MRise>

          <MRise delay={STAGGER * 5}>
            <PCard label="Templates">
              <CardLabel pro>Start from a template</CardLabel>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t, i) => (
                  <button key={t.key} type="button" className="press m-drop flex min-h-[92px] flex-col items-start justify-between rounded-2xl p-3 text-left" style={md(STAGGER * 5 + 200 + i * 100, { background: "var(--card2)", border: 0, color: "var(--ink)" })} disabled={!!busy} onClick={() => void run(`t-${t.key}`, () => createFromTemplate(t.key))}>
                    <span className="text-[14px] font-semibold leading-tight">{t.name}</span>
                    <span className="text-[11px] leading-snug muted">{busy === `t-${t.key}` ? "Adding…" : t.sub}</span>
                  </button>
                ))}
              </div>
            </PCard>
          </MRise>
        </>
      )}

      {/* ---- PR charts ---- */}
      <MRise delay={STAGGER * 6}>
        <PCard label="PR charts">
          <CardLabel pro>PR charts</CardLabel>
          {exercises.length ? (
            <div className="flex flex-col">
              {exercises.map((x, i) => (
                <Link key={x.name} href={`/train/exercise?name=${encodeURIComponent(x.name)}`} className="press flex min-h-12 items-center justify-between gap-3" style={{ color: "var(--ink)", borderTop: i ? "1px solid var(--hair)" : 0 }}>
                  <span className="truncate text-[15px]">{x.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] muted">
                    {x.sessions} session{x.sessions === 1 ? "" : "s"}
                    <LineIcon name="chev" size={14} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13px] muted">Log sets in a gym or bodyweight workout to see your best sets and estimated 1RM.</p>
          )}
        </PCard>
      </MRise>

      <ErrorNote text={error} />

      <BottomSheet
        open={confirmDelete !== null}
        title="Delete this routine?"
        subtitle={confirmDelete?.name}
        onClose={() => setConfirmDelete(null)}
        primary={{
          label: busy === "del" ? "Deleting…" : "Delete routine",
          disabled: busy === "del",
          onClick: () => {
            const r = confirmDelete;
            if (!r) return;
            void run("del", () => deleteRoutine(r.id)).then(() => setConfirmDelete(null));
          },
        }}
      >
        <p className="text-[14px] muted">Your logged workouts stay. Only the plan is removed.</p>
      </BottomSheet>
    </SubPage>
  );
}
