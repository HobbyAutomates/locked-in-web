"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { addDays, longDate, shortDate } from "@/lib/dates";
import { totalsFor } from "@/lib/totals";
import { carbTargetG, fatTargetG, type Meal, type Profile, type Workout } from "@/lib/types";
import { Flame, Lock } from "./icons";
import { MealRow, PendingMealRow, WorkoutRow } from "./Rows";
import { usePendingMeals } from "./PendingMeals";
import { BreathingFlame, Card, ErrorNote, PillButton, Ring, Rise } from "./ui";

type Props = {
  today: string;
  profile: Profile;
  workouts: Workout[];
  meals: Meal[];
  weekStreak: number;
  thisWeek: number;
  celebrate: boolean;
};

export default function HomeScreen({ today, profile, workouts, meals, weekStreak, thisWeek, celebrate }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState(today);
  const { pending, savedCount, error } = usePendingMeals();
  // When a background quick-log finishes, pull the freshly saved row in.
  useEffect(() => {
    if (savedCount > 0) router.refresh();
  }, [savedCount, router]);
  const isToday = selected === today;
  const totals = totalsFor(meals, selected);
  const dayWorkouts = workouts.filter((w) => w.date === selected);
  const dayMeals = meals.filter((m) => m.date === selected);
  const trained = new Set(workouts.map((w) => w.date));
  const carbTarget = Math.max(1, carbTargetG(profile));
  const fatTarget = Math.max(1, fatTargetG(profile));
  const left = (target: number, used: number) => Math.max(0, Math.round(target - used));

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-[22px] font-extrabold" style={{ letterSpacing: "-0.027em" }}>
            <Lock size={26} />
            Locked In
          </h1>
          <span
            className="flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3 text-sm font-bold"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}
            title={`${weekStreak} week streak`}
          >
            <BreathingFlame size={16} />
            {weekStreak}
          </span>
        </div>
        {error ? <div className="mt-2"><ErrorNote text={error} /></div> : null}
      </Rise>

      <Rise index={1}>
        <WeekStrip today={today} selected={selected} trained={trained} onSelect={setSelected} />
      </Rise>

      <Rise index={2}>
        <Card padding={20}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="num text-[40px] font-extrabold leading-none">{left(profile.calorie_target, totals.calories)}</p>
              <p className="mt-1 text-sm font-medium muted">{isToday ? "Calories left" : `Calories left · ${shortDate(selected)}`}</p>
            </div>
            <Ring fraction={totals.calories / Math.max(1, profile.calorie_target)} color="var(--ink)" size={96} stroke={9}>
              <Flame size={26} />
            </Ring>
          </div>
        </Card>
      </Rise>

      <Rise index={3}>
        <div className="grid grid-cols-3 gap-2.5">
          <MacroCard value={`${left(profile.protein_target_g, totals.protein)}g`} label="Protein left" fraction={totals.protein / Math.max(1, profile.protein_target_g)} color="var(--red)" />
          <MacroCard value={`${left(carbTarget, totals.carbs)}g`} label="Carbs left" fraction={totals.carbs / carbTarget} color="var(--orange)" />
          <MacroCard value={`${left(fatTarget, totals.fat)}g`} label="Fat left" fraction={totals.fat / fatTarget} color="var(--blue)" />
        </div>
      </Rise>

      <Rise index={4}>
        <h2 className="text-xl font-extrabold" style={{ letterSpacing: "-0.025em" }}>
          {isToday ? "Recently logged" : longDate(selected)}
        </h2>
      </Rise>

      {isToday ? pending.map((p) => <Rise key={p.id} index={5}><PendingMealRow text={p.text} /></Rise>) : null}

      {dayWorkouts.length === 0 && dayMeals.length === 0 && (!isToday || pending.length === 0) ? (
        <Rise index={5}>
          <p className="text-[13px] muted">
            {isToday ? "Nothing yet today. Tap + to log a workout or a meal." : `Nothing logged on ${longDate(selected)}.`}
          </p>
        </Rise>
      ) : null}

      {dayWorkouts.map((w) => (
        <Rise key={w.id} index={5}>
          <WorkoutRowLink workout={w} />
        </Rise>
      ))}
      {dayMeals.map((m) => (
        <Rise key={m.id} index={6}>
          <MealRow meal={m} />
        </Rise>
      ))}

      <AnimatePresence>
        {celebrate ? <Celebration thisWeek={thisWeek} target={profile.weekly_workout_target} streakWeeks={weekStreak} /> : null}
      </AnimatePresence>
    </div>
  );
}

function WorkoutRowLink({ workout }: { workout: Workout }) {
  const router = useRouter();
  return <WorkoutRow workout={workout} onOpen={() => router.push(`/log?workout=${workout.id}`)} />;
}

function WeekStrip({
  today,
  selected,
  trained,
  onSelect,
}: {
  today: string;
  selected: string;
  trained: Set<string>;
  onSelect: (d: string) => void;
}) {
  const start = addDays(today, -6);
  return (
    <div className="flex justify-between gap-1.5">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
        const date = new Date(d + "T00:00:00");
        const isToday = d === today;
        const sel = d === selected;
        const did = trained.has(d);
        const cls = sel ? "day day-selected" : did ? "day day-trained" : isToday ? "day day-today" : "day";
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={sel}
            className="press flex flex-1 flex-col items-center gap-1.5 rounded-xl bg-transparent border-0 p-0"
          >
            <span className={cls} style={{ width: 30, height: 30 }}>
              {date.toLocaleDateString("en-IN", { weekday: "narrow" })}
            </span>
            <span className="text-[13px]" style={{ color: sel || isToday ? "var(--ink)" : "var(--muted)", fontWeight: sel || isToday ? 700 : 500 }}>
              {date.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MacroCard({ value, label, fraction, color }: { value: string; label: string; fraction: number; color: string }) {
  return (
    <Card padding={12}>
      <p className="num text-xl font-extrabold leading-tight">{value}</p>
      <p className="text-xs muted">{label}</p>
      <div className="mt-2.5 flex justify-center">
        <Ring fraction={fraction} color={color} size={56} stroke={6}>
          <span className="rounded-full" style={{ width: 8, height: 8, background: color }} />
        </Ring>
      </div>
    </Card>
  );
}

/** Streak celebration shown after a new workout is saved (?celebrate=1). */
function Celebration({ thisWeek, target, streakWeeks }: { thisWeek: number; target: number; streakWeeks: number }) {
  const router = useRouter();
  const hit = thisWeek >= target;
  function close() {
    router.replace("/");
  }
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center px-6"
      style={{ background: "rgba(0,0,0,0.45)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Streak"
      onClick={close}
    >
      <motion.div
        className="w-full max-w-[360px] text-center"
        style={{ background: "var(--card)", borderRadius: 28, padding: 24 }}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 240, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mx-auto grid place-items-center" style={{ width: 96, height: 96 }}>
          <BreathingFlame size={96} />
          {/* Sits inside the flame's body, like the Compose dialog's 18dp downward nudge. */}
          <span className="num absolute text-[26px] font-extrabold" style={{ color: "#fff", transform: "translateY(18px)" }}>
            {thisWeek}
          </span>
        </div>
        <p className="mt-2 text-[22px] font-extrabold" style={{ color: "var(--flame)", letterSpacing: "-0.023em" }}>
          {hit ? "Week target hit!" : `Session ${thisWeek} of ${target}`}
        </p>
        <p className="mt-1.5 text-sm muted">
          {hit
            ? `${streakWeeks}-week streak. You're on fire — keep it rolling.`
            : `${target - thisWeek} more this week keeps the ${streakWeeks}-week streak alive.`}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: Math.max(1, target) }, (_, i) => (
            <span
              key={i}
              className="rounded-full"
              style={{
                width: 14,
                height: 14,
                background: i < thisWeek ? "var(--flame)" : "transparent",
                border: i < thisWeek ? "none" : "2px solid var(--flame)",
              }}
            />
          ))}
        </div>
        <div className="mt-5">
          <PillButton onClick={close}>Continue</PillButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
