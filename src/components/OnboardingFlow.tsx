"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { completeOnboarding, skipOnboarding } from "@/lib/actions";
import { healthyRange } from "@/lib/bmi";
import { ageYears, edFlags, effectiveGoal, goalOptions, isTeen, plan, roundSpeed, screenInput, speedMax, type EdFlag, type Plan } from "@/lib/goals";
import type { Gender, GoalType, Profile } from "@/lib/types";
import GoalSpeedPicker from "./GoalSpeedPicker";
import { SafetyNote, ScienceButton, TeenNote } from "./Science";
import { ArrowLeft, Check, Pencil } from "./icons";
import { Card, ErrorNote, OptionCard, PillButton, Ring, Rise, SPRING, fmt } from "./ui";

/** Everything the flow collects. Only the first seven fields ever reach the database. */
type Answers = {
  gender: Gender | null;
  /** Sessions a week, stored as the profile's weekly_workout_target. */
  workouts: number | null;
  goalType: GoalType | null;
  heightCm: string;
  weightKg: string;
  dob: string | null;
  goalWeightKg: number | null;
  speed: number;
  obstacles: string[];
};

type Step = "GENDER" | "WORKOUTS" | "GOAL" | "BODY" | "DOB" | "DESIRED" | "SPEED" | "OBSTACLES" | "BUILDING" | "READY";
// v2.10: birthday and body come before the goal, so the goal list can branch by age (no "lose"
// under 18) and the pace slider can stop at the safe max for this body weight.
const ALL_STEPS: Step[] = ["GENDER", "WORKOUTS", "DOB", "BODY", "GOAL", "DESIRED", "SPEED", "OBSTACLES", "BUILDING", "READY"];

const OBSTACLES: [string, string][] = [
  ["Lack of consistency", "We'll keep the streak front and centre"],
  ["Unhealthy eating habits", "We'll flag the sugar and the salt for you"],
  ["Lack of support", "We'll celebrate every single session"],
  ["Busy schedule", "We'll keep meals quick"],
  ["Lack of meal inspiration", "We'll lean on the meals you already save"],
];

const PLAN_CHECKS = ["Calories", "Carbs", "Protein", "Fats", "Health score"];

const parseNum = (s: string, lo: number, hi: number) => {
  const v = Number(s);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
};

/**
 * The Cal AI-shaped first run: gender → workouts → birthday → body → goal → target weight →
 * pace → obstacles → a plan being built → the plan itself. Under 18 the goal step offers only
 * maintain / grow stronger and gain / build muscle, and target weight and pace drop out. Nothing is written until the last
 * screen, where the whole profile (details plus the Auto Generate targets) is saved in one go.
 */
export default function OnboardingFlow({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [a, setA] = useState<Answers>({
    gender: profile.gender,
    workouts: null,
    goalType: null,
    heightCm: profile.height_cm ? fmt(profile.height_cm) : "170",
    weightKg: profile.weight_kg ? fmt(profile.weight_kg) : "60",
    dob: profile.dob,
    goalWeightKg: profile.goal_weight_kg,
    speed: roundSpeed(profile.goal_speed_kg_wk || 0.5),
    obstacles: [],
  });
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weight = parseNum(a.weightKg, 20, 300);
  const height = parseNum(a.heightCm, 80, 250);
  const maintaining = a.goalType === "maintain";
  const age = ageYears(a.dob);
  const teen = isTeen(age);
  // A "lose" picked before the birthday was changed doesn't count for an under-18.
  const goalType = a.goalType ? effectiveGoal(a.goalType, age) : null;
  const goalPicked = a.goalType !== null && !(teen && a.goalType === "lose");

  // Maintaining (and anyone under 18) needs no target weight and no pace, so those two drop out.
  const steps = ALL_STEPS.filter((s) => !((maintaining || teen) && (s === "DESIRED" || s === "SPEED")));
  const step = steps[Math.min(Math.max(index, 0), steps.length - 1)];
  const progress = (steps.indexOf(step) + 1) / steps.length;
  const back = () => {
    setDir(-1);
    setIndex((i) => Math.max(0, i - 1));
  };
  const next = () => {
    setDir(1);
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  };

  // The profile as it would be saved right now — used for the generated targets on the last screen.
  // Plain computation (cheap) — the React Compiler memoizes it.
  const draft: Profile = {
    ...profile,
    gender: a.gender ?? "other",
    weekly_workout_target: a.workouts ?? 3,
    goal_type: goalType ?? "maintain",
    height_cm: height,
    weight_kg: weight,
    dob: a.dob,
    goal_weight_kg: teen ? profile.goal_weight_kg : maintaining ? weight : a.goalWeightKg,
    // Kept even when maintaining, so switching to lose/gain later starts from a sane pace.
    goal_speed_kg_wk: roundSpeed(a.speed, speedMax(goalType === "gain" ? "gain" : "lose", weight)),
  };
  const built = plan(draft);
  const targets = built?.targets ?? null;
  const flags = edFlags(screenInput(draft));

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const saved: Partial<Profile> = {
        gender: draft.gender,
        weekly_workout_target: draft.weekly_workout_target,
        goal_type: draft.goal_type,
        height_cm: draft.height_cm,
        weight_kg: draft.weight_kg,
        dob: draft.dob,
        goal_weight_kg: draft.goal_weight_kg,
        goal_speed_kg_wk: draft.goal_speed_kg_wk,
      };
      if (targets) {
        saved.calorie_target = targets.calories;
        saved.protein_target_g = targets.protein;
        saved.carb_target_g = targets.carbs;
        saved.fat_target_g = targets.fat;
      }
      await completeOnboarding(saved);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your plan");
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await skipOnboarding();
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  let page: React.ReactNode;
  switch (step) {
    case "GENDER":
      page = (
        <Chassis progress={progress} onBack={back} title="Choose your gender" ctaEnabled={a.gender !== null} onCta={next} onSkip={skip}>
          {(["male", "female", "other"] as Gender[]).map((g) => (
            <OptionCard key={g} title={g === "male" ? "Male" : g === "female" ? "Female" : "Other"} selected={a.gender === g} onClick={() => setA({ ...a, gender: g })} />
          ))}
        </Chassis>
      );
      break;
    case "WORKOUTS":
      page = (
        <Chassis progress={progress} onBack={back} title="How many workouts do you do per week?" ctaEnabled={a.workouts !== null} onCta={next}>
          {(
            [
              ["0 – 2", "Workouts now and then", 2],
              ["3 – 5", "A few workouts per week", 4],
              ["6+", "Dedicated athlete", 6],
            ] as [string, string, number][]
          ).map(([label, sub, value]) => (
            <OptionCard key={value} title={label} sub={sub} selected={a.workouts === value} onClick={() => setA({ ...a, workouts: value })} />
          ))}
        </Chassis>
      );
      break;
    case "GOAL":
      page = (
        <Chassis progress={progress} onBack={back} title="What is your goal?" ctaEnabled={goalPicked} onCta={next}>
          {goalOptions(age).map((o) => (
            <OptionCard key={o.key} title={o.label} sub={o.sub} selected={a.goalType === o.key} onClick={() => setA({ ...a, goalType: o.key, goalWeightKg: o.key === "maintain" ? weight : a.goalWeightKg })} />
          ))}
          {teen ? <TeenNote /> : null}
        </Chassis>
      );
      break;
    case "BODY":
      page = (
        <Chassis progress={progress} onBack={back} title="Height & weight" ctaEnabled={height !== null && weight !== null} onCta={next}>
          <div className="grid grid-cols-2 gap-3">
            <BigNumberField label="Height" value={a.heightCm} unit="cm" onChange={(v) => setA({ ...a, heightCm: v })} />
            <BigNumberField label="Weight" value={a.weightKg} unit="kg" onChange={(v) => setA({ ...a, weightKg: v })} />
          </div>
          <p className="text-xs muted">Metric only for now — centimetres and kilograms.</p>
        </Chassis>
      );
      break;
    case "DOB":
      page = (
        <Chassis progress={progress} onBack={back} title="When were you born?" ctaEnabled={a.dob !== null} onCta={next}>
          <BirthdayPicker dob={a.dob} onPick={(d) => setA({ ...a, dob: d })} />
        </Chassis>
      );
      break;
    case "DESIRED": {
      const now = weight ?? 60;
      const goal = a.goalWeightKg ?? now;
      const diff = goal - now;
      page = (
        <Chassis progress={progress} onBack={back} title="What is your desired weight?" ctaEnabled onCta={next}>
          <p className="num text-center text-[52px] font-extrabold leading-none" style={{ letterSpacing: "-0.04em" }}>
            {fmt(goal)} kg
          </p>
          <p className="text-center text-[13px] muted">
            {Math.abs(diff) < 0.25 ? "Same as today" : diff > 0 ? `${fmt(diff)} kg above where you are now` : `${fmt(-diff)} kg below where you are now`}
          </p>
          <div className="mt-2">
            <TickRuler value={goal} min={Math.max(25, now - 30)} max={now + 30} step={0.5} onChange={(v) => setA({ ...a, goalWeightKg: v })} />
          </div>
          <p className="text-center text-xs muted">Drag the ruler</p>
          {height ? (
            <p className="text-center text-xs muted">
              Healthy range for your height: {fmt(healthyRange(height).min)}–{fmt(healthyRange(height).max)} kg
            </p>
          ) : null}
        </Chassis>
      );
      break;
    }
    case "SPEED":
      page = (
        <Chassis
          progress={progress}
          onBack={back}
          title="How fast do you want to reach your goal?"
          sub="This changes how many calories we add or subtract each day."
          ctaEnabled
          onCta={next}
        >
          <GoalSpeedPicker speed={a.speed} onChange={(v) => setA({ ...a, speed: v })} goal={goalType === "gain" ? "gain" : "lose"} weightKg={weight} />
        </Chassis>
      );
      break;
    case "OBSTACLES":
      page = (
        <Chassis progress={progress} onBack={back} title="What's stopping you from reaching your goals?" sub="Pick as many as you like." ctaEnabled onCta={next}>
          {OBSTACLES.map(([label]) => {
            const on = a.obstacles.includes(label);
            return <OptionCard key={label} title={label} selected={on} onClick={() => setA({ ...a, obstacles: on ? a.obstacles.filter((o) => o !== label) : [...a.obstacles, label] })} />;
          })}
        </Chassis>
      );
      break;
    case "BUILDING":
      page = <BuildingScreen progress={progress} onDone={next} />;
      break;
    case "READY":
      page = <PlanScreen a={a} weight={weight} maintaining={maintaining} built={built} flags={flags} error={error} busy={busy} onBack={back} onStart={start} />;
      break;
  }

  return (
    <div className="relative mx-auto w-full max-w-[480px] overflow-x-hidden" style={{ minHeight: "100dvh" }}>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ x: dir * 48, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -dir * 48, opacity: 0 }}
          transition={{ ...SPRING, opacity: { duration: 0.18 } }}
          className="flex flex-col"
          style={{ minHeight: "100dvh" }}
        >
          {page}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---- chassis ----

/**
 * One screen of the flow: back arrow, a thin animated progress bar, a big left-aligned headline,
 * the grey calibration subhead, the body, and a Continue pill that stays disabled until the
 * screen has an answer.
 */
function Chassis({
  progress,
  onBack,
  title,
  sub = "This will be used to calibrate your custom plan.",
  cta = "Continue",
  ctaEnabled,
  onCta,
  onSkip,
  children,
}: {
  progress: number;
  onBack: () => void;
  title: string;
  sub?: string | null;
  cta?: string;
  ctaEnabled: boolean;
  onCta: () => void;
  onSkip?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col" style={{ paddingTop: "calc(10px + env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-3 px-4">
        <button type="button" onClick={onBack} aria-label="Back" className="press grid place-items-center rounded-full" style={{ width: 34, height: 34, background: "var(--card2)" }}>
          <ArrowLeft size={17} />
        </button>
        <ProgressBar progress={progress} />
        {onSkip ? (
          <button type="button" onClick={onSkip} className="press text-[13px] font-semibold muted" style={{ background: "none", border: 0, padding: "6px 2px" }}>
            Skip for now
          </button>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-6 pb-3 pt-7">
        <div>
          <h1 className="text-[30px] font-extrabold leading-[34px]" style={{ letterSpacing: "-0.04em" }}>
            {title}
          </h1>
          {sub ? <p className="mt-1.5 text-sm leading-[19px] muted">{sub}</p> : null}
        </div>
        <div className="mt-1 flex flex-col gap-3">{children}</div>
      </div>
      <div className="px-6" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <PillButton onClick={onCta} disabled={!ctaEnabled} height={54}>
          {cta}
        </PillButton>
      </div>
    </div>
  );
}

/** The thin black bar across the top; animates as the flow advances. */
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="obar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Onboarding progress">
      <span style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
    </div>
  );
}

/** A big tappable number with its unit, used for height and weight side by side. */
function BigNumberField({ label, value, unit, onChange }: { label: string; value: string; unit: string; onChange: (v: string) => void }) {
  const id = `big-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="block rounded-[18px] px-4 py-3.5" style={{ background: "var(--card2)" }}>
      <span className="block text-xs font-semibold muted">{label}</span>
      <span className="mt-1.5 flex items-end gap-1">
        <input id={id} className="bignum num" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} aria-label={`${label} in ${unit}`} />
        <span className="pb-1 text-sm font-semibold muted">{unit}</span>
      </span>
    </label>
  );
}

const longDob = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

/** Birthday via the native date picker, defaulting to 1 January 2009. */
function BirthdayPicker({ dob, onPick }: { dob: string | null; onPick: (iso: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <label className="block cursor-pointer rounded-[18px] px-4 py-5 text-center" style={{ background: "var(--card2)" }}>
      <span className="num block text-[26px] font-extrabold" style={{ letterSpacing: "-0.035em", color: dob ? "var(--ink)" : "var(--muted)" }}>
        {dob ? longDob(dob) : "1 January 2009"}
      </span>
      <span className="mt-1 block text-xs muted">{dob ? "Tap to change" : "Tap to pick your birthday"}</span>
      <input
        type="date"
        className="pickfield mt-3 w-full text-center"
        value={dob ?? ""}
        max={today}
        min="1906-01-01"
        onChange={(e) => e.target.value && onPick(e.target.value)}
        aria-label="Date of birth"
      />
    </label>
  );
}

/**
 * The draggable target-weight ruler: ticks every 0.5 kg, a taller tick every kilo, a label every
 * five, and a black needle down the middle that the number above is pinned to.
 */
function TickRuler({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const carry = useRef(0);
  const lastX = useRef<number | null>(null);
  const current = useRef(value);
  const PX = 13;
  useEffect(() => {
    current.current = value;
  }, [value]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cs = getComputedStyle(canvas);
      const ink = cs.getPropertyValue("--ink").trim() || "#111";
      const muted = cs.getPropertyValue("--muted").trim() || "#7c7c82";
      const hair = cs.getPropertyValue("--hair").trim() || "#e9e9ec";
      const cx = w / 2;
      const top = h * 0.3;
      const span = Math.trunc(cx / PX) + 3;
      const centreIdx = Math.round(value / step);
      ctx.lineCap = "round";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = -span; i <= span; i++) {
        const idx = centreIdx + i;
        const v = idx * step;
        if (v < min - step || v > max + step) continue;
        const x = cx + ((v - value) / step) * PX;
        if (x < -20 || x > w + 20) continue;
        const major = idx % 2 === 0; // every whole kilo
        const labelled = idx % 10 === 0; // every five kilos
        const th = labelled ? h * 0.34 : major ? h * 0.24 : h * 0.14;
        ctx.strokeStyle = labelled ? muted : hair;
        ctx.lineWidth = labelled ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + th);
        ctx.stroke();
        if (labelled) {
          ctx.fillStyle = muted;
          ctx.fillText(fmt(v), x, top + th + 6);
        }
      }
      // The needle the number above is read against.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, top - h * 0.16);
      ctx.lineTo(cx, top + h * 0.42);
      ctx.stroke();
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [value, min, max, step]);

  const clampStep = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  function move(dx: number) {
    carry.current -= dx; // dragging left walks the ruler up
    const notches = Math.trunc(carry.current / PX);
    if (notches !== 0) {
      carry.current -= notches * PX;
      const nextV = clampStep(current.current + notches * step);
      if (Math.abs(nextV - current.current) > 1e-6) onChange(nextV);
    }
  }

  return (
    <canvas
      ref={ref}
      className="ruler block"
      role="slider"
      tabIndex={0}
      aria-label="Desired weight"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${fmt(value)} kilograms`}
      onPointerDown={(e) => {
        carry.current = 0;
        lastX.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (lastX.current === null) return;
        move(e.clientX - lastX.current);
        lastX.current = e.clientX;
      }}
      onPointerUp={() => {
        lastX.current = null;
        carry.current = 0;
      }}
      onPointerCancel={() => {
        lastX.current = null;
        carry.current = 0;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(clampStep(value + step));
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(clampStep(value - step));
        else return;
        e.preventDefault();
      }}
    />
  );
}

// ---- the last two screens ----

/** "Building your plan": a ring counting to 100% while the five lines tick off underneath. */
function BuildingScreen({ progress, onDone }: { progress: number; onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 2500);
      setPct(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else done.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="flex flex-1 flex-col" style={{ paddingTop: "calc(10px + env(safe-area-inset-top, 0px))" }}>
      <div className="flex px-4">
        <ProgressBar progress={progress} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Ring fraction={pct} color="var(--ink)" size={148} stroke={12}>
          <span className="num text-[30px] font-extrabold" style={{ letterSpacing: "-0.035em" }}>
            {Math.round(pct * 100)}%
          </span>
        </Ring>
        <h1 className="mt-6 text-[26px] font-extrabold" style={{ letterSpacing: "-0.035em" }}>
          Building your plan
        </h1>
        <p className="mt-1 text-[13px] muted">Crunching your numbers — a few seconds.</p>
        <ul className="mt-6 flex w-full list-none flex-col gap-2.5 p-0">
          {PLAN_CHECKS.map((label, i) => {
            const ok = pct >= (i + 1) / PLAN_CHECKS.length;
            return (
              <li key={label} className="flex items-center gap-3">
                <span className="grid place-items-center rounded-full" style={{ width: 24, height: 24, background: ok ? "var(--green)" : "var(--card2)", color: ok ? "#0b0b0c" : "var(--muted)", transition: "background-color 0.2s ease" }}>
                  {ok ? <Check size={14} /> : null}
                </span>
                <span className="text-[15px] font-semibold" style={{ color: ok ? "var(--ink)" : "var(--muted)" }}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** "Your custom plan is ready": the goal chip, the four daily targets, then into the app. */
function PlanScreen({
  a,
  weight,
  maintaining,
  built,
  flags,
  error,
  busy,
  onBack,
  onStart,
}: {
  a: Answers;
  weight: number | null;
  maintaining: boolean;
  built: Plan | null;
  flags: EdFlag[];
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const targets = built?.targets ?? null;
  const current = weight ?? 60;
  const goal = maintaining ? current : (a.goalWeightKg ?? current);
  const delta = Math.abs(goal - current);
  const pace = Math.max(0.1, built?.speed || roundSpeed(a.speed));
  let chip: string;
  if (built?.teen) chip = built.goal === "gain" ? "Build muscle, fuel growth" : "Grow stronger";
  else if (maintaining || delta < 0.25) chip = `Maintain ${fmt(current)} kg`;
  else {
    const days = Math.min(3650, Math.max(7, Math.ceil((delta / pace) * 7)));
    const by = new Date();
    by.setDate(by.getDate() + days);
    chip = `${goal > current ? "Gain" : "Lose"} ${fmt(delta)} kg by ${by.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
  }
  const obstacleLine = OBSTACLES.find(([label]) => a.obstacles.includes(label))?.[1];

  return (
    <div className="flex flex-1 flex-col" style={{ paddingTop: "calc(10px + env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-3 px-4">
        <button type="button" onClick={onBack} aria-label="Back" className="press grid place-items-center rounded-full" style={{ width: 34, height: 34, background: "var(--card2)" }}>
          <ArrowLeft size={17} />
        </button>
        <ProgressBar progress={1} />
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-6 pb-3 pt-6">
        <Rise index={0}>
          <div className="flex flex-col items-center">
            <span className="grid place-items-center rounded-full" style={{ width: 64, height: 64, background: "var(--btn)", color: "var(--btn-ink)" }}>
              <Check size={30} />
            </span>
            <h1 className="mt-3.5 text-center text-[28px] font-extrabold leading-8" style={{ letterSpacing: "-0.04em" }}>
              Your custom plan is ready
            </h1>
            <span className="mt-2.5 rounded-full px-3.5 py-2 text-sm font-bold" style={{ background: "var(--card2)" }}>
              {chip}
            </span>
          </div>
        </Rise>
        <Rise index={1}>
          <p className="flex items-center gap-1.5 text-[15px] font-bold">
            Daily recommendation
            <ScienceButton />
          </p>
          <p className="text-xs muted">
            {built?.speedCapped ? `Paced at ${fmt(built.speed)} kg a week, the safe max for your body. ` : ""}You can edit this anytime.
          </p>
        </Rise>
        {targets ? (
          <>
            <Rise index={2}>
              <div className="grid grid-cols-2 gap-3">
                <TargetCard label="Calories" value={targets.calories} unit="" color="var(--ink)" />
                <TargetCard label="Carbs" value={targets.carbs} unit="g" color="var(--orange)" />
              </div>
            </Rise>
            <Rise index={3}>
              <div className="grid grid-cols-2 gap-3">
                <TargetCard label="Protein" value={targets.protein} unit="g" color="var(--red)" />
                <TargetCard label="Fats" value={targets.fat} unit="g" color="var(--blue)" />
              </div>
            </Rise>
          </>
        ) : (
          <Rise index={2}>
            <Card>
              <p className="text-[13px] muted">We&apos;ll set your targets once your details are in — open Profile → Edit Nutrition Goals.</p>
            </Card>
          </Rise>
        )}
        {flags.length ? (
          <Rise index={4}>
            <SafetyNote flags={flags} floor={built?.floorApplied ? built.targets.calories : null} />
          </Rise>
        ) : null}
        {obstacleLine ? (
          <Rise index={4}>
            <p className="rounded-2xl px-4 py-3.5 text-sm font-semibold" style={{ background: "var(--card2)" }}>
              {obstacleLine}
            </p>
          </Rise>
        ) : null}
        <Rise index={5}>
          <ErrorNote text={error} />
        </Rise>
      </div>
      <div className="px-6" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <PillButton onClick={onStart} disabled={busy} height={54}>
          {busy ? "Saving…" : "Let's get started!"}
        </PillButton>
      </div>
    </div>
  );
}

/** One of the four daily targets: a coloured ring, the number, and the pencil that hints at editing. */
function TargetCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <Card padding={14}>
      <div className="flex items-start justify-between">
        <Ring fraction={1} color={color} size={34} stroke={5}>
          <span className="rounded-full" style={{ width: 8, height: 8, background: color }} />
        </Ring>
        <span style={{ color: "var(--muted)" }}>
          <Pencil size={13} />
        </span>
      </div>
      <p className="num mt-2.5 text-[26px] font-extrabold leading-tight" style={{ letterSpacing: "-0.035em" }}>
        {value}
        {unit}
      </p>
      <p className="text-xs font-semibold muted">{label}</p>
    </Card>
  );
}
