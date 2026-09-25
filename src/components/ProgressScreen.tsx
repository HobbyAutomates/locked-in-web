"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { deleteProgressPhoto, uploadProgressPhoto } from "@/lib/actions";
import { ALL_BADGES, earnedCount, type BadgeProgress } from "@/lib/badges";
import { addDays, daysBetween, parseIso, today as todayIso, weekStart } from "@/lib/dates";
import { toJpegBase64 } from "@/lib/image";
import { totalsFor } from "@/lib/totals";
import { restByMuscle } from "@/lib/streaks";
import { MUSCLE_COLOR, type Muscle } from "@/lib/muscles";
import type { ExerciseEntry, Meal, Profile, ProgressPhoto, WeightEntry, Workout } from "@/lib/types";
import { weightText } from "@/lib/display";
import { ageYears, calorieWords, edFlags, isTeen, screenInput } from "@/lib/goals";
import { bmi, bmiCategoryIndia, healthyRange, waistToHeight, whtrWords } from "@/lib/bmi";
import { bestDayRun, clockText, energyDays, goalEta, goalFraction, istMinutes, macroAverages, macroTargets, mealTimes, monthDay, proteinPicks, slopePerDay, weekFlames, weightTrend, type FlameDay } from "@/lib/progressStats";
import { mealTypeLabel } from "@/lib/mealType";
import { smoothPath } from "@/lib/svgPath";
import { BmiCard, SafetyNote, ScienceSheet, TeenGoalMigration, WaistRow } from "./Science";
import { LockedMedal, MetalMedal, TROPHY_ICON, medalShelf } from "./Medal";
import { CountUp, MRise, STAGGER, drawLen, md } from "./motion";
import { LineIcon } from "./lineIcons";
import { Camera, ChevronDown, Close, Plus, Spinner, Trash } from "./icons";
import { BreathingFlame, Card, Chevron, ErrorNote, Hair, MacroDot, Rise, SPRING, Segmented, fmt } from "./ui";

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

/** v2.12 range switch: the weight, energy and macro cards follow it. */
const RANGES = [
  { label: "Week", days: 7, tag: "7d", title: "this week" },
  { label: "Month", days: 30, tag: "30d", title: "30 days" },
  { label: "3 months", days: 90, tag: "90d", title: "3 months" },
] as const;

const dayShort = (d: string) => parseIso(d).toLocaleDateString("en-IN", { weekday: "short" });
const dayMonth = (d: string) => parseIso(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const kcalText = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Chart width in SVG units: a 390 px phone minus the page and card padding. Wider screens scale it. */
const CW = 318;

/**
 * v2.12 Progress: Weight, Streak, Energy, Macros, BMI and Meal times, in that order, with the
 * slow premium entrances (lib/motion.css). Everything the older screen had lives on under
 * "More stats" (weight changes, daily calories by macro, expenditure, photos, week streak,
 * badges, sessions per week).
 */
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
  const [range, setRange] = useState(0);
  const R = RANGES[range];
  // v2.10: low BMI / rapid loss show the kind note with helplines (never a popup; closable).
  const flags = edFlags(screenInput({ ...profile, weight_kg: current ?? null }, { weights: weights.map((w) => ({ date: w.date, kg: w.weight_kg })), today: t }));
  const [safetyClosed, setSafetyClosed] = useState(false);
  const activity = [workouts.map((w) => w.date), exercises.map((e) => e.date), meals.map((m) => m.date)];
  const best = bestDayRun(dayStreak, ...activity);
  const card = (i: number) => 300 + i * STAGGER * 2;

  return (
    <div className="flex flex-col gap-3.5">
      <MRise delay={0}>
        <h1 className="screen-title" style={{ padding: "8px 4px 2px" }}>
          Progress
        </h1>
      </MRise>

      <TeenGoalMigration profile={profile} />

      <MRise delay={150}>
        <RangeTabs value={range} onChange={setRange} />
      </MRise>

      <MRise delay={card(0)}>
        <WeightCard profile={profile} weights={weights} today={t} days={R.days} tag={R.tag} b={card(0)} />
      </MRise>

      {flags.length && !safetyClosed ? (
        <Rise index={1}>
          <SafetyNote flags={flags} onClose={() => setSafetyClosed(true)} />
        </Rise>
      ) : null}

      <MRise delay={card(1)}>
        <StreakCard dayStreak={dayStreak} best={best} flames={weekFlames(t, ...activity)} b={card(1)} />
      </MRise>

      <MRise delay={card(2)}>
        <EnergyCard meals={meals} profile={profile} today={t} range={range} b={card(2)} />
      </MRise>

      <MRise delay={card(3)}>
        <MacrosCard meals={meals} profile={profile} today={t} days={R.days} range={range} b={card(3)} />
      </MRise>

      <MRise delay={card(4)}>
        <BmiScaleCard profile={profile} weightKg={current ?? null} b={card(4)} />
      </MRise>

      <MRise delay={card(5)}>
        <MealTimesCard meals={meals} today={t} days={range === 2 ? 90 : 30} b={card(5)} />
      </MRise>

      <MRise delay={card(6)}>
        <button
          type="button"
          aria-expanded={showMore}
          className="press flex min-h-11 w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-semibold"
          style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
          onClick={() => setShowMore((v) => !v)}
        >
          More stats
          <ChevronDown size={16} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
      </MRise>

      {showMore ? (
        <div className="flex flex-col gap-3.5">
          <Rise index={0}>
            <WeightChanges weights={weights} today={t} />
          </Rise>

          <Rise index={1}>
            <CaloriesChart meals={meals} today={t} goal={profile.calorie_target} hide={profile.hide_numbers === true} />
          </Rise>

          <Rise index={1}>
            <ExpenditureChanges exercises={exercises} today={t} />
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

// ---------------------------------------------------------------- building blocks

function RangeTabs({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div role="tablist" aria-label="Range" className="grid grid-cols-3 gap-1 rounded-[14px] p-1" style={{ background: "var(--track)" }}>
      {RANGES.map((r, i) => (
        <button
          key={r.label}
          type="button"
          role="tab"
          aria-selected={value === i}
          className="press h-9 rounded-[11px] text-[14px]"
          style={{ border: 0, background: value === i ? "var(--card)" : "transparent", color: value === i ? "var(--ink)" : "var(--muted)", fontWeight: value === i ? 700 : 600, boxShadow: value === i ? "var(--shadow-sm)" : "none" }}
          onClick={() => onChange(i)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** The v2.12 card surface: 22 px corners, 20 px padding, 14 px rhythm. */
function PCard({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3.5" style={{ background: "var(--card)", borderRadius: 22, padding: 20, boxShadow: "var(--pcard-ring)" }}>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold muted">{children}</p>;
}

type Tone = "good" | "bad" | "flat";
const TONE: Record<Tone, { mark: string; bg: string; ink: string }> = {
  good: { mark: "var(--green)", bg: "var(--green-bg)", ink: "var(--green-ink)" },
  bad: { mark: "var(--orange)", bg: "var(--orange-bg)", ink: "var(--orange-ink)" },
  flat: { mark: "var(--ink)", bg: "var(--card2)", ink: "var(--muted)" },
};

function Pill({ tone, children, delay }: { tone: Tone; children: React.ReactNode; delay?: number }) {
  return (
    <span className={`num inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${delay != null ? "m-drop" : ""}`} style={md(delay ?? 0, { background: TONE[tone].bg, color: TONE[tone].ink })}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- 1 · weight

function WeightCard({ profile, weights, today, days, tag, b }: { profile: Profile; weights: WeightEntry[]; today: string; days: number; tag: string; b: number }) {
  const router = useRouter();
  const imperial = profile.units === "imperial";
  const conv = (kg: number) => (imperial ? kg * 2.20462 : kg);
  const unit = imperial ? "lb" : "kg";
  const current = weights[0]?.weight_kg ?? profile.weight_kg;
  const start = weights.length ? weights[weights.length - 1].weight_kg : profile.weight_kg;
  const goal = profile.goal_weight_kg;
  const pts = weightTrend(weights, today, days);
  const change = pts.length >= 2 ? pts[pts.length - 1].avg - pts[0].avg : null;
  const eta = goalEta(pts.length ? pts[pts.length - 1].avg : current, goal, slopePerDay(weightTrend(weights, today, Math.max(days, 30))), profile.goal_speed_kg_wk, today);
  const want = goal != null && current != null ? Math.sign(goal - current) : profile.goal_type === "lose" ? -1 : profile.goal_type === "gain" ? 1 : 0;
  const tone: Tone = change == null || Math.abs(change) < 0.05 ? "flat" : want === 0 ? (Math.abs(change) < 0.5 ? "good" : "bad") : Math.sign(change) === want ? "good" : "bad";
  const pill = change == null ? "No trend yet" : Math.abs(change) < 0.05 ? `No change · ${tag}` : `${change < 0 ? "−" : "+"}${fmt(Math.round(Math.abs(conv(change)) * 10) / 10)} ${unit} · ${tag}`;

  // Chart: x by date across the range, y fitted to the averages.
  const H = 130;
  const from = addDays(today, -days);
  const x = (d: string) => (Math.max(0, Math.min(days, daysBetween(from, d))) / days) * (CW - 8) + 4;
  const vals = pts.map((p) => p.avg);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 0.6);
  const mid = (hi + lo) / 2;
  const y = (v: number) => 18 + ((mid + span / 2 - v) / span) * (H - 48);
  const xy = pts.map((p) => [x(p.date), y(p.avg)] as [number, number]);
  const line = smoothPath(xy);
  const area = xy.length >= 2 ? `${line} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z` : "";
  const end = xy[xy.length - 1];

  const last = weights[0]?.date ?? null;
  const due = last ? Math.max(0, 7 - daysBetween(last, today)) : 0;
  const note = weights.length === 0 ? "Log your first weigh-in" : due === 0 ? "Weigh-in due today" : `Next weigh-in in ${due}d`;
  const frac = goalFraction(start, current, goal);

  return (
    <PCard label="Weight">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Weight</Label>
          <p className="num font-extrabold" style={{ fontSize: 40, letterSpacing: "-1.5px", lineHeight: 1.1 }}>
            {current != null ? <CountUp value={Math.round(conv(current) * 10) / 10} decimals={1} delay={b + 150} format={(n) => fmt(Math.round(n * 10) / 10)} /> : "—"}
            <span className="ml-1 text-[15px] font-semibold muted" style={{ letterSpacing: 0 }}>
              {unit}
            </span>
          </p>
        </div>
        <Pill tone={tone} delay={b + 500}>
          {pill}
        </Pill>
      </div>

      {xy.length >= 2 ? (
        <svg viewBox={`0 0 ${CW} ${H}`} className="block w-full" role="img" aria-label={`Weight, 7-day average: ${change == null ? "no trend yet" : `${change < 0 ? "down" : "up"} ${fmt(Math.round(Math.abs(conv(change)) * 10) / 10)} ${unit}`} over ${days} days`}>
          <path d={area} fill={TONE[tone].mark} fillOpacity={0.16} className="m-fade" style={md(b + 1500)} />
          <path d={line} fill="none" stroke={TONE[tone].mark} strokeWidth={2.4} strokeLinecap="round" pathLength={1} className="m-draw" style={drawLen(1, b + 300)} />
          <circle cx={end[0]} cy={end[1]} r={5} fill={TONE[tone].mark} stroke="var(--card)" strokeWidth={2} className="m-pop" style={md(b + 2100)} />
        </svg>
      ) : (
        <p className="text-[13px] muted">Log a few weigh-ins to see your trend.</p>
      )}

      <div className="flex justify-between gap-2 text-[12px] muted">
        <span>{pts.length ? monthDay(pts[0].date) : ""}</span>
        {goal != null ? (
          <span className="num text-center">
            Goal {weightText(goal, profile.units)}
            {eta.reached ? " · reached" : eta.date ? ` · about ${monthDay(eta.date)}` : ""}
          </span>
        ) : (
          <Link href="/profile/goal" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            Set a goal weight
          </Link>
        )}
        <span>Today</span>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--hair)" }}>
        <span className="text-[12px] muted">
          {note}
          {goal != null && start != null ? ` · ${Math.round(frac * 100)}% to goal` : ""}
        </span>
        <button type="button" className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold" style={{ background: weights.length === 0 || due === 0 ? "var(--btn)" : "var(--card2)", color: weights.length === 0 || due === 0 ? "var(--btn-ink)" : "var(--ink)", border: 0 }} onClick={() => router.push("/profile/weight?log=1")}>
          <LineIcon name="scale" size={16} stroke={1.8} />
          Log weight
        </button>
      </div>
    </PCard>
  );
}

// ---------------------------------------------------------------- 2 · streak

function StreakCard({ dayStreak, best, flames, b }: { dayStreak: number; best: number; flames: FlameDay[]; b: number }) {
  const toBeat = best - dayStreak + 1;
  const done = flames.filter((f) => f.state === "done").length;
  return (
    <PCard label="Streak">
      <Label>Streak</Label>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <LineIcon name="flame" size={34} stroke={2} style={{ color: "var(--orange)" }} />
          <span className="num font-extrabold" style={{ fontSize: 44, letterSpacing: "-1.5px", lineHeight: 1 }}>
            <CountUp value={dayStreak} delay={b + 200} />
          </span>
          <span className="ml-1 text-[15px] font-semibold muted">{dayStreak === 1 ? "day" : "days"}</span>
        </div>
        <div className="text-right text-[13px] muted">
          Best{" "}
          <b className="num" style={{ color: "var(--ink)" }}>
            {best}
          </b>
          <br />
          {best === 0 ? "Log today to start" : dayStreak >= best ? "Personal best" : `${toBeat} to beat it`}
        </div>
      </div>
      <div role="img" aria-label={`This week: ${done} of 7 days logged`} className="grid grid-cols-7">
        {flames.map((f, i) => (
          <div key={f.date} className="flex flex-col items-center gap-1.5">
            <span
              className="m-pop grid place-items-center rounded-full"
              style={md(b + 520 + i * 120, {
                width: 30,
                height: 30,
                background: f.state === "done" ? "var(--orange)" : f.state === "open" ? "transparent" : "var(--track)",
                border: f.state === "open" ? "1.5px dashed var(--orange)" : 0,
                opacity: f.state === "future" ? 0.55 : 1,
                color: "var(--bg)",
              })}
            >
              {f.state === "done" ? <LineIcon name="flame" size={15} stroke={2} /> : null}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: f.state === "open" ? "var(--ink)" : "var(--muted)" }}>
              {f.letter}
            </span>
          </div>
        ))}
      </div>
    </PCard>
  );
}

// ---------------------------------------------------------------- 3 · energy

const STATUS_COLOR = { on: "var(--green)", over: "var(--orange)", under: "var(--blue)", none: "var(--muted)" } as const;

function EnergyCard({ meals, profile, today, range, b }: { meals: Meal[]; profile: Profile; today: string; range: number; b: number }) {
  const target = Math.max(1, profile.calorie_target);
  const hide = profile.hide_numbers === true;
  const R = RANGES[range];
  const from = range === 0 ? weekStart(today) : addDays(today, -(R.days - 1));
  const axisN = range === 0 ? 7 : R.days;
  const days = energyDays(meals, from, today, target);
  const logged = days.filter((d) => d.logged);
  const past = logged.filter((d) => d.date !== today);
  const todayRow = days.find((d) => d.date === today);
  // Today only counts once it's already on target or over; a half-logged day isn't "under".
  const judged = [...past, ...(todayRow && (todayRow.status === "on" || todayRow.status === "over") ? [todayRow] : [])];
  const on = judged.filter((d) => d.status === "on").length;
  const avgRows = past.length ? past : logged;
  const avg = avgRows.length ? avgRows.reduce((a, d) => a + d.kcal, 0) / avgRows.length : 0;

  const H = 120;
  const x = (i: number) => (axisN <= 1 ? CW / 2 : 6 + (i * (CW - 12)) / (axisN - 1));
  const kc = logged.map((d) => d.kcal);
  const lo = Math.min(target, ...kc) * 0.85;
  const hi = Math.max(target, ...kc) * 1.06;
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * 86;
  const pts = days.map((d, i) => ({ ...d, x: x(i), y: y(d.kcal) })).filter((d) => d.logged);
  const line = smoothPath(pts.map((p) => [p.x, p.y]));
  const r = axisN <= 7 ? 4 : axisN <= 31 ? 3 : 2.2;
  const step = Math.min(230, 1600 / Math.max(1, pts.length));
  const labels: { i: number; text: string; anchor: "start" | "middle" | "end" }[] =
    range === 0
      ? Array.from({ length: 7 }, (_, i) => ({ i, text: "MTWTFSS"[i], anchor: "middle" as const }))
      : [0, Math.round((axisN - 1) / 3), Math.round((2 * (axisN - 1)) / 3), axisN - 1].map((i, k) => ({ i, text: k === 3 ? "Today" : monthDay(addDays(from, i)), anchor: k === 0 ? ("start" as const) : k === 3 ? ("end" as const) : ("middle" as const) }));

  return (
    <PCard label="Energy">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label>Energy · {R.title}</Label>
          {hide ? (
            <p className="mt-0.5 text-[20px] font-semibold" style={{ letterSpacing: "-0.5px" }}>
              {logged.length ? calorieWords(avg, target) : "Nothing logged yet"}
            </p>
          ) : (
            <p className="num mt-0.5 font-semibold" style={{ fontSize: 30, letterSpacing: "-1px" }}>
              {logged.length ? <CountUp value={Math.round(avg)} delay={b + 200} format={kcalText} /> : "—"} <span className="text-[14px] font-medium muted">avg a day</span>
            </p>
          )}
        </div>
        <Pill tone={judged.length === 0 ? "flat" : on / judged.length >= 0.6 ? "good" : "bad"} delay={b + 500}>
          {judged.length ? `${on} of ${judged.length} on target` : "No full days yet"}
        </Pill>
      </div>
      {logged.length ? (
        <svg viewBox={`0 0 ${CW} ${H}`} className="block w-full" role="img" aria-label={`Calories eaten each day against a flat target${hide ? "" : ` of ${kcalText(target)}`}: ${on} of ${judged.length} days on target`}>
          <line x1={0} y1={y(target)} x2={CW} y2={y(target)} stroke="var(--green)" strokeWidth={1.5} strokeDasharray="3 4" className="m-growx" style={md(b + 200)} />
          <text x={CW} y={y(target) - 6} textAnchor="end" fontSize={10} fontWeight={600} fill="var(--green)">
            target
          </text>
          {pts.length >= 2 ? <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" pathLength={1} className="m-draw" style={drawLen(1, b + 500)} /> : null}
          {pts.map((p, k) => {
            const pending = p.date === today && p.status !== "on" && p.status !== "over";
            return <circle key={p.date} cx={p.x} cy={p.y} r={r} fill={pending ? "var(--card)" : STATUS_COLOR[p.status]} stroke={pending ? "var(--muted)" : "var(--card)"} strokeWidth={r > 3 ? 2 : 1.2} className="m-pop" style={md(b + 700 + (k + 1) * step)} />;
          })}
          {labels.map((l) => (
            <text key={l.i} x={l.anchor === "start" ? 0 : l.anchor === "end" ? CW : x(l.i)} y={118} textAnchor={l.anchor} fontSize={11} fontWeight={600} fill={l.text === "Today" || (range === 0 && addDays(from, l.i) === today) ? "var(--ink)" : "var(--muted)"}>
              {l.text}
            </text>
          ))}
        </svg>
      ) : (
        <p className="text-[13px] muted">Log a meal to see your energy line.</p>
      )}
      <div className="flex flex-wrap gap-3.5 text-[11px] font-semibold muted">
        <span className="inline-flex items-center gap-1.5">
          <Dot color="var(--green)" /> On target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dot color="var(--orange)" /> Over
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dot color="var(--blue)" /> Under
        </span>
      </div>
    </PCard>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: 8, height: 8, background: color }} />;
}

// ---------------------------------------------------------------- 4 · macros

function MacrosCard({ meals, profile, today, days, range, b }: { meals: Meal[]; profile: Profile; today: string; days: number; range: number; b: number }) {
  const from = range === 0 ? weekStart(today) : addDays(today, -(days - 1));
  const avg = macroAverages(meals, from, today, today);
  const tg = macroTargets(profile);
  const rings = [
    { key: "Protein", value: avg.protein, target: tg.protein, color: "var(--blue)" },
    { key: "Carbs", value: avg.carbs, target: tg.carbs, color: "var(--orange)" },
    { key: "Fat", value: avg.fat, target: tg.fat, color: "var(--purple)" },
  ].map((m) => ({ ...m, pct: m.target > 0 ? m.value / m.target : 0 }));
  const todayProtein = totalsFor(meals, today).protein;
  const toGo = Math.round(tg.protein - todayProtein);
  const picks = proteinPicks(toGo);

  return (
    <PCard label="Macros">
      <Label>Macros · daily average</Label>
      <div role="img" aria-label={avg.days ? rings.map((m) => `${m.key} ${Math.round(m.pct * 100)} percent of target`).join(", ") : "No meals logged in this range yet"} className="grid grid-cols-3">
        {rings.map((m, k) => {
          const sub = !avg.days ? { text: "no logs yet", color: "var(--muted)" } : m.pct < 0.9 ? { text: `${Math.round(m.target - m.value)} g to go`, color: "var(--orange-ink)" } : m.pct <= 1.1 ? { text: "on track", color: "var(--green-ink)" } : { text: `${Math.round(m.value - m.target)} g over`, color: "var(--muted)" };
          return (
            <div key={m.key} className="flex flex-col items-center gap-1.5">
              <svg width={78} height={78} viewBox="0 0 78 78" aria-hidden="true">
                <circle cx={39} cy={39} r={32} fill="none" stroke="var(--track)" strokeWidth={8} />
                {m.pct > 0.005 ? <circle cx={39} cy={39} r={32} fill="none" stroke={m.color} strokeWidth={8} strokeLinecap="round" pathLength={1} transform="rotate(-90 39 39)" className="m-draw" style={drawLen(Math.min(1, m.pct), b + 200 + (k + 1) * 260)} /> : null}
                <text x={39} y={44} textAnchor="middle" fontSize={15} fontWeight={800} fill="var(--ink)">
                  {Math.round(m.pct * 100)}%
                </text>
              </svg>
              <span className="text-[13px] font-bold">{m.key}</span>
              <span className="text-[12px] font-semibold" style={{ color: sub.color }}>
                {sub.text}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-baseline gap-1.5 border-t pt-3" style={{ borderColor: "var(--hair)" }}>
        {toGo > 3 ? (
          <>
            <span className="num text-[20px] font-extrabold" style={{ color: "var(--blue)" }}>
              {toGo} g
            </span>
            <span className="text-[14px] font-semibold">protein to go today. Quick picks:</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: "var(--green-ink)" }}>
            <LineIcon name="check" size={16} stroke={2} />
            Protein goal hit today
          </span>
        )}
      </div>
      {toGo > 3 ? (
        <div className="flex gap-1.5">
          {picks.map((p, k) => (
            <Link key={p.name} href="/log?mode=meal" className="press m-drop flex-1 rounded-xl px-2.5 py-2 text-[12px]" style={md(b + 1300 + (k + 1) * 140, { background: "var(--card2)", color: "var(--ink)", minHeight: 44 })}>
              <span className="block font-bold">{p.name}</span>
              <span className="mt-0.5 block muted">+{p.protein} g protein</span>
            </Link>
          ))}
        </div>
      ) : null}
    </PCard>
  );
}

// ---------------------------------------------------------------- 5 · BMI (Indian ranges)

const BMI_LO = 15;
const BMI_HI = 32;
const BANDS = [
  { from: BMI_LO, to: 18.5, label: "Under", color: "var(--blue)" },
  { from: 18.5, to: 23, label: "Healthy", color: "var(--green)" },
  { from: 23, to: 25, label: "Over", color: "var(--orange)" },
  { from: 25, to: BMI_HI, label: "Obese", color: "var(--red)" },
];
const BMI_WORDS = {
  Underweight: { text: "Below healthy", color: "var(--blue-ink)" },
  Normal: { text: "Healthy", color: "var(--green-ink)" },
  Overweight: { text: "A little above healthy", color: "var(--orange-ink)" },
  Obese: { text: "Above healthy", color: "var(--red-ink)" },
} as const;

/**
 * Adults: the Indian-cut-off scale with a swinging marker, the healthy weight range and (only when
 * a waist is saved) waist ÷ height. Teens and missing height/weight keep the v2.10 card, which
 * handles WHO growth charts and the "add your height" prompt.
 */
function BmiScaleCard({ profile, weightKg, b }: { profile: Profile; weightKg: number | null; b: number }) {
  const [science, setScience] = useState(false);
  const [waistOpen, setWaistOpen] = useState(false);
  const value = bmi(weightKg, profile.height_cm);
  const teen = isTeen(ageYears(profile.dob));
  if (value == null || teen || !profile.height_cm) return <BmiCard profile={profile} weightKg={weightKg} waist />;

  const cat = bmiCategoryIndia(value);
  const words = BMI_WORDS[cat];
  const xOf = (v: number) => 1 + ((Math.max(BMI_LO, Math.min(BMI_HI, v)) - BMI_LO) / (BMI_HI - BMI_LO)) * (CW - 2);
  const mx = xOf(Math.max(BMI_LO + 0.3, Math.min(BMI_HI - 0.3, value)));
  const range = healthyRange(profile.height_cm);
  const w = (kg: number) => (profile.units === "imperial" ? Math.round(kg * 2.20462) : Math.round(kg));
  const whtr = waistToHeight(profile.waist_cm, profile.height_cm);
  const canWaist = profile.hide_numbers !== null; // null = the v34 columns aren't there yet

  return (
    <PCard label="BMI">
      <div className="flex items-center justify-between gap-2">
        <Label>BMI · Indian ranges</Label>
        <button type="button" className="press inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold muted" style={{ background: "none", border: 0, padding: 0 }} onClick={() => setScience(true)}>
          <LineIcon name="info" size={15} stroke={2} />
          The science
        </button>
      </div>
      <ScienceSheet open={science} onClose={() => setScience(false)} />
      <div className="-mt-2 flex items-baseline gap-2.5">
        <span className="num font-extrabold" style={{ fontSize: 34, letterSpacing: "-1px" }}>
          <CountUp value={Math.round(value * 10) / 10} decimals={1} delay={b + 200} />
        </span>
        <span className="text-[14px] font-semibold" style={{ color: words.color }}>
          {words.text}
        </span>
      </div>
      <svg viewBox={`0 0 ${CW} 64`} className="block w-full" role="img" aria-label={`BMI ${value.toFixed(1)} on the Indian scale: ${cat.toLowerCase()}`}>
        {BANDS.map((band, k) => {
          const x0 = xOf(band.from) + (k ? 1 : 0);
          const x1 = xOf(band.to) - (k < BANDS.length - 1 ? 1 : 0);
          return (
            <g key={band.label}>
              <rect x={x0} y={18} width={Math.max(0, x1 - x0)} height={12} rx={6} fill={band.color} className="m-growx" style={md(b + 150 + (k + 1) * 150)} />
              <text x={(x0 + x1) / 2} y={48} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--muted)">
                {band.label}
              </text>
            </g>
          );
        })}
        {[18.5, 23, 25].map((v) => (
          <text key={v} x={xOf(v)} y={62} textAnchor="middle" fontSize={10} fontWeight={500} fill="var(--muted)">
            {v}
          </text>
        ))}
        <g className="m-sweep" style={md(b + 900, { ["--a" as string]: `${-mx}px`, ["--b" as string]: `${CW - mx}px`, ["--c" as string]: `${-mx * 0.45}px` })}>
          <path d={`M${mx - 7},4 L${mx + 7},4 L${mx},14 Z`} fill="var(--ink)" />
          <rect x={mx - 1.5} y={14} width={3} height={20} rx={1.5} fill="var(--ink)" />
        </g>
      </svg>
      <div className={`grid gap-2.5 ${whtr != null ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-[14px] p-3" style={{ background: "var(--card2)" }}>
          <p className="text-[12px] font-semibold muted">Healthy weight</p>
          <p className="num mt-0.5 text-[17px] font-bold">
            {w(range.min)} – {w(range.max)} {profile.units === "imperial" ? "lb" : "kg"}
          </p>
        </div>
        {whtr != null ? (
          <button type="button" className="press rounded-[14px] p-3 text-left" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} aria-expanded={waistOpen} onClick={() => setWaistOpen((v) => !v)}>
            <span className="block text-[12px] font-semibold muted">Waist ÷ height</span>
            <span className="num mt-0.5 block text-[17px] font-bold">
              {whtr.toFixed(2)}{" "}
              <span className="text-[12px]" style={{ color: whtrWords(whtr).ok ? "var(--green-ink)" : "var(--orange-ink)" }}>
                {whtrWords(whtr).ok ? "under 0.5" : "0.5 or more"}
              </span>
            </span>
          </button>
        ) : null}
      </div>
      {canWaist && whtr == null && !waistOpen ? (
        <button type="button" className="press -mt-1 self-start text-[12px] font-semibold underline muted" style={{ background: "none", border: 0, padding: "6px 0" }} onClick={() => setWaistOpen(true)}>
          Add a waist measurement
        </button>
      ) : null}
      {canWaist && waistOpen ? <WaistRow profile={profile} /> : null}
    </PCard>
  );
}

// ---------------------------------------------------------------- 6 · meal times

const MEAL_DOT = { breakfast: "var(--orange)", lunch: "var(--green)", snack: "var(--purple)", dinner: "var(--blue)" } as const;

function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 30000);
  return () => clearInterval(id);
}

function span(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  if (m >= 120) return `${Math.round(m / 60)} h`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r >= 10 ? `${h} h ${r} min` : `${h} h`;
}

function MealTimesCard({ meals, today, days, b }: { meals: Meal[]; today: string; days: number; b: number }) {
  // Minutes after midnight in India; null on the server so the first paint never disagrees.
  const now = useSyncExternalStore(subscribeMinute, () => istMinutes(new Date()), () => null);
  const rows = mealTimes(meals, today, days);
  const upcoming = now == null ? [] : rows.filter((r) => r.today == null && r.usual != null && r.usual > now + 15).sort((a, b2) => (a.usual as number) - (b2.usual as number));
  const next = upcoming[0]?.type ?? null;

  return (
    <PCard label="Meal times">
      <div className="flex items-baseline justify-between">
        <Label>Your usual meal times</Label>
        <span className="text-[12px] muted">and today</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r, k) => {
          const usual = r.usual != null ? clockText(r.usual) : null;
          let line: React.ReactNode;
          if (r.today != null) {
            const tc = clockText(r.today);
            const diff = r.usual != null ? r.today - r.usual : null;
            line = (
              <>
                Today {tc.time} {tc.ampm}
                {diff != null ? (
                  <>
                    {" · "}
                    <span className="font-bold" style={{ color: Math.abs(diff) <= 5 || diff < 0 ? "var(--green-ink)" : "var(--orange-ink)" }}>
                      {Math.abs(diff) <= 5 ? "on time" : diff < 0 ? `${span(diff)} early` : `${span(diff)} late`}
                    </span>
                  </>
                ) : null}
              </>
            );
          } else if (r.usual == null) {
            line = "Not enough logs yet";
          } else if (now == null) {
            line = "Today —";
          } else if (now > r.usual + 90) {
            line = (
              <>
                Today · <span className="font-bold">skipped</span>
              </>
            );
          } else if (now >= r.usual - 15) {
            line = (
              <>
                <span className="font-bold" style={{ color: "var(--blue-ink)" }}>Due now</span>
              </>
            );
          } else if (r.type === next) {
            line = (
              <>
                Next · <span className="font-bold" style={{ color: "var(--blue-ink)" }}>in about {span(r.usual - now)}</span>
              </>
            );
          } else {
            line = "Later today";
          }
          return (
            <div key={r.type} className="m-drop flex flex-col gap-1.5 rounded-2xl p-3.5" style={md(b + 350 + k * 150, { background: "var(--card2)" })}>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold muted">
                <Dot color={MEAL_DOT[r.type]} />
                {mealTypeLabel(r.type)}
              </span>
              <span className="num font-extrabold" style={{ fontSize: 28, letterSpacing: "-1px", lineHeight: 1 }}>
                {usual ? (
                  <>
                    {usual.time}
                    <span className="text-[13px] font-semibold muted"> {usual.ampm}</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-[12px] muted">{line}</span>
            </div>
          );
        })}
      </div>
    </PCard>
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
function CaloriesChart({ meals, today, goal, hide = false }: { meals: Meal[]; today: string; goal: number; hide?: boolean }) {
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
          <p className="text-[17px] font-bold">{hide ? "Daily average" : "Daily average calories"}</p>
          {hide ? (
            <p className="mt-0.5 text-[15px] font-bold">{logged.length ? calorieWords(avg, goal) : "Nothing logged yet"}</p>
          ) : (
            <p className="mt-0.5 flex items-baseline">
              <span className="num text-[28px] font-extrabold leading-tight">{Math.round(avg).toLocaleString("en-IN")}</span>
              <span className="ml-1 text-[13px] muted">kcal · goal {goal.toLocaleString("en-IN")}</span>
            </p>
          )}
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
  const { earned } = medalShelf(progress);
  const top = earned[0];
  return (
    <Link href="/badges" className="card press flex w-full items-center gap-3.5" style={{ padding: 14 }} aria-label={`Badges: ${got} of ${ALL_BADGES.length} earned`}>
      {top ? <MetalMedal tier={top.tier} icon={TROPHY_ICON} size={48} /> : <LockedMedal progress={got / ALL_BADGES.length} icon={TROPHY_ICON} size={48} />}
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
