"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { addDays, today as todayIso, weekStart } from "@/lib/dates";
import { totalsFor } from "@/lib/totals";
import { restByMuscle } from "@/lib/streaks";
import { MUSCLE_COLOR, type Muscle } from "@/lib/muscles";
import type { ExerciseEntry, Meal, Profile, Workout } from "@/lib/types";
import { BreathingFlame, Card, MacroDot, Rise, SPRING, Segmented } from "./ui";

const WEEK_OPTIONS = ["This week", "Last week", "2 wks ago", "3 wks ago"];

export default function ProgressScreen({
  profile,
  workouts,
  meals,
  exercises,
  weekStreak,
  thisWeek,
}: {
  profile: Profile;
  workouts: Workout[];
  meals: Meal[];
  exercises: ExerciseEntry[];
  weekStreak: number;
  thisWeek: number;
}) {
  const t = todayIso();
  const [weekBack, setWeekBack] = useState(0);
  const target = Math.max(1, profile.weekly_workout_target);

  const ws = addDays(weekStart(t), -7 * weekBack);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const protein = days.map((d) => totalsFor(meals, d).protein);
  const loggedDays = protein.filter((p) => p > 0);
  const avg = loggedDays.length ? loggedDays.reduce((a, b) => a + b, 0) / loggedDays.length : 0;

  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(t), -7 * (7 - i)));
  const perWeek = new Map<string, number>();
  for (const w of workouts) perWeek.set(weekStart(w.date), (perWeek.get(weekStart(w.date)) ?? 0) + 1);

  const rest = restByMuscle(workouts).filter((r) => r.last !== null).slice(0, 3);
  const left = Math.max(0, target - thisWeek);

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <h1 className="screen-title">Progress</h1>
      </Rise>

      <Rise index={1}>
        <div className="grid grid-cols-2 gap-2.5">
          <Card>
            <p className="text-[13px] font-medium muted">This week</p>
            <p className="mt-1.5 flex items-baseline">
              <span className="num text-3xl font-extrabold">{thisWeek}</span>
              <span className="ml-1 text-base font-semibold muted">/ {target}</span>
            </p>
            <Bar fraction={thisWeek / target} color="var(--ink)" />
            <p className="mt-1.5 text-xs muted">{left === 0 ? "Target hit — streak safe" : `${left} more to keep the streak`}</p>
          </Card>
          <Card>
            <div className="flex flex-col items-center gap-1">
              <BreathingFlame size={40} />
              <p className="num text-[26px] font-extrabold leading-none" style={{ color: "var(--flame)" }}>
                {weekStreak}
              </p>
              <p className="text-[13px] font-semibold">Week streak</p>
              <div className="mt-1 flex gap-1.5">
                {Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      background: i < Math.min(weekStreak, 4) ? "var(--flame)" : "transparent",
                      border: i < Math.min(weekStreak, 4) ? "none" : "1.5px solid var(--flame)",
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>
      </Rise>

      <Rise index={2}>
        <Segmented options={WEEK_OPTIONS} selected={weekBack} onSelect={setWeekBack} label="Which week" />
      </Rise>

      <Rise index={3}>
        <WeeklyEnergy days={days} meals={meals} exercises={exercises} today={t} />
      </Rise>

      <Rise index={3}>
        <Card>
          <p className="text-[17px] font-bold">Protein</p>
          <p className="flex items-baseline">
            <span className="num text-[28px] font-extrabold">{Math.round(avg)}</span>
            <span className="ml-1 text-[13px] muted">g / day avg · target {profile.protein_target_g}</span>
          </p>
          <Bars
            values={protein}
            target={profile.protein_target_g}
            labels={days.map((d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }))}
            color="var(--red)"
            dim="var(--red-bg)"
            highlightLast={weekBack === 0}
            height={96}
          />
        </Card>
      </Rise>

      <Rise index={4}>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[17px] font-bold">Sessions per week</p>
            <p className="text-xs muted">target {target}</p>
          </div>
          <Bars
            values={weeks.map((w) => perWeek.get(w) ?? 0)}
            target={target}
            labels={weeks.map((w) => String(Number(w.slice(8))))}
            color="var(--ink)"
            dim="var(--track)"
            highlightLast
            lastColor="var(--green)"
            height={70}
          />
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            {rest.map((r) => (
              <MacroDot
                key={r.muscle}
                value={`${r.muscle} ${r.days === 0 ? "today" : `${r.days} d rest`}`}
                color={r.days >= 7 ? MUSCLE_COLOR[r.muscle as Muscle] : "var(--muted)"}
              />
            ))}
          </div>
        </Card>
      </Rise>
    </div>
  );
}

/**
 * Weekly Energy: calories eaten vs burned for the selected week. Burned is the exercise log
 * (logged activities + band-workout auto-burns) — the web has no Health Connect feed.
 */
function WeeklyEnergy({ days, meals, exercises, today }: { days: string[]; meals: Meal[]; exercises: ExerciseEntry[]; today: string }) {
  const consumed = days.map((d) => totalsFor(meals, d).calories);
  const burned = days.map((d) => exercises.filter((e) => e.date === d).reduce((a, e) => a + e.kcal, 0));
  const totalIn = consumed.reduce((a, b) => a + b, 0);
  const totalOut = burned.reduce((a, b) => a + b, 0);
  const inWeek = new Set(days);
  const week = exercises.filter((e) => inWeek.has(e.date));
  const stat = (label: string, value: number, color: string) => (
    <span className="flex flex-col">
      <span className="text-xs muted">{label}</span>
      <span className="num text-xl font-extrabold leading-tight" style={{ color, letterSpacing: "-0.03em" }}>{Math.round(value)}</span>
      <span className="text-[11px] muted">kcal</span>
    </span>
  );
  return (
    <Card>
      <p className="text-[17px] font-bold">Weekly Energy</p>
      <div className="mt-3 flex justify-between">
        {stat("Consumed", totalIn, "var(--orange)")}
        {stat("Burned", totalOut, "var(--green)")}
        {stat("Net", totalIn - totalOut, "var(--ink)")}
      </div>
      <LineChart a={consumed} b={burned} colorA="var(--orange)" colorB="var(--green)" />
      <div className="mt-2 flex gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((l, i) => (
          <span key={i} className="flex-1 text-center text-[10px]" style={{ color: days[i] === today ? "var(--ink)" : "var(--muted)", fontWeight: days[i] === today ? 700 : 400 }}>
            {l}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex gap-3.5">
        <MacroDot value="Consumed" color="var(--orange)" />
        <MacroDot value="Burned" color="var(--green)" />
      </div>
      {week.length ? (
        <div className="mt-3.5">
          <p className="text-[13px] font-semibold muted">Exercise this week</p>
          <div className="mt-1 flex flex-col gap-1.5">
            {week.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="w-[34px] shrink-0 text-xs font-semibold muted">{new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</span>
                  <span className="truncate text-[13px] font-semibold">{e.name.charAt(0).toUpperCase() + e.name.slice(1)}</span>
                </span>
                <span className="shrink-0 text-xs muted">
                  {e.minutes} min · {Math.round(e.kcal)} kcal
                </span>
              </div>
            ))}
            {week.length > 8 ? <span className="text-xs muted">+{week.length - 8} more</span> : null}
          </div>
        </div>
      ) : (
        <p className="mt-2.5 text-xs muted">Log a run, bands or any activity from + → Exercise and it lands here.</p>
      )}
    </Card>
  );
}

/** Two 7-point polylines on a shared scale, with a dot at each day. Mirrors Compose's LineChart. */
function LineChart({ a, b, colorA, colorB }: { a: number[]; b: number[]; colorA: string; colorB: string }) {
  const W = 300;
  const H = 110;
  const max = Math.max(...a, ...b, 1);
  const pts = (v: number[]) => v.map((x, i) => [v.length <= 1 ? 0 : (W * i) / (v.length - 1), H - Math.min(H, Math.max(0, (H * x) / max))] as const);
  const path = (p: readonly (readonly [number, number])[]) => p.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-[110px] w-full" preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} y1={H} x2={W} y2={H} stroke="var(--hair)" strokeWidth={1.5} />
      {[
        [a, colorA],
        [b, colorB],
      ].map(([v, c], i) => {
        const p = pts(v as number[]);
        return (
          <g key={i}>
            <motion.path d={path(p)} fill="none" stroke={c as string} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...SPRING, delay: 0.2 }} />
            {p.map(([x, y], j) => (
              <circle key={j} cx={x} cy={y} r={3.5} fill={c as string} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Bar({ fraction, color }: { fraction: number; color: string }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${f * 100}%` }} transition={{ ...SPRING, delay: 0.15 }} />
    </div>
  );
}

function Bars({
  values,
  target,
  labels,
  color,
  dim,
  highlightLast,
  lastColor,
  height,
}: {
  values: number[];
  target: number;
  labels: string[];
  color: string;
  dim: string;
  highlightLast: boolean;
  lastColor?: string;
  height: number;
}) {
  const max = Math.max(...values, target, 1);
  return (
    <div className="mt-3">
      <div className="relative flex items-end gap-2" style={{ height }}>
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ bottom: `${(target / max) * 100}%`, borderTop: "1px dashed var(--hair)" }}
          aria-hidden="true"
        />
        {values.map((v, i) => {
          const last = i === values.length - 1;
          const c = last && highlightLast && lastColor ? lastColor : v >= target && target > 0 ? color : dim;
          const f = Math.max(0.03, Math.min(1, v / max));
          return (
            <motion.div
              key={i}
              className="flex-1"
              style={{ background: c, borderRadius: "8px 8px 4px 4px" }}
              initial={{ height: "3%" }}
              animate={{ height: `${f * 100}%` }}
              transition={{ ...SPRING, delay: 0.2 + i * 0.02 }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {labels.map((l, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[10px]"
            style={{
              color: i === labels.length - 1 && highlightLast ? "var(--ink)" : "var(--muted)",
              fontWeight: i === labels.length - 1 && highlightLast ? 700 : 400,
            }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
