"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recap } from "@/lib/recap";
import { weightText } from "@/lib/display";
import { CountUp, drawLen, md } from "../motion";
import { LineIcon } from "../lineIcons";
import ShareButton from "./ShareButton";
import { ProChip } from "./kit";

const SLIDE_MS = 5200;

type Slide = { key: string; render: () => React.ReactNode };

/**
 * v2.13 weekly / monthly recap (spec §13): a full-screen story. Slides auto-advance with the premium
 * motion (blur-rise, count-ups, bars growing, lines drawing); tap the left side to go back, the
 * right side to go forward, hold to pause. The last slide shares a story card.
 */
export default function RecapPlayer({ recap, units }: { recap: Recap; units: "metric" | "imperial" }) {
  const router = useRouter();
  const r = recap;
  const word = r.period.kind === "weekly" ? "week" : "month";
  const slides: Slide[] = [
    {
      key: "intro",
      render: () => (
        <Center>
          <p className="m-rise text-[15px] font-semibold uppercase" style={md(100, { letterSpacing: "0.2em", color: "var(--accent2)" })}>
            Your {word} in review
          </p>
          <h1 className="m-rise text-[44px] font-semibold leading-tight" style={md(350, { letterSpacing: "-1.5px" })}>
            {r.period.label}
          </h1>
          <p className="m-rise text-[16px]" style={md(700, { opacity: 0.7 })}>
            Tap to skip ahead, hold to pause.
          </p>
        </Center>
      ),
    },
    {
      key: "days",
      render: () => (
        <Center>
          <Eyebrow>Days logged</Eyebrow>
          <Big>
            <CountUp value={r.daysLogged} delay={300} />
            <span className="text-[28px] font-semibold" style={{ opacity: 0.6 }}>
              {" "}
              / {r.days}
            </span>
          </Big>
          <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(7, r.days)}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: r.days }, (_, i) => (
              <span key={i} className="m-pop rounded-full" style={md(500 + i * (r.days > 7 ? 25 : 90), { width: r.days > 7 ? 16 : 26, height: r.days > 7 ? 16 : 26, background: i < r.daysLogged ? "var(--accent)" : "rgba(255,255,255,0.14)" })} />
            ))}
          </div>
          <Sub>{r.daysLogged === r.days ? "Every single day. Locked in." : r.daysLogged ? "Every logged day is a data point." : `A quiet ${word}. Next one's yours.`}</Sub>
        </Center>
      ),
    },
    {
      key: "workouts",
      render: () => (
        <Center>
          <Eyebrow>Workouts</Eyebrow>
          <Big>
            <CountUp value={r.workouts} delay={300} />
          </Big>
          <Sub>
            <CountUp value={r.minutes} delay={600} /> active minutes
          </Sub>
        </Center>
      ),
    },
    {
      key: "protein",
      render: () => (
        <Center>
          <Eyebrow>Protein days hit</Eyebrow>
          <Big>
            <CountUp value={r.proteinDays} delay={300} />
            <span className="text-[28px] font-semibold" style={{ opacity: 0.6 }}>
              {" "}
              / {r.days}
            </span>
          </Big>
          <div className="mt-4 h-3 w-full max-w-[320px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.14)" }}>
            <div className="m-growx h-full rounded-full" style={md(500, { width: `${Math.max(2, (r.proteinDays / Math.max(1, r.days)) * 100)}%`, background: "var(--accent)" })} />
          </div>
          <Sub>Days at 90% or more of your {Math.round(r.proteinTarget)} g target.</Sub>
        </Center>
      ),
    },
    ...(r.bestLift
      ? [
          {
            key: "lift",
            render: () => {
              const b = r.bestLift!;
              return (
                <Center>
                  <Eyebrow>{b.pr ? "New PR" : "Best lift"}</Eyebrow>
                  <p className="m-rise text-[26px] font-semibold" style={md(250)}>
                    {b.name}
                  </p>
                  <Big>{b.kg != null ? `${b.kg} kg × ${b.reps}` : `${b.reps} reps`}</Big>
                  {b.kg != null ? <Sub>Estimated 1RM {b.e1rm} kg</Sub> : null}
                  {b.pr ? (
                    <span className="m-pop mt-3 rounded-full px-3 py-1 text-[13px] font-extrabold" style={md(900, { background: "var(--btn)", color: "var(--btn-ink)" })}>
                      PERSONAL RECORD
                    </span>
                  ) : null}
                </Center>
              );
            },
          },
        ]
      : []),
    ...(r.weight
      ? [
          {
            key: "weight",
            render: () => {
              const w = r.weight!;
              const down = w.delta < 0;
              const y0 = down ? 20 : 80;
              const y1 = w.delta === 0 ? 50 : down ? 80 : 20;
              return (
                <Center>
                  <Eyebrow>Weight trend</Eyebrow>
                  <Big>{w.delta === 0 ? "Steady" : `${down ? "−" : "+"}${weightText(Math.abs(w.delta), units)}`}</Big>
                  <svg viewBox="0 0 300 100" className="mt-2 w-full max-w-[320px]" aria-hidden="true">
                    <path d={`M10,${y0} C110,${y0} 190,${y1} 290,${y1}`} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" pathLength={1} className="m-draw" style={drawLen(1, 400)} />
                    <circle cx={10} cy={y0} r={6} fill="#fff" className="m-pop" style={md(300)} />
                    <circle cx={290} cy={y1} r={7} fill="var(--accent)" className="m-pop" style={md(2000)} />
                  </svg>
                  <Sub>
                    {weightText(w.start, units)} → {weightText(w.end, units)}
                  </Sub>
                </Center>
              );
            },
          },
        ]
      : []),
    ...(r.topFoods.length
      ? [
          {
            key: "foods",
            render: () => (
              <Center>
                <Eyebrow>Your top foods</Eyebrow>
                <ul className="m-0 mt-2 flex w-full max-w-[340px] list-none flex-col gap-3 p-0">
                  {r.topFoods.map((f, i) => (
                    <li key={f.name} className="m-rise flex flex-col gap-1.5 text-left" style={md(300 + i * 250)}>
                      <span className="flex justify-between text-[17px] font-semibold">
                        <span className="truncate pr-2">{f.name}</span>
                        <span className="num" style={{ opacity: 0.7 }}>
                          ×{f.count}
                        </span>
                      </span>
                      <span className="block h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
                        <span className="m-growx block h-full rounded-full" style={md(500 + i * 250, { width: `${(f.count / r.topFoods[0].count) * 100}%`, background: "var(--accent)" })} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Center>
            ),
          },
        ]
      : []),
    {
      key: "streak",
      render: () => (
        <Center>
          <Eyebrow>Day streak</Eyebrow>
          <span className="m-pop" style={md(200, { color: "var(--accent)" })}>
            <LineIcon name="flame" size={56} stroke={1.8} />
          </span>
          <Big>
            <CountUp value={r.streak} delay={400} />
          </Big>
          <Sub>{r.streak ? "days and counting" : "Log anything today to start one"}</Sub>
        </Center>
      ),
    },
    ...(r.squad
      ? [
          {
            key: "squad",
            render: () => (
              <Center>
                <Eyebrow>{r.squad!.name}</Eyebrow>
                <Big>#{r.squad!.rank}</Big>
                <Sub>of {r.squad!.of} this week</Sub>
              </Center>
            ),
          },
        ]
      : []),
    {
      key: "next",
      render: () => (
        <Center>
          <Eyebrow>Next {word}</Eyebrow>
          <p className="m-rise text-[32px] font-semibold leading-tight" style={md(300, { letterSpacing: "-1px" })}>
            {r.nextGoal}
          </p>
          <div className="m-rise mt-6 flex flex-col items-center gap-3" style={md(700)} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <ShareButton
              tone="solid"
              label="Share"
              filename={`locked-in-${word}.png`}
              card={() => ({
                kind: "recap",
                title: `My ${word} in review`,
                period: r.period.label,
                stats: [
                  { label: "Days logged", value: `${r.daysLogged}/${r.days}` },
                  { label: "Workouts", value: String(r.workouts) },
                  { label: "Protein days", value: String(r.proteinDays) },
                  ...(r.bestLift ? [{ label: r.bestLift.pr ? "New PR" : "Best lift", value: r.bestLift.kg != null ? `${r.bestLift.kg} kg × ${r.bestLift.reps}` : `${r.bestLift.reps} reps` }] : []),
                  { label: "Day streak", value: String(r.streak) },
                ],
              })}
            />
            <button type="button" className="press h-11 rounded-full px-5 text-[14px] font-semibold" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: 0 }} onClick={() => router.push("/progress")}>
              Done
            </button>
          </div>
        </Center>
      ),
    },
  ];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const progressRef = useRef(0);
  const last = slides.length - 1;

  const go = useCallback(
    (d: number) => {
      setIndex((i) => Math.max(0, Math.min(last, i + d)));
      progressRef.current = 0;
      setProgress(0);
    },
    [last],
  );

  // Auto-advance: a clock that only runs while not paused and not on the last slide.
  useEffect(() => {
    if (paused || index >= last) return;
    let raf = 0;
    let prev = performance.now();
    const step = (t: number) => {
      const dt = t - prev;
      prev = t;
      progressRef.current += dt / SLIDE_MS;
      if (progressRef.current >= 1) {
        progressRef.current = 0;
        setIndex((i) => Math.min(last, i + 1));
      }
      setProgress(progressRef.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, index, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") setPaused((p) => !p);
      else if (e.key === "Escape") router.push("/progress");
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, router]);

  function down() {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setPaused(true);
    }, 220);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (held.current) {
      held.current = false;
      setPaused(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    go(e.clientX - rect.left < rect.width / 3 ? -1 : 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center" style={{ background: "linear-gradient(170deg, #1d1d1f, #050505)", color: "#fff" }} role="dialog" aria-modal="true" aria-label={`${word === "week" ? "Weekly" : "Monthly"} recap, slide ${index + 1} of ${slides.length}`}>
      <div className="relative flex h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "calc(10px + env(safe-area-inset-top, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex gap-1 px-3" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.key} className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.25)" }}>
              <span className="block h-full rounded-full" style={{ width: `${i < index ? 100 : i === index ? (index === last ? 100 : progress * 100) : 0}%`, background: "#fff" }} />
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ opacity: 0.8 }}>
            Locked In recap <ProChip />
          </span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label={paused ? "Play" : "Pause"} className="press grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: 0 }} onClick={() => setPaused((p) => !p)}>
              {paused ? "▶" : "❚❚"}
            </button>
            <button type="button" aria-label="Close" className="press grid h-10 w-10 place-items-center rounded-full text-[18px]" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: 0 }} onClick={() => router.push("/progress")}>
              ×
            </button>
          </span>
        </div>
        <div className="relative flex-1 select-none" style={{ touchAction: "manipulation" }} onPointerDown={down} onPointerUp={up} onPointerCancel={() => holdTimer.current && clearTimeout(holdTimer.current)}>
          <div key={slides[index].key} className="absolute inset-0" aria-live="polite">
            {slides[index].render()}
          </div>
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 px-7 text-center">{children}</div>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-rise text-[14px] font-semibold uppercase" style={md(80, { letterSpacing: "0.2em", color: "var(--accent2)" })}>
      {children}
    </p>
  );
}
function Big({ children }: { children: React.ReactNode }) {
  return (
    <p className="num m-rise font-extrabold" style={md(200, { fontSize: 76, letterSpacing: "-3px", lineHeight: 1.05 })}>
      {children}
    </p>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-rise mt-1 text-[17px]" style={md(600, { opacity: 0.75 })}>
      {children}
    </p>
  );
}
