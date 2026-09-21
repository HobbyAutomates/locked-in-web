"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { iso, longDate, today as todayIso } from "@/lib/dates";
import type { Meal, Workout } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "./icons";
import { MealRow, WorkoutRow } from "./Rows";
import { Card, Rise } from "./ui";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function CalendarScreen({ workouts, meals, weekStreak }: { workouts: Workout[]; meals: Meal[]; weekStreak: number }) {
  const router = useRouter();
  const t = todayIso();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(t + "T00:00:00");
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(t);

  const byDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    for (const w of workouts) map.set(w.date, [...(map.get(w.date) ?? []), w]);
    return map;
  }, [workouts]);
  const mealDates = useMemo(() => new Set(meals.map((m) => m.date)), [meals]);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const length = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length }, (_, i) => iso(new Date(cursor.y, cursor.m, i + 1)))];
  const prefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const sessions = [...byDate.keys()].filter((d) => d.startsWith(prefix)).length;
  const logged = new Set([...byDate.keys(), ...mealDates].filter((d) => d.startsWith(prefix))).size;

  const dayWorkouts = byDate.get(selected) ?? [];
  const dayMeals = meals.filter((m) => m.date === selected);

  function shift(n: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <div className="flex items-center justify-between gap-2">
          <h1 className="screen-title">Calendar</h1>
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="press grid h-8 w-8 place-items-center rounded-full">
              <ChevronLeft size={18} />
            </button>
            <span className="px-1 text-sm font-semibold">{first.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="press grid h-8 w-8 place-items-center rounded-full">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Rise>

      <Rise index={1}>
        <Card padding={12}>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="text-center text-[11px] font-semibold muted">
                {w}
              </span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const isToday = d === t;
              const sel = d === selected;
              const trained = byDate.has(d);
              const future = d > t;
              const cls = sel ? "day day-selected" : trained ? "day day-trained" : isToday ? "day day-today" : future ? "day" : "day";
              return (
                <span key={d} className="flex h-11 flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelected(d)}
                    aria-pressed={sel}
                    aria-label={longDate(d)}
                    className={`press ${cls}`}
                    style={future && !sel && !trained && !isToday ? { border: "none" } : undefined}
                  >
                    {Number(d.slice(8))}
                  </button>
                  {mealDates.has(d) && !sel ? <span className="rounded-full" style={{ width: 4, height: 4, background: "var(--orange)" }} /> : null}
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between px-1.5 text-xs">
            <span>
              <b style={{ color: "var(--green)" }}>{sessions}</b> <span className="muted">sessions</span>
            </span>
            <span>
              <b>{logged}</b> <span className="muted">days logged</span>
            </span>
            <span>
              <b style={{ color: "var(--flame)" }}>{weekStreak}</b> <span className="muted">wk streak</span>
            </span>
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold" style={{ letterSpacing: "-0.025em" }}>
            {longDate(selected)}
          </h2>
          <button
            type="button"
            onClick={() => router.push(`/log?date=${selected}`)}
            className="press rounded-full px-3 py-1.5 text-[13px] font-semibold"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}
          >
            + Log
          </button>
        </div>
      </Rise>

      {dayWorkouts.length === 0 && dayMeals.length === 0 ? <p className="text-[13px] muted">Nothing logged.</p> : null}
      {dayWorkouts.map((w) => (
        <Rise key={w.id} index={3}>
          <WorkoutRow workout={w} onOpen={() => router.push(`/log?workout=${w.id}`)} />
        </Rise>
      ))}
      {dayMeals.map((m) => (
        <Rise key={m.id} index={4}>
          <MealRow meal={m} feedback={false} />
        </Rise>
      ))}
    </div>
  );
}
