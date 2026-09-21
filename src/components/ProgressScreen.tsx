"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { addDays, today as todayIso, weekStart } from "@/lib/dates";
import { totalsFor } from "@/lib/totals";
import { restByMuscle } from "@/lib/streaks";
import { MUSCLE_COLOR, type Muscle } from "@/lib/muscles";
import type { Meal, Profile, Workout } from "@/lib/types";
import { BreathingFlame, Card, MacroDot, Rise, SPRING, Segmented } from "./ui";

const WEEK_OPTIONS = ["This week", "Last week", "2 wks ago", "3 wks ago"];

export default function ProgressScreen({
  profile,
  workouts,
  meals,
  weekStreak,
  thisWeek,
}: {
  profile: Profile;
  workouts: Workout[];
  meals: Meal[];
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
