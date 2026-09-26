"use client";

import { exerciseHistory, personalBest, round1 } from "@/lib/e1rm";
import { regionsFor } from "@/lib/training";
import { parseIso } from "@/lib/dates";
import type { Workout } from "@/lib/types";
import SubPage from "../SubPage";
import { CountUp, MRise, STAGGER } from "../motion";
import MuscleMap, { MapLegend } from "./MuscleMap";
import ShareButton from "./ShareButton";
import { CardLabel, DrawLine, PCard, ProLocked } from "./kit";

const dm = (d: string) => parseIso(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const setText = (kg: number | null, reps: number) => (kg != null ? `${round1(kg)} kg × ${reps}` : `${reps} reps`);

/** v2.13 PR chart for one exercise (spec §12): best set per session, estimated 1RM (Epley), PR badges, muscles. */
export default function ExerciseStats({ name, lifts, pro }: { name: string; lifts: Workout[]; pro: boolean }) {
  const h = exerciseHistory(lifts, name);
  const pb = personalBest(h);
  const split = regionsFor(name);
  const pts = h.points.slice(-30);
  const values = pts.map((p) => (h.weighted ? p.best.e1rm : p.best.reps));
  const prs = h.points.filter((p) => p.pr).length;

  if (!pro)
    return (
      <SubPage title={name} back="/train">
        <ProLocked feature="PR charts" />
      </SubPage>
    );

  return (
    <SubPage title={name} back="/train">
      <MRise delay={0}>
        <PCard label="Personal best">
          <CardLabel pro right={pb ? <ShareButton compact label="Share" filename="locked-in-pr.png" card={() => ({ kind: "pr", exercise: name, value: pb.best.kg != null ? `${round1(pb.best.kg)} kg` : `${pb.best.reps} reps`, sub: pb.best.kg != null ? `${pb.best.reps} reps · est. 1RM ${round1(pb.best.e1rm)} kg` : "bodyweight", date: dm(pb.date) })} /> : null}>
            Personal best
          </CardLabel>
          {pb ? (
            <>
              <p className="num font-extrabold" style={{ fontSize: 40, letterSpacing: "-1.5px", lineHeight: 1.05 }}>
                {h.weighted ? <CountUp value={round1(pb.best.e1rm)} decimals={1} delay={200} format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))} /> : <CountUp value={pb.best.reps} delay={200} />}
                <span className="ml-1 text-[15px] font-semibold muted">{h.weighted ? "kg est. 1RM" : "reps"}</span>
              </p>
              <p className="text-[13px] muted">
                Best set {setText(pb.best.kg, pb.best.reps)} on {dm(pb.date)} · {h.points.length} session{h.points.length === 1 ? "" : "s"} · {prs} PR{prs === 1 ? "" : "s"}
              </p>
            </>
          ) : (
            <p className="text-[14px] muted">No sets logged for this exercise yet.</p>
          )}
        </PCard>
      </MRise>

      {values.length >= 2 ? (
        <MRise delay={STAGGER}>
          <PCard label={h.weighted ? "Estimated 1RM" : "Best reps"}>
            <CardLabel>{h.weighted ? "Estimated 1RM · Epley" : "Best reps per session"}</CardLabel>
            <DrawLine values={values} highlight={pts.map((p) => p.pr)} label={`${h.weighted ? "Estimated one-rep max" : "Best reps"} over ${values.length} sessions, from ${values[0]} to ${values[values.length - 1]}`} delay={STAGGER + 200} height={120} />
            <div className="flex justify-between text-[11px] muted">
              <span>{dm(pts[0].date)}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--orange)" }} /> PR
              </span>
              <span>{dm(pts[pts.length - 1].date)}</span>
            </div>
            {h.weighted ? <p className="text-[11px] muted">Estimated 1RM = weight × (1 + reps ÷ 30). It&rsquo;s an estimate, not a max to attempt.</p> : null}
          </PCard>
        </MRise>
      ) : null}

      <MRise delay={STAGGER * 2}>
        <PCard label="Muscles">
          <CardLabel pro>Muscles worked</CardLabel>
          {split.primary.length ? (
            <>
              <MuscleMap mode={{ kind: "split", ...split }} delay={STAGGER * 2 + 200} />
              <MapLegend mode="split" />
            </>
          ) : (
            <p className="text-[13px] muted">This one isn&rsquo;t in the library, so there&rsquo;s no map for it.</p>
          )}
        </PCard>
      </MRise>

      {h.points.length ? (
        <MRise delay={STAGGER * 3}>
          <PCard label="Sessions">
            <CardLabel>Sessions</CardLabel>
            <ul className="m-0 flex list-none flex-col p-0">
              {[...h.points].reverse().slice(0, 20).map((p, i) => (
                <li key={p.workoutId} className="flex items-center justify-between gap-2 py-2.5 text-[14px]" style={{ borderTop: i ? "1px solid var(--hair)" : 0 }}>
                  <span className="flex items-center gap-2">
                    {dm(p.date)}
                    {p.pr ? (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
                        PR
                      </span>
                    ) : null}
                  </span>
                  <span className="num muted">
                    {setText(p.best.kg, p.best.reps)}
                    {h.weighted ? ` · ${round1(p.best.e1rm)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </PCard>
        </MRise>
      ) : null}
    </SubPage>
  );
}
