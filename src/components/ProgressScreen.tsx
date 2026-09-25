"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { deleteProgressPhoto, uploadProgressPhoto } from "@/lib/actions";
import { ALL_BADGES, earnedCount, type BadgeProgress } from "@/lib/badges";
import { addDays, daysBetween, parseIso, today as todayIso, weekStart } from "@/lib/dates";
import { toJpegBase64 } from "@/lib/image";
import { totalsFor } from "@/lib/totals";
import { restByMuscle } from "@/lib/streaks";
import { movingAverage } from "@/lib/weightTrend";
import { MUSCLE_COLOR, type Muscle } from "@/lib/muscles";
import type { ExerciseEntry, Meal, Profile, ProgressPhoto, WeightEntry, Workout } from "@/lib/types";
import { weightText } from "@/lib/display";
import HexMedal from "./HexMedal";
import { Camera, ChevronDown, Close, Plus, Scale, Spinner, Trash } from "./icons";
import { BreathingFlame, Card, Chevron, ErrorNote, Hair, MacroDot, PillButton, Rise, SPRING, Segmented, fmt } from "./ui";

const PROTEIN = "#E9636B";
const CARBS = "#E5A15B";
const FATS = "#5B8DEF";

const PERIODS: { label: string; days: number | null }[] = [
  { label: "3 day", days: 3 },
  { label: "7 day", days: 7 },
  { label: "14 day", days: 14 },
  { label: "30 day", days: 30 },
  { label: "90 day", days: 90 },
  { label: "All time", days: null },
];

const dayShort = (d: string) => parseIso(d).toLocaleDateString("en-IN", { weekday: "short" });
const dayMonth = (d: string) => parseIso(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function ProgressScreen({
  profile,
  workouts,
  meals,
  exercises,
  weights,
  photos,
  badges,
  weekStreak,
  dayStreak,
  thisWeek,
}: {
  profile: Profile;
  workouts: Workout[];
  meals: Meal[];
  /** ~180 days of exercise rows (expenditure compares each period with the one before it). */
  exercises: ExerciseEntry[];
  /** Every weigh-in, newest first. */
  weights: WeightEntry[];
  photos: ProgressPhoto[];
  badges: BadgeProgress;
  weekStreak: number;
  /** Consecutive days with anything logged, ending today or yesterday. */
  dayStreak: number;
  thisWeek: number;
}) {
  const t = todayIso();
  const target = Math.max(1, profile.weekly_workout_target);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(t), -7 * (7 - i)));
  const perWeek = new Map<string, number>();
  for (const w of workouts) perWeek.set(weekStart(w.date), (perWeek.get(weekStart(w.date)) ?? 0) + 1);
  const rest = restByMuscle(workouts).filter((r) => r.last !== null).slice(0, 3);
  const left = Math.max(0, target - thisWeek);
  const current = weights[0]?.weight_kg ?? profile.weight_kg;
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <h1 className="screen-title">Progress</h1>
      </Rise>

      <Rise index={1}>
        <WeightTrendCard profile={profile} weights={weights} today={t} />
      </Rise>

      <Rise index={2}>
        <WeeklyEnergyCard meals={meals} exercises={exercises} profile={profile} today={t} />
      </Rise>

      <Rise index={3}>
        <StreakCard dayStreak={dayStreak} weekStreak={weekStreak} />
      </Rise>

      <Rise index={4}>
        <MacrosWeekCard meals={meals} today={t} />
      </Rise>

      <Rise index={5}>
        <button
          type="button"
          aria-expanded={showMore}
          className="press flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-semibold"
          style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
          onClick={() => setShowMore((v) => !v)}
        >
          More stats
          <ChevronDown size={16} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
      </Rise>

      {showMore ? (
        <div className="flex flex-col gap-3.5">
          <Rise index={0}>
            <WeightChanges weights={weights} today={t} />
          </Rise>

          <Rise index={1}>
            <CaloriesChart meals={meals} today={t} goal={profile.calorie_target} />
          </Rise>

          <Rise index={1}>
            <ExpenditureChanges exercises={exercises} today={t} />
          </Rise>

          <Rise index={2}>
            <BmiCard heightCm={profile.height_cm} weightKg={current ?? null} />
          </Rise>

          <Rise index={2}>
            <PhotosStrip photos={photos} />
          </Rise>

          <Rise index={3}>
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
                </div>
              </Card>
            </div>
          </Rise>

          <Rise index={3}>
            <BadgesCard progress={badges} />
          </Rise>

          <Rise index={4}>
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-[17px] font-bold">Sessions per week</p>
                <p className="text-xs muted">target {target}</p>
              </div>
              <Bars values={weeks.map((w) => perWeek.get(w) ?? 0)} target={target} labels={weeks.map((w) => String(Number(w.slice(8))))} color="var(--ink)" dim="var(--track)" lastColor="var(--green)" height={70} />
              <div className="mt-2.5 flex flex-wrap gap-2.5">
                {rest.map((r) => (
                  <MacroDot key={r.muscle} value={`${r.muscle} ${r.days === 0 ? "today" : `${r.days} d rest`}`} color={r.days >= 7 ? MUSCLE_COLOR[r.muscle as Muscle] : "var(--muted)"} />
                ))}
              </div>
            </Card>
          </Rise>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- weight trend (card 1)

/** Line chart of every weigh-in plus a 7-entry moving average, with a dashed goal line. */
function WeightLineChart({ values, goal, w = 300, h = 100 }: { values: number[]; goal: number | null; w?: number; h?: number }) {
  const avg = movingAverage(values, 7);
  const all = goal != null ? [...values, goal] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo > 0.001 ? hi - lo : 1;
  const pad = span * 0.12;
  const y = (v: number) => h - (h * (v - (lo - pad))) / (span + pad * 2);
  const x = (i: number) => (values.length <= 1 ? w / 2 : (w * i) / (values.length - 1));
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`-4 -6 ${w + 8} ${h + 12}`} className="mt-3 block w-full" role="img" aria-label={`Weight trend over ${values.length} weigh-ins`}>
      {goal != null ? (
        <>
          <line x1={0} x2={w} y1={y(goal)} y2={y(goal)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
          <text x={w} y={y(goal) - 4} textAnchor="end" fontSize={9} fill="var(--muted)">
            Goal
          </text>
        </>
      ) : null}
      <motion.path d={path(values)} fill="none" stroke="var(--track)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...SPRING, delay: 0.1 }} />
      <motion.path d={path(avg)} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...SPRING, delay: 0.25 }} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

/** Current weight, the weigh-in pill, the trend line + moving average, and a Start → Goal bar. */
function WeightTrendCard({ profile, weights, today }: { profile: Profile; weights: WeightEntry[]; today: string }) {
  const router = useRouter();
  const current = weights[0]?.weight_kg ?? profile.weight_kg;
  const start = weights.length ? weights[weights.length - 1].weight_kg : profile.weight_kg;
  const goal = profile.goal_weight_kg;
  const last = weights[0]?.date ?? null;
  const due = last ? Math.max(0, 7 - daysBetween(last, today)) : 0;
  const span = start != null && goal != null ? start - goal : 0;
  const fraction = current != null && start != null && goal != null && Math.abs(span) > 0.05 ? Math.max(0, Math.min(1, (start - current) / span)) : current != null && goal != null && Math.abs(current - goal) <= 0.05 ? 1 : 0;
  const asc = [...weights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const values = asc.map((w) => w.weight_kg);
  const pillText = weights.length === 0 ? "Log your first weigh-in" : due === 0 ? "Weigh-in due today" : `Next weigh-in: ${due}d`;
  const pillActive = weights.length === 0 || due === 0;

  return (
    <Card padding={18}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium muted">Weight trend</p>
          <p className="num mt-1 text-[36px] font-extrabold leading-none" style={{ letterSpacing: "-0.04em" }}>
            {current != null ? weightText(current, profile.units).split(" ")[0] : "—"}
            <span className="ml-1 text-[15px] font-semibold muted">{profile.units === "imperial" ? "lb" : "kg"}</span>
          </p>
        </div>
        <button
          type="button"
          className="press num shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold"
          style={{ background: pillActive ? "var(--btn)" : "var(--card2)", color: pillActive ? "var(--btn-ink)" : "var(--ink)", border: 0 }}
          onClick={() => router.push("/profile/weight?log=1")}
        >
          {pillText}
        </button>
      </div>

      {values.length >= 2 ? (
        <WeightLineChart values={values} goal={goal} />
      ) : (
        <p className="mt-3 text-xs muted">Log a few weigh-ins to see your trend.</p>
      )}

      {goal != null && start != null ? (
        <div className="mt-3.5">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
            <motion.div className="h-full rounded-full" style={{ background: "var(--ink)" }} initial={{ width: 0 }} animate={{ width: `${fraction * 100}%` }} transition={{ ...SPRING, delay: 0.15 }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs">
            <span className="muted">
              Start <span className="num font-bold" style={{ color: "var(--ink)" }}>{weightText(start, profile.units)}</span>
            </span>
            <span className="num font-semibold muted">{Math.round(fraction * 100)}%</span>
            <span className="muted">
              Goal <span className="num font-bold" style={{ color: "var(--ink)" }}>{weightText(goal, profile.units)}</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs muted">
          Set a goal weight in{" "}
          <Link href="/profile/goal" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            Goal & weight
          </Link>{" "}
          to see how far along you are.
        </p>
      )}
      <div className="mt-3.5">
        <PillButton soft height={42} onClick={() => router.push("/profile/weight?log=1")}>
          <span className="inline-flex items-center gap-2">
            <Scale size={16} />
            Log weight
          </span>
        </PillButton>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- this week's energy (card 2)

/** Eaten vs target vs burned, summed from the start of this week through today. */
function WeeklyEnergyCard({ meals, exercises, profile, today }: { meals: Meal[]; exercises: ExerciseEntry[]; profile: Profile; today: string }) {
  const ws = weekStart(today);
  const daysSoFar = daysBetween(ws, today) + 1;
  const days = Array.from({ length: daysSoFar }, (_, i) => addDays(ws, i));
  const eaten = days.reduce((a, d) => a + totalsFor(meals, d).calories, 0);
  const burned = exercises.filter((e) => e.date >= ws && e.date <= today).reduce((a, e) => a + Number(e.kcal || 0), 0);
  const target = profile.calorie_target * daysSoFar;
  const net = eaten - burned;
  const fraction = target > 0 ? net / target : 0;

  return (
    <Card>
      <p className="text-[17px] font-bold">This week&apos;s energy</p>
      <p className="text-xs muted">Since {dayShort(ws)}, {dayMonth(ws)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Eaten" value={Math.round(eaten).toLocaleString("en-IN")} />
        <Stat label="Target" value={Math.round(target).toLocaleString("en-IN")} />
        <Stat label="Burned" value={Math.round(burned).toLocaleString("en-IN")} color="var(--green)" />
      </div>
      <Bar fraction={fraction} color={fraction > 1.05 ? "var(--red)" : "var(--ink)"} />
      <p className="mt-1.5 text-xs muted">{Math.round(net).toLocaleString("en-IN")} kcal net of {Math.round(target).toLocaleString("en-IN")} kcal target</p>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="num text-lg font-extrabold" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </span>
      <span className="text-[11px] muted">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- streak (card 3)

/** Day streak (anything logged) plus the week streak (workout target met). */
function StreakCard({ dayStreak, weekStreak }: { dayStreak: number; weekStreak: number }) {
  return (
    <Card>
      <p className="text-[17px] font-bold">Streak</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div className="flex flex-col items-center gap-1">
          <BreathingFlame size={40} />
          <p className="num text-[26px] font-extrabold leading-none" style={{ color: "var(--flame)" }}>
            {dayStreak}
          </p>
          <p className="text-[13px] font-semibold">Day streak</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <BreathingFlame size={40} />
          <p className="num text-[26px] font-extrabold leading-none" style={{ color: "var(--flame)" }}>
            {weekStreak}
          </p>
          <p className="text-[13px] font-semibold">Week streak</p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- macros this week (card 4)

/** The P/C/F split for everything logged since the start of this week. */
function MacrosWeekCard({ meals, today }: { meals: Meal[]; today: string }) {
  const ws = weekStart(today);
  const days = Array.from({ length: daysBetween(ws, today) + 1 }, (_, i) => addDays(ws, i));
  const totals = days.reduce(
    (a, d) => {
      const x = totalsFor(meals, d);
      return { protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat };
    },
    { protein: 0, carbs: 0, fat: 0 },
  );
  const p = totals.protein * 4;
  const c = totals.carbs * 4;
  const f = totals.fat * 9;
  const total = Math.max(1, p + c + f);

  return (
    <Card>
      <p className="text-[17px] font-bold">Macros this week</p>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
        <motion.div style={{ background: PROTEIN }} initial={{ width: 0 }} animate={{ width: `${(p / total) * 100}%` }} transition={{ ...SPRING, delay: 0.1 }} />
        <motion.div style={{ background: CARBS }} initial={{ width: 0 }} animate={{ width: `${(c / total) * 100}%` }} transition={{ ...SPRING, delay: 0.15 }} />
        <motion.div style={{ background: FATS }} initial={{ width: 0 }} animate={{ width: `${(f / total) * 100}%` }} transition={{ ...SPRING, delay: 0.2 }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5">
        <MacroDot value={`Protein ${Math.round(totals.protein)}g`} color={PROTEIN} />
        <MacroDot value={`Carbs ${Math.round(totals.carbs)}g`} color={CARBS} />
        <MacroDot value={`Fats ${Math.round(totals.fat)}g`} color={FATS} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- weight (More stats)

/** Weigh-ins in [today − days, today] in time order, plus the last one before the window as its baseline. */
function windowOf<T extends { date: string }>(rows: T[], today: string, days: number | null): T[] {
  const asc = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (days == null) return asc;
  const from = addDays(today, -days);
  const inside = asc.filter((r) => r.date >= from);
  const before = asc.filter((r) => r.date < from);
  return before.length ? [before[before.length - 1], ...inside] : inside;
}

function WeightChanges({ weights, today }: { weights: WeightEntry[]; today: string }) {
  return (
    <Card padding={0}>
      <p className="px-4 pb-1 pt-3.5 text-[17px] font-bold">Weight changes</p>
      <div className="px-4">
        {PERIODS.map((p, i) => {
          const rows = windowOf(weights, today, p.days);
          const values = rows.map((r) => r.weight_kg);
          const delta = values.length >= 2 ? values[values.length - 1] - values[0] : null;
          const d = delta == null ? null : Math.round(delta * 10) / 10;
          const text = d == null ? "Not enough weigh-ins" : Math.abs(d) < 0.05 ? "No change" : d < 0 ? `Down ${fmt(Math.abs(d))} kg` : `Up ${fmt(d)} kg`;
          const color = d == null || Math.abs(d) < 0.05 ? "var(--muted)" : "var(--ink)";
          return (
            <div key={p.label}>
              {i > 0 ? <Hair /> : null}
              <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-2.5">
                <span className="text-[13px] font-semibold">{p.label}</span>
                <span className="flex justify-center">{values.length >= 2 ? <Spark values={values} /> : <span className="h-[22px]" />}</span>
                <span className="num text-right text-[13px] font-bold" style={{ color }}>
                  {text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Tiny trend line — no axes, just the shape. */
function Spark({ values, color = "var(--ink)", w = 72, h = 22 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo > 0.001 ? hi - lo : 1;
  const flat = hi - lo <= 0.001;
  const d = values
    .map((v, i) => {
      const x = values.length <= 1 ? 0 : (w * i) / (values.length - 1);
      const y = flat ? h / 2 : h - (h * (v - lo)) / span;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`-2 -2 ${w + 4} ${h + 4}`} aria-hidden="true" style={{ flex: "none" }}>
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...SPRING, delay: 0.2 }} />
    </svg>
  );
}

// ---------------------------------------------------------------- calories (More stats)

/** Daily average calories: a Protein / Carbs / Fats stacked bar per day of the chosen week. */
function CaloriesChart({ meals, today, goal }: { meals: Meal[]; today: string; goal: number }) {
  const [back, setBack] = useState(0);
  const ws = addDays(weekStart(today), -7 * back);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const rows = days.map((d) => {
    const x = totalsFor(meals, d);
    return { d, p: x.protein * 4, c: x.carbs * 4, f: x.fat * 9, kcal: x.calories };
  });
  const logged = rows.filter((r) => r.kcal > 0);
  const avg = logged.length ? logged.reduce((a, r) => a + r.kcal, 0) / logged.length : 0;
  const W = 300;
  const H = 130;
  const max = Math.max(goal, ...rows.map((r) => r.p + r.c + r.f), 1) * 1.08;
  const bw = 24;
  const gap = (W - bw * 7) / 7;
  const y = (v: number) => (H * v) / max;
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold">Daily average calories</p>
          <p className="mt-0.5 flex items-baseline">
            <span className="num text-[28px] font-extrabold leading-tight">{Math.round(avg).toLocaleString("en-IN")}</span>
            <span className="ml-1 text-[13px] muted">kcal · goal {goal.toLocaleString("en-IN")}</span>
          </p>
        </div>
      </div>
      <div className="mt-2.5">
        <Segmented options={["This wk", "Last wk", "2 wk ago", "3 wk ago"]} selected={back} onSelect={setBack} label="Which week" />
      </div>
      <svg key={back} viewBox={`0 0 ${W} ${H + 18}`} className="mt-3 block w-full" role="img" aria-label={`Average ${Math.round(avg)} kcal a day on ${logged.length} logged days`}>
        <line x1={0} x2={W} y1={H - y(goal)} y2={H - y(goal)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
        <line x1={0} x2={W} y1={H} y2={H} stroke="var(--hair)" strokeWidth={1.5} />
        {rows.map((r, i) => {
          const x = gap / 2 + i * (bw + gap);
          const hp = y(r.p);
          const hc = y(r.c);
          const hf = y(r.f);
          const isToday = r.d === today;
          return (
            <g key={r.d}>
              <motion.g initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ ...SPRING, delay: 0.1 + i * 0.03 }} style={{ originX: 0.5, originY: 1 }}>
                {r.kcal > 0 ? (
                  <>
                    <rect x={x} y={H - hp} width={bw} height={hp} fill={PROTEIN} />
                    <rect x={x} y={H - hp - hc} width={bw} height={hc} fill={CARBS} />
                    <rect x={x} y={H - hp - hc - hf} width={bw} height={hf} fill={FATS} rx={0} />
                  </>
                ) : (
                  <rect x={x} y={H - 3} width={bw} height={3} rx={1.5} fill="var(--track)" />
                )}
              </motion.g>
              <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize={10} fill={isToday ? "var(--ink)" : "var(--muted)"} fontWeight={isToday ? 700 : 400}>
                {dayShort(r.d).slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-3.5">
        <MacroDot value="Protein" color={PROTEIN} />
        <MacroDot value="Carbs" color={CARBS} />
        <MacroDot value="Fats" color={FATS} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- expenditure (More stats)

/** Average kcal/day burned (exercise log) per period, against the period before it. */
function ExpenditureChanges({ exercises, today }: { exercises: ExerciseEntry[]; today: string }) {
  const byDay = new Map<string, number>();
  for (const e of exercises) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.kcal);
  const sum = (from: string, to: string) => {
    let s = 0;
    for (const [d, v] of byDay) if (d >= from && d <= to) s += v;
    return s;
  };
  const periods = [3, 7, 14, 30, 90];
  return (
    <Card padding={0}>
      <div className="px-4 pb-1 pt-3.5">
        <p className="text-[17px] font-bold">Expenditure changes</p>
        <p className="text-xs muted">Average burned from logged exercise, vs the period before</p>
      </div>
      <div className="px-4">
        {periods.map((n, i) => {
          const from = addDays(today, -(n - 1));
          const prevTo = addDays(from, -1);
          const prevFrom = addDays(prevTo, -(n - 1));
          const avg = sum(from, today) / n;
          const prev = sum(prevFrom, prevTo) / n;
          const d = Math.round(avg - prev);
          const series = Array.from({ length: Math.min(n, 30) }, (_, k) => byDay.get(addDays(today, -(Math.min(n, 30) - 1 - k))) ?? 0);
          const text = avg === 0 && prev === 0 ? "No exercise" : Math.abs(d) < 5 ? "No change" : d > 0 ? `Up ${d} kcal/day` : `Down ${Math.abs(d)} kcal/day`;
          return (
            <div key={n}>
              {i > 0 ? <Hair /> : null}
              <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-2.5">
                <span className="flex flex-col">
                  <span className="text-[13px] font-semibold">{n} day</span>
                  <span className="num text-[11px] muted">{Math.round(avg)} kcal/day</span>
                </span>
                <span className="flex justify-center">{series.some((v) => v > 0) ? <Spark values={series} color="var(--green)" /> : <span className="h-[22px]" />}</span>
                <span className="num text-right text-[13px] font-bold" style={{ color: text === "No change" || text === "No exercise" ? "var(--muted)" : d > 0 ? "var(--green)" : "var(--ink)" }}>
                  {text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- BMI (More stats)

const BMI_BANDS = [
  { label: "Underweight", upTo: 18.5, color: "#5B8DEF" },
  { label: "Healthy", upTo: 25, color: "#2FB35E" },
  { label: "Overweight", upTo: 30, color: "#E5A15B" },
  { label: "Obese", upTo: 99, color: "#E9636B" },
];
const BMI_MIN = 15;
const BMI_MAX = 40;

function BmiCard({ heightCm, weightKg }: { heightCm: number | null; weightKg: number | null }) {
  if (!heightCm || !weightKg) {
    return (
      <Card>
        <p className="text-[17px] font-bold">Your BMI</p>
        <p className="mt-1 text-[13px] muted">
          Add your height and weight in{" "}
          <Link href="/profile/details" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            Personal details
          </Link>{" "}
          to see it.
        </p>
      </Card>
    );
  }
  const bmi = weightKg / (heightCm / 100) ** 2;
  const band = BMI_BANDS.find((b) => bmi < b.upTo) ?? BMI_BANDS[BMI_BANDS.length - 1];
  const pos = Math.max(0, Math.min(1, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)));
  const stop = (v: number) => `${(((v - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100).toFixed(1)}%`;
  const gradient = `linear-gradient(90deg, ${BMI_BANDS[0].color} 0%, ${BMI_BANDS[0].color} ${stop(17.5)}, ${BMI_BANDS[1].color} ${stop(19.5)}, ${BMI_BANDS[1].color} ${stop(24)}, ${BMI_BANDS[2].color} ${stop(26)}, ${BMI_BANDS[2].color} ${stop(29)}, ${BMI_BANDS[3].color} ${stop(31)}, ${BMI_BANDS[3].color} 100%)`;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[17px] font-bold">Your BMI</p>
        <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${band.color} 16%, transparent)`, color: band.color }}>
          {band.label}
        </span>
      </div>
      <p className="num mt-1 text-[32px] font-extrabold leading-none" style={{ letterSpacing: "-0.04em" }}>
        {bmi.toFixed(1)}
      </p>
      <div className="relative mt-4 h-3 rounded-full" style={{ background: gradient }}>
        <motion.span
          className="absolute top-1/2 block rounded-full"
          style={{ width: 6, height: 22, background: "var(--ink)", border: "2px solid var(--card)", translateX: "-50%", translateY: "-50%" }}
          initial={{ left: "0%" }}
          animate={{ left: `${pos * 100}%` }}
          transition={{ ...SPRING, delay: 0.2 }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
        {BMI_BANDS.map((b, i) => (
          <MacroDot key={b.label} value={`${b.label} ${i === 0 ? "< 18.5" : i === 3 ? "30+" : `${BMI_BANDS[i - 1].upTo}–${b.upTo}`}`} color={b.color} />
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- photos (More stats)

function PhotosStrip({ photos }: { photos: ProgressPhoto[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { base64 } = await toJpegBase64(file, 1024, 0.82);
      const r = await uploadProgressPhoto({ base64 });
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that photo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(p: ProgressPhoto) {
    setDeleting(true);
    try {
      await deleteProgressPhoto(p.id);
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[17px] font-bold">Progress photos</p>
        <span className="text-xs muted">{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} · private` : "Only you can see these"}</span>
      </div>
      <div className="-mx-4 mt-3 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
        <div className="flex w-max gap-2.5">
          <button type="button" className="press flex h-[132px] w-[100px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl text-[12px] font-bold" style={{ background: "var(--card2)", border: "1.5px dashed var(--hair)", color: "var(--ink)" }} disabled={busy} onClick={() => input.current?.click()}>
            <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
              {busy ? <Spinner size={16} /> : photos.length ? <Plus size={18} /> : <Camera size={18} />}
            </span>
            {busy ? "Uploading…" : "Upload a photo"}
          </button>
          {photos.map((p) => (
            <button key={p.id} type="button" className="press relative h-[132px] w-[100px] shrink-0 overflow-hidden rounded-2xl" style={{ background: "var(--card2)", border: 0, padding: 0 }} onClick={() => setOpen(p)} aria-label={`Progress photo from ${dayMonth(p.date)}`}>
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
              <span className="absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 text-left text-[11px] font-bold" style={{ color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.55))" }}>
                {dayMonth(p.date)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
      {error ? (
        <div className="mt-2.5">
          <ErrorNote text={error} />
        </div>
      ) : null}

      <AnimatePresence>
        {open ? (
          <motion.div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-4" style={{ background: "rgba(0,0,0,0.85)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Progress photo" onClick={() => setOpen(null)}>
            {open.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.url} alt={`Progress photo from ${dayMonth(open.date)}`} className="max-h-[72vh] w-auto max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
            ) : null}
            <p className="text-sm font-semibold" style={{ color: "#fff" }}>
              {parseIso(open.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="press flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: 0 }} onClick={() => setOpen(null)}>
                <Close size={16} />
                Close
              </button>
              <button type="button" className="press flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold" style={{ background: "var(--red)", color: "#fff", border: 0 }} disabled={deleting} onClick={() => void remove(open)}>
                {deleting ? <Spinner size={14} /> : <Trash size={16} />}
                Delete
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}

// ---------------------------------------------------------------- misc

/** How many medals are unlocked; taps through to the full grid. */
function BadgesCard({ progress }: { progress: BadgeProgress }) {
  const got = earnedCount(progress);
  return (
    <Link href="/badges" className="card press flex w-full items-center gap-3.5" style={{ padding: 14 }} aria-label={`Badges: ${got} of ${ALL_BADGES.length} earned`}>
      <HexMedal number={got} earned={got > 0} size={48} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-bold">Badges</span>
        <span className="text-xs muted">
          {got} of {ALL_BADGES.length} earned
        </span>
      </span>
      <Chevron />
    </Link>
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

function Bars({ values, target, labels, color, dim, lastColor, height }: { values: number[]; target: number; labels: string[]; color: string; dim: string; lastColor: string; height: number }) {
  const max = Math.max(...values, target, 1);
  return (
    <div className="mt-3">
      <div className="relative flex items-end gap-2" style={{ height }}>
        <div className="pointer-events-none absolute inset-x-0" style={{ bottom: `${(target / max) * 100}%`, borderTop: "1px dashed var(--hair)" }} aria-hidden="true" />
        {values.map((v, i) => {
          const last = i === values.length - 1;
          const c = last ? lastColor : v >= target && target > 0 ? color : dim;
          const f = Math.max(0.03, Math.min(1, v / max));
          return <motion.div key={i} className="flex-1" style={{ background: c, borderRadius: "8px 8px 4px 4px" }} initial={{ height: "3%" }} animate={{ height: `${f * 100}%` }} transition={{ ...SPRING, delay: 0.2 + i * 0.02 }} />;
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[10px]" style={{ color: i === labels.length - 1 ? "var(--ink)" : "var(--muted)", fontWeight: i === labels.length - 1 ? 700 : 400 }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
