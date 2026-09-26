"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { addDays, longDate, shortDate } from "@/lib/dates";
import { dismiss, useDismissed } from "@/lib/dismiss";
import { calorieBudget, totalsFor } from "@/lib/totals";
import { calorieWords } from "@/lib/goals";
import { logWater } from "@/lib/actions";
import { toggleMacroMode, useMacroMode, type MacroMode } from "@/lib/macroMode";
import { litres, WaterBottle } from "./WaterBottle";
import { carbTargetG, fatTargetG, type ExerciseEntry, type Meal, type Nudge, type Profile, type WaterEntry, type Workout, type Wrap } from "@/lib/types";
import { CalendarIcon, Check, ChevronRight, Close, Fist, Flame, Lock, MoonStar, Plus, Run, Share, Spinner } from "./icons";
import { ExerciseRow, WorkoutRow } from "./Rows";
import MealSections from "./MealSections";
import { usePendingMeals, type Pending } from "./PendingMeals";
import { BreathingFlame, Card, ErrorNote, PillButton, Ring, Rise } from "./ui";
import { HomeBanner, InboxBell, TodaySessionCard } from "./platform/HomeEntries"; // v2.13 platform

/** Background saves already pulled in by a refresh (see PendingMeals); survives remounts of Home. */
let handledSaves = 0;

type Props = {
  today: string;
  profile: Profile;
  workouts: Workout[];
  meals: Meal[];
  exercises: ExerciseEntry[];
  weekStreak: number;
  /** v2.2: consecutive IST days with anything logged (workout, exercise or meal). */
  dayStreak: number;
  thisWeek: number;
  celebrate: boolean;
  /** The 9 pm wrap (21:00–04:00 IST only), else null. */
  wrap: Wrap | null;
  /** Nudges from squad-mates in the last 24 h. */
  nudges: Nudge[];
  /** v2.3: water logged over the last week (the week strip's range). */
  water?: WaterEntry[];
};

export default function HomeScreen({ today, profile, workouts, meals, exercises, weekStreak, dayStreak, thisWeek, celebrate, wrap, nudges, water = [] }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState(today);
  const { pending, savedCount, error } = usePendingMeals();
  // When a background quick-log finishes, pull the freshly saved row in — once per save. The count
  // lives in a module-level store that outlives this screen, so "savedCount > 0" alone re-ran
  // router.refresh() (a second full Home render: workouts, meals, my_nudges…) on every visit.
  useEffect(() => {
    if (savedCount > handledSaves) {
      handledSaves = savedCount;
      router.refresh();
    }
  }, [savedCount, router]);
  // Squad rollup: refresh today's daily_stats when Home opens (yesterday's too on the first open of
  // a session), at most every 10 minutes — every save already recomputes it server-side.
  useEffect(() => {
    let first = true;
    try {
      const last = JSON.parse(window.sessionStorage.getItem("lockedin-rollup-at") ?? "null") as { day: string; at: number; saves: number } | null;
      first = last?.day !== today;
      if (!first && last && Date.now() - last.at < 10 * 60_000 && last.saves === savedCount) return;
      window.sessionStorage.setItem("lockedin-rollup-at", JSON.stringify({ day: today, at: Date.now(), saves: savedCount }));
    } catch {
      // No session storage: just include yesterday every time.
    }
    void fetch("/api/rollup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ yesterday: first }) }).catch(() => {});
  }, [today, savedCount]);
  const isToday = selected === today;
  const totals = totalsFor(meals, selected);
  const dayWorkouts = workouts.filter((w) => w.date === selected);
  const dayMeals = meals.filter((m) => m.date === selected);
  // Band-workout burns ride on the workout row itself; everything else gets a row of its own.
  const dayExercises = exercises.filter((e) => e.date === selected && e.source !== "workout");
  const workoutBurn = new Map(exercises.filter((e) => e.date === selected && e.source === "workout").map((e) => [e.note, e.kcal]));
  // No Health Connect (so no steps) on the web: the activity card is burned kcal + active minutes
  // from the exercise log (band workouts included, via their auto-burn rows).
  const burned = exercises.filter((e) => e.date === selected).reduce((a, e) => a + e.kcal, 0);
  const activeMin = exercises.filter((e) => e.date === selected).reduce((a, e) => a + (Number(e.minutes) || 0), 0);
  const trained = new Set(workouts.map((w) => w.date));
  const carbTarget = Math.max(1, carbTargetG(profile));
  const fatTarget = Math.max(1, fatTargetG(profile));
  // v2.3 Preferences: "Add burned calories to daily goal" and "Rollover calories" (up to 200).
  const budget = calorieBudget(profile, meals, exercises, selected);
  const burnedKcal = budget.burned;
  // v2.10: every calorie / macro card shows "left" or "eaten"; tapping any one flips them all.
  const { mode, showHint } = useMacroMode();
  const [flipped, setFlipped] = useState(false);
  const flip = () => {
    setFlipped(true);
    toggleMacroMode();
  };
  const kcalEaten = Math.round(totals.calories);
  const kcalOver = Math.round(totals.calories - budget.budget);
  const kcal =
    mode === "eaten"
      ? { value: kcalEaten, word: "eaten" }
      : kcalOver > 0
        ? { value: kcalOver, word: "over" }
        : { value: Math.max(0, Math.round(budget.budget - totals.calories)), word: "left" };
  // v2.10 "Hide calorie numbers" (schema_v34 opt-in): the calorie card shows words instead of kcal in
  // both left and eaten modes. The ring stays; macro cards still show grams (science spec).
  const hideNumbers = profile.hide_numbers === true;
  const kcalWords = calorieWords(totals.calories, budget.budget);
  const kcalLabel = mode === "eaten" ? "Calories eaten" : "Calories left";

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-[22px] font-extrabold" style={{ letterSpacing: "-0.027em" }}>
            <Lock size={26} />
            Locked In
          </h1>
          {/* v2.8 declutter: the header keeps only Calendar (the week streak lives on Calendar and Progress). */}
          <InboxBell /> {/* v2.13 platform */}
          <Link
            href="/calendar"
            aria-label="Calendar"
            className="press grid h-9 w-9 place-items-center rounded-full"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--ink)" }}
          >
            <CalendarIcon size={19} />
          </Link>
        </div>
        {error ? <div className="mt-2"><ErrorNote text={error} /></div> : null}
      </Rise>

      <Rise index={1}>
        <DayStreakPill days={dayStreak} loggedToday={meals.some((m) => m.date === today) || workouts.some((w) => w.date === today) || exercises.some((e) => e.date === today)} />
      </Rise>

      <HomeBanner /> {/* v2.13 platform */}

      <BannerCarousel nudges={nudges} wrap={wrap} pending={pending} hideNumbers={profile?.hide_numbers === true} />

      <Rise index={1}>
        <WeekStrip today={today} selected={selected} trained={trained} onSelect={setSelected} />
      </Rise>

      <Rise index={2}>
        <button
          type="button"
          className="card press block w-full text-left"
          style={{ padding: 20, color: "var(--ink)" }}
          onClick={flip}
          aria-label={`${hideNumbers ? `${kcalLabel}: ${kcalWords}` : `${kcal.value} calories ${kcal.word}`}. Tap to show ${mode === "eaten" ? "what's left" : "what you've eaten"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <FlipFace mode={mode} animate={flipped}>
              {hideNumbers ? (
                <p className="text-[22px] font-extrabold leading-tight">{kcalWords}</p>
              ) : (
                <p className="num text-[40px] font-extrabold leading-none">
                  {kcal.value.toLocaleString("en-IN")}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium muted">
                {hideNumbers ? kcalLabel : `Calories ${kcal.word}`}
                {isToday ? "" : ` · ${shortDate(selected)}`}
                {!hideNumbers && burnedKcal > 0 ? (
                  <span className="num rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--card2)", color: "var(--ink)" }} title="Burned calories added to your goal">
                    +{Math.round(burnedKcal)} burned
                  </span>
                ) : null}
                {!hideNumbers && budget.rollover > 0 ? (
                  <span className="num rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--card2)", color: "var(--ink)" }} title="Left over from yesterday">
                    +{budget.rollover} rollover
                  </span>
                ) : null}
              </p>
            </FlipFace>
            <Ring fraction={totals.calories / Math.max(1, budget.budget)} color="var(--ink)" size={96} stroke={9} draw={250}>
              <Flame size={26} />
            </Ring>
          </div>
        </button>
      </Rise>

      <Rise index={3}>
        <div className="grid grid-cols-3 gap-2.5">
          <MacroCard macro="Protein" consumed={totals.protein} target={profile.protein_target_g} color="var(--red)" mode={mode} animate={flipped} onFlip={flip} draw={420} />
          <MacroCard macro="Carbs" consumed={totals.carbs} target={carbTarget} color="var(--orange)" mode={mode} animate={flipped} onFlip={flip} draw={590} />
          <MacroCard macro="Fat" consumed={totals.fat} target={fatTarget} color="var(--blue)" mode={mode} animate={flipped} onFlip={flip} draw={760} />
        </div>
        {showHint ? <p className="mt-1.5 text-center text-[12px] muted">Tap a card to switch between left and eaten</p> : null}
      </Rise>

      <Rise index={4}>
        <button
          type="button"
          className="card press flex w-full items-center text-left"
          style={{ padding: "14px 10px 14px 14px" }}
          onClick={() => router.push(`/log?date=${selected}&mode=exercise`)}
          aria-label={`${Math.round(burned)} kcal burned, ${activeMin} active minutes. Log exercise`}
        >
          <span className="grid flex-1 grid-cols-2">
            <span className="flex min-w-0 items-center gap-2.5 pr-3">
              <Ring fraction={burned / 400} color="var(--orange)" size={44} stroke={5} draw={900}>
                <span style={{ color: "var(--orange)" }}>
                  <Flame size={16} />
                </span>
              </Ring>
              <span className="flex min-w-0 flex-col">
                <span className="num text-xl font-extrabold leading-tight">{Math.round(burned)}</span>
                <span className="truncate text-xs muted">kcal burned</span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2.5 pl-3" style={{ borderLeft: "1px solid var(--hair)" }}>
              <Ring fraction={activeMin / 60} color="var(--green)" size={44} stroke={5} draw={1060}>
                <span style={{ color: "var(--green)" }}>
                  <Run size={16} />
                </span>
              </Ring>
              <span className="flex min-w-0 flex-col">
                <span className="num text-xl font-extrabold leading-tight">{activeMin}</span>
                <span className="truncate text-xs muted">active min</span>
              </span>
            </span>
          </span>
          <span className="shrink-0 pl-1" style={{ color: "var(--muted)" }}>
            <ChevronRight size={18} />
          </span>
        </button>
      </Rise>

      <Rise index={4}>
        <WaterCard date={selected} isToday={isToday} ml={water.filter((w) => w.date === selected).reduce((a, w) => a + w.ml, 0)} goal={profile.water_goal_ml} glassMl={profile.water_glass_ml} />
      </Rise>

      <TodaySessionCard /> {/* v2.13 platform */}

      <Rise index={4}>
        <h2 className="text-xl font-extrabold" style={{ letterSpacing: "-0.025em" }}>
          {isToday ? "Today" : longDate(selected)}
        </h2>
      </Rise>

      {/* v2.8: no "Log something" button here — the + button logs; each meal section has its own "+ Add". */}
      {dayWorkouts.map((w) => (
        <Rise key={w.id} index={5}>
          <WorkoutRowLink workout={w} burnKcal={workoutBurn.get(w.id) ?? null} />
        </Rise>
      ))}
      {dayExercises.map((e) => (
        <Rise key={e.id} index={5}>
          <ExerciseRow entry={e} />
        </Rise>
      ))}
      {/* v2.8: Breakfast · Lunch · Dinner · Snacks, each with its totals and "+ Add"; tap a meal to edit it. */}
      <MealSections meals={dayMeals} date={selected} />

      <AnimatePresence>
        {celebrate ? <Celebration thisWeek={thisWeek} target={profile.weekly_workout_target} streakWeeks={weekStreak} /> : null}
      </AnimatePresence>
    </div>
  );
}

/** v2.6 water tile: "Water · 1.75 L / 2.5 L" with a mini bottle and + Glass; the tile opens the Water page. */
function WaterCard({ date, isToday, ml, goal, glassMl }: { date: string; isToday: boolean; ml: number; goal: number; glassMl: number }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const target = Math.max(250, goal || 2500);
  const glass = glassMl || 250;
  const shown = ml + extra;
  async function addGlass() {
    setAdding(true);
    setError(null);
    setExtra((x) => x + glass);
    try {
      await logWater(glass, date, "glass");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log that");
    } finally {
      setExtra(0);
      setAdding(false);
    }
  }
  return (
    <div className="card flex items-center gap-3" style={{ padding: "10px 12px 10px 12px" }}>
      <button
        type="button"
        className="press flex min-w-0 flex-1 items-center gap-3 text-left"
        style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }}
        onClick={() => router.push(isToday ? "/water" : `/water?date=${date}`)}
        aria-label={`Water: ${litres(shown)} of ${litres(target)}. Open the water page`}
      >
        <span className="grid h-[52px] w-9 shrink-0 place-items-center">
          <WaterBottle fraction={shown / target} height={52} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-semibold muted">Water{isToday ? "" : ` · ${shortDate(date)}`}</span>
          <span className="num text-xl font-extrabold leading-tight">
            {litres(shown)} <span className="text-[13px] font-semibold muted">/ {litres(target)}</span>
          </span>
          <span className="truncate text-xs muted">{error ?? (shown >= target ? "Water goal hit" : `${Math.max(0, Math.ceil((target - shown) / glass))} glasses to go`)}</span>
        </span>
      </button>
      <button type="button" className="chip press shrink-0 gap-1 whitespace-nowrap" style={{ height: 36, padding: "0 12px", fontWeight: 700 }} disabled={adding} onClick={() => void addGlass()} aria-label={`Add a ${glass} mL glass`}>
        {adding ? <Spinner size={14} /> : <Plus size={15} />}
        Glass
      </button>
    </div>
  );
}

/**
 * v2.2 day streak: "🔥 N-day streak" — any workout, exercise or meal counts for the day. At 0 it
 * turns into a muted nudge to start one; when the run is alive but nothing is in yet today it says
 * so, so the streak doesn't break by surprise.
 */
function DayStreakPill({ days, loggedToday }: { days: number; loggedToday: boolean }) {
  const alive = days > 0;
  return (
    <div className="card flex items-center gap-3" style={{ padding: "12px 16px", borderRadius: 999 }} role="status" aria-label={alive ? `${days}-day streak` : "No day streak yet"}>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: alive ? "color-mix(in srgb, var(--flame) 14%, transparent)" : "var(--card2)", color: alive ? "var(--flame)" : "var(--muted)" }}
      >
        {alive ? <BreathingFlame size={20} /> : <Flame size={18} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="num text-[16px] font-extrabold leading-tight" style={{ letterSpacing: "-0.02em", color: alive ? "var(--ink)" : "var(--muted)" }}>
          {alive ? `${days}-day streak` : "Start a streak today"}
        </span>
        <span className="truncate text-xs muted">
          {!alive ? "Log a meal, a workout or any exercise" : loggedToday ? "Today counts — keep it going tomorrow" : "Log anything today to keep it alive"}
        </span>
      </span>
    </div>
  );
}

/**
 * v2.10: the cards above the hero — a meal still being saved, a squad nudge, the 9 pm wrap — as a
 * swipeable row (CSS scroll-snap) with small dots. Dismissing a card takes it out; one card left
 * shows no dots; no cards, no carousel. Android's TodayScreen uses a HorizontalPager for the same.
 */
function BannerCarousel({ nudges, wrap, pending, hideNumbers = false }: { nudges: Nudge[]; wrap: Wrap | null; pending: Pending[]; hideNumbers?: boolean }) {
  const nudgeHidden = useDismissed(`nudge:${nudges[0]?.id ?? "none"}`);
  const wrapHidden = useDismissed(`wrap:${wrap?.date ?? "none"}`);
  const cards: { key: string; label: string; node: React.ReactNode }[] = [];
  if (pending.length) cards.push({ key: "pending", label: "Saving a meal", node: <PendingBanner pending={pending} /> });
  if (nudges.length && !nudgeHidden) cards.push({ key: "nudge", label: "Squad nudge", node: <NudgeBanner nudges={nudges} /> });
  if (wrap && !wrapHidden) cards.push({ key: "wrap", label: "Daily wrap", node: <WrapCard wrap={wrap} hideNumbers={hideNumbers} /> });
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  if (!cards.length) return null;
  const active = Math.min(page, cards.length - 1);
  function onScroll() {
    const el = track.current;
    if (!el || !el.firstElementChild) return;
    const step = (el.firstElementChild as HTMLElement).offsetWidth + 10;
    setPage(Math.max(0, Math.round(el.scrollLeft / Math.max(1, step))));
  }
  function goTo(i: number) {
    const el = track.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (el && child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft - 4, behavior: "smooth" });
  }
  return (
    <Rise index={1}>
      <div
        ref={track}
        className="banner-carousel flex snap-x snap-mandatory overflow-x-auto"
        style={{ gap: 10, margin: "-8px -4px", padding: "8px 4px", scrollPaddingInline: 4 }}
        onScroll={onScroll}
        role={cards.length > 1 ? "region" : undefined}
        aria-roledescription={cards.length > 1 ? "carousel" : undefined}
        aria-label={cards.length > 1 ? "Updates" : undefined}
      >
        {cards.map((c, i) => (
          <motion.div
            key={c.key}
            className="w-full shrink-0 snap-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
            aria-roledescription={cards.length > 1 ? "slide" : undefined}
            aria-label={cards.length > 1 ? `${i + 1} of ${cards.length}: ${c.label}` : undefined}
          >
            {c.node}
          </motion.div>
        ))}
      </div>
      {cards.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {cards.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-label={`Show card ${i + 1}: ${c.label}`}
              aria-current={i === active}
              className="grid h-4 w-4 place-items-center"
              style={{ background: "none", border: 0, padding: 0 }}
              onClick={() => goTo(i)}
            >
              <span className="rounded-full" style={{ width: i === active ? 14 : 6, height: 6, background: i === active ? "var(--ink)" : "var(--hair)", transition: "width 160ms ease, background 160ms ease" }} />
            </button>
          ))}
        </div>
      ) : null}
    </Rise>
  );
}

/** A meal saved while its parse / photo estimate was still running. */
function PendingBanner({ pending }: { pending: Pending[] }) {
  return (
    <div className="card flex items-center gap-3" style={{ padding: "12px 14px" }} role="status">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
        <Spinner size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">Saving {pending.length === 1 ? `"${pending[0].text}"` : `${pending.length} meals`}</span>
        <span className="text-xs muted">Working out the calories. It lands under its meal.</span>
      </span>
    </div>
  );
}

/** "Sohum nudged you" — squad-mates poking you to train, dismissible per nudge. */
function NudgeBanner({ nudges }: { nudges: Nudge[] }) {
  const latest = nudges[0];
  const names = [...new Set(nudges.map((n) => n.from_name))];
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`;
  return (
    <div>
      <div className="flex items-center gap-3 rounded-[20px] px-4 py-3" style={{ background: "var(--btn)", color: "var(--btn-ink)" }} role="status">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.14)" }}>
          <Fist size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">{who} nudged you</span>
          <span className="truncate text-xs" style={{ opacity: 0.72 }}>
            {latest.group_name} · get a session in today
          </span>
        </span>
        <button type="button" aria-label="Dismiss" className="hit press grid h-8 w-8 place-items-center rounded-full" style={{ color: "inherit" }} onClick={() => dismiss(`nudge:${latest.id}`)}>
          <Close size={16} />
        </button>
      </div>
    </div>
  );
}

/** The 9 pm daily wrap: protein, calories vs budget, sessions this week, tomorrow's session, best meal. */
function WrapCard({ wrap, hideNumbers = false }: { wrap: Wrap; hideNumbers?: boolean }) {
  const pct = Math.min(1, wrap.protein / Math.max(1, wrap.proteinTarget));
  async function share() {
    const text = `Locked In · ${wrap.line}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {
      // Cancelled share sheet: nothing to do.
    }
  }
  return (
    <div>
      <Card padding={18}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[13px] font-bold muted">
            <MoonStar size={16} />
            {wrap.line.startsWith("Yesterday") ? "Yesterday's wrap" : "Today's wrap"}
          </p>
          <button type="button" aria-label="Dismiss the wrap" className="hit press grid h-8 w-8 place-items-center rounded-full" style={{ background: "var(--card2)", color: "var(--muted)" }} onClick={() => dismiss(`wrap:${wrap.date}`)}>
            <Close size={14} />
          </button>
        </div>
        <div className={`mt-3 grid gap-2 ${hideNumbers ? "grid-cols-2" : "grid-cols-3"}`}>
          <WrapStat value={`${wrap.protein} g`} label={wrap.proteinHit ? "protein, hit" : `protein · ${Math.max(0, wrap.proteinTarget - wrap.protein)} short`} color={wrap.proteinHit ? "var(--green)" : "var(--red)"} icon={wrap.proteinHit ? <Check size={13} /> : null} />
          {/* v2.11: "Hide calorie numbers" keeps kcal off the wrap too. */}
          {!hideNumbers && <WrapStat value={wrap.calories.toLocaleString("en-IN")} label={`of ${wrap.calorieBudget.toLocaleString("en-IN")} kcal`} />}
          <WrapStat value={`${wrap.sessions}/${wrap.sessionTarget}`} label="sessions this week" />
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: wrap.proteinHit ? "var(--green)" : "var(--red)" }} />
        </div>
        <p className="mt-3 text-sm">
          <span className="muted">Tomorrow:</span> <span className="font-bold">{wrap.tomorrow}</span>
        </p>
        {wrap.bestMeal ? (
          <p className="mt-1 truncate text-[13px] muted">
            Best meal: {wrap.bestMeal.name} · {wrap.bestMeal.protein} g protein
          </p>
        ) : null}
        <div className="mt-3">
          <PillButton soft height={42} onClick={share}>
            <span className="inline-flex items-center gap-2">
              <Share size={16} />
              Share my day
            </span>
          </PillButton>
        </div>
      </Card>
    </div>
  );
}

function WrapStat({ value, label, color, icon }: { value: string; label: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-3 py-2.5" style={{ background: "var(--card2)" }}>
      <p className="num flex items-center gap-1 text-lg font-extrabold leading-tight" style={{ color: color ?? "var(--ink)" }}>
        {value}
        {icon}
      </p>
      <p className="text-[11px] leading-tight muted">{label}</p>
    </div>
  );
}

function WorkoutRowLink({ workout, burnKcal }: { workout: Workout; burnKcal: number | null }) {
  const router = useRouter();
  return <WorkoutRow workout={workout} burnKcal={burnKcal} onOpen={() => router.push(`/log?workout=${workout.id}`)} />;
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

/**
 * One macro card. In "left" mode it counts down ("34g / Protein left"); once the target is passed
 * it shows the overshoot ("12g / Protein **over**") in the macro's own colour, like Cal AI. In
 * "eaten" mode it shows what's been eaten ("58g / Protein eaten"). Tapping flips every card.
 */
function MacroCard({ macro, consumed, target, color, mode, animate, onFlip, draw }: { macro: string; consumed: number; target: number; color: string; mode: MacroMode; animate: boolean; onFlip: () => void; draw?: number }) {
  const safeTarget = Math.max(1, target);
  const over = mode === "left" && consumed > target && target > 0;
  const amount = mode === "eaten" ? Math.max(0, Math.round(consumed)) : Math.max(0, Math.round(over ? consumed - target : target - consumed));
  const word = mode === "eaten" ? "eaten" : over ? "over" : "left";
  return (
    <button
      type="button"
      className="card press block w-full text-left"
      style={{ padding: 12, color: "var(--ink)" }}
      onClick={onFlip}
      aria-label={`${macro}: ${amount} grams ${word}. Tap to show ${mode === "eaten" ? "what's left" : "what you've eaten"}`}
    >
      <FlipFace mode={mode} animate={animate}>
        <p className="num text-xl font-extrabold leading-tight" style={{ color: over ? color : "var(--ink)" }}>
          {amount}g
        </p>
        <p className="text-xs muted">
          {macro}{" "}
          <span style={{ color: over ? color : "var(--muted)", fontWeight: over ? 700 : 400 }}>{word}</span>
        </p>
      </FlipFace>
      <div className="mt-2.5 flex justify-center">
        <Ring fraction={consumed / safeTarget} color={color} size={56} stroke={6} draw={draw}>
          <span className="rounded-full" style={{ width: 8, height: 8, background: color }} />
        </Ring>
      </div>
    </button>
  );
}

/** The number + label of a Home card: a short flip-in whenever the left / eaten mode changes (not on first paint). */
function FlipFace({ mode, animate, children }: { mode: MacroMode; animate: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      key={mode}
      className="min-w-0"
      initial={animate ? { opacity: 0, rotateX: -75 } : false}
      animate={{ opacity: 1, rotateX: 0 }}
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ transformPerspective: 500, transformOrigin: "50% 50%" }}
    >
      {children}
    </motion.div>
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
