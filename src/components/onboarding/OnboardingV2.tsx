"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { md } from "@/components/motion";
import { BottomSheet, ErrorNote } from "@/components/ui";
import { Padlock } from "@/components/BrandMark";
import { useDictation } from "@/lib/speech";
import { today as todayIst } from "@/lib/dates";
import { ageYears, isTeen, TEEN_GOAL_NOTE } from "@/lib/goals";
import { bmi, bmiCategoryIndia } from "@/lib/bmi";
import { defaultMealType, MEAL_TYPES, type MealType } from "@/lib/mealType";
import { nameFromEmail } from "@/lib/display";
import type { MealItem, ParseResult } from "@/lib/types";
import {
  CHALLENGES,
  EATER_TYPES,
  GOALS,
  OBSTACLES,
  SOURCES,
  SPORTS,
  STYLES,
  effectiveCoachStyle,
  firstLogNote,
  goalTypeOf,
  onboardingPlan,
  paceKg,
  prettyDate,
  type CoachStyle,
  type OnbPace,
  type OnbPlan,
} from "@/lib/onboardingV2";
import { Bolded, CoachBubble, Cta, Eyebrow, Heading, OnbIcon, Option, TopBar, type OnbIconName } from "./kit";
import { EMPTY, clearOnb, deviceId, loadOnb, saveOnb, type OnbState } from "./store";
import { Wheel, nearest } from "./Wheel";

/**
 * v2.14 Gen Z onboarding, 17 screens (canvas "Onboarding 01 · brand v1"): value first — the first
 * log comes before any personal question and the account is created on the last screen. Works
 * signed out (/start from the login screen) and signed in (profile incomplete, or "Tune your plan"
 * with `tune`, which only asks training, obstacles and coach style).
 */

const S = { source: 0, goal: 1, firstLog: 2, result: 3, streak: 4, body: 5, pace: 6, training: 7, eater: 8, obstacles: 9, coach: 10, buddy: 11, challenge: 12, building: 13, reveal: 14, pledge: 15, save: 16 } as const;
/** Section of the progress pill per step (-1 = no top bar). */
const SECTION = [0, 0, 0, 0, 1, 2, 2, 3, 4, 4, 4, 5, 5, -1, -1, -1, -1];
const TUNE_STEPS: number[] = [S.training, S.obstacles, S.coach];

const SOURCE_ICON: Record<string, OnbIconName> = { instagram: "instagram", youtube: "youtube", friend: "users", college_gym: "grad", search: "search", other: "dots" };
const GOAL_ICON: Record<string, OnbIconName> = { lose: "down", gain: "dumbbell", recomp: "plus", habits: "lock" };
const EATER_ICON: Record<string, OnbIconName> = { balanced: "scales", high_protein: "dumbbell", vegetarian: "leaf", eggetarian: "leaf", jain: "leaf", vegan: "leaf", keto: "bolt", low_carb: "chart" };
const OBSTACLE_ICON: Record<string, OnbIconName> = { exam_stress: "book", mess_food: "home", late_night: "moon", no_time: "clock", eating_out: "users", lost_motivation: "chart" };
const STYLE_ICON: Record<CoachStyle, OnbIconName> = { calm: "leaf", balanced: "scales", no_excuses: "bolt" };

const HEIGHTS = Array.from({ length: 221 - 130 }, (_, i) => 130 + i);
const KGS = Array.from({ length: (200 - 30) * 2 + 1 }, (_, i) => 30 + i * 0.5);
const LBS = Array.from({ length: 440 - 66 + 1 }, (_, i) => 66 + i);
const LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;
const ftIn = (cm: number) => {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
};

export default function OnboardingV2({ signedIn, tune = false, firstName = "" }: { signedIn: boolean; tune?: boolean; firstName?: string }) {
  const router = useRouter();
  const [st, setSt] = useState<OnbState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const replayed = useRef(false);

  // Restore the device copy (value-first: nothing is on the server until the account exists).
  useEffect(() => {
    const saved = loadOnb();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after mount
    if (saved && !tune) setSt(saved);
    else if (tune) setSt({ ...EMPTY, step: TUNE_STEPS[0] });
    setReady(true);
  }, [tune]);

  useEffect(() => {
    if (ready && !tune) saveOnb(st);
  }, [st, ready, tune]);

  const a = st.answers;
  const age = ageYears(a.dob ?? null);
  const teen = isTeen(age);
  const plan: OnbPlan | null = useMemo(() => onboardingPlan(a, todayIst()), [a]);

  const set = (patch: Partial<OnbState>) => setSt((s) => ({ ...s, ...patch }));
  const answer = (patch: Partial<OnbState["answers"]>) => setSt((s) => ({ ...s, answers: { ...s.answers, ...patch } }));

  function nextStep(from: number): number {
    if (tune) {
      const i = TUNE_STEPS.indexOf(from);
      return i >= 0 && i < TUNE_STEPS.length - 1 ? TUNE_STEPS[i + 1] : -1;
    }
    let n = from + 1;
    // "Just stay locked in" has no target weight or pace.
    if (n === S.pace && a.goal === "habits") n++;
    // The first log's result only exists when something was parsed.
    if (n === S.result && !st.firstLog) n++;
    return n;
  }
  function prevStep(from: number): number {
    if (tune) {
      const i = TUNE_STEPS.indexOf(from);
      return i > 0 ? TUNE_STEPS[i - 1] : -1;
    }
    let n = from - 1;
    if (n === S.pace && a.goal === "habits") n--;
    if (n === S.result && !st.firstLog) n--;
    if (n === S.building) n--;
    return n;
  }
  const go = () => {
    const n = nextStep(st.step);
    if (n < 0) return void finish();
    set({ step: n });
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    const n = prevStep(st.step);
    if (n < 0) return router.back();
    set({ step: n });
  };

  async function finish() {
    setSaving(true);
    setErr(null);
    try {
      const body = tune ? { mode: "tune", answers: a } : { mode: "full", answers: a, first_log: st.firstLog };
      const res = await fetch("/api/onboarding/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Could not save your plan");
      if (!tune) clearOnb();
      const dest = !tune && st.buddy === "invite" ? "/buddy?invite=1" : !tune && st.squadCode ? `/join/${st.squadCode}` : "/?welcome=1";
      router.replace(dest);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save your plan");
      setSaving(false);
    }
  }

  // Signed in with a finished plan on this device (e.g. after confirming the email): save it now.
  useEffect(() => {
    if (ready && signedIn && st.done && !tune && !replayed.current) {
      replayed.current = true;
      void finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the stored state is loaded
  }, [ready, signedIn, st.done, tune]);

  if (!ready) return <main className="min-h-[100dvh]" style={{ background: "var(--bg)" }} />;
  if (signedIn && st.done && !tune)
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Padlock size={88} />
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>{saving ? "Saving your plan…" : "Almost there"}</h1>
          <ErrorNote text={err} />
          {err ? (
            <button type="button" className="pill press" style={{ maxWidth: 320 }} onClick={() => void finish()}>
              Try again
            </button>
          ) : null}
        </div>
      </Shell>
    );

  const step = st.step;
  const section = SECTION[step] ?? -1;
  const top = section >= 0 ? <TopBar section={section} onBack={step === 0 ? (signedIn ? () => router.back() : () => router.push("/login")) : back} /> : null;

  switch (step) {
    case S.source:
      return (
        <Shell key={step}>
          {top}
          <Heading eyebrow="Quick one" title="Where'd you find us?" sub="Helps us find more people like you." />
          <List>
            {SOURCES.map((s, i) => (
              <Option key={s.key} icon={SOURCE_ICON[s.key]} title={s.label} selected={a.heard_from === s.key} delay={450 + i * 150} onClick={() => answer({ heard_from: s.key })} />
            ))}
          </List>
          <Cta label="Continue" disabled={!a.heard_from} onClick={go} secondary="Skip" onSecondary={go} />
        </Shell>
      );

    case S.goal:
      return (
        <Shell key={step}>
          {top}
          <Heading
            eyebrow="Your goal"
            title={
              <>
                What are we
                <br />
                locking in on?
              </>
            }
            sub="Pick one. You can change it anytime."
          />
          <List>
            {GOALS.map((g, i) => (
              <Option key={g.key} icon={GOAL_ICON[g.key]} title={g.label} sub={g.sub} selected={a.goal === g.key} delay={450 + i * 150} onClick={() => answer({ goal: g.key, pace: a.pace ?? (g.key === "recomp" ? "chill" : "steady") })} />
            ))}
          </List>
          <Cta label="Continue" disabled={!a.goal} onClick={go} />
        </Shell>
      );

    case S.firstLog:
      return <FirstLogScreen key={step} top={top} signedIn={signedIn} onParsed={(log) => setSt((s) => ({ ...s, firstLog: log, step: S.result }))} onSkip={() => set({ firstLog: null, step: S.streak })} />;

    case S.result:
      return st.firstLog ? (
        <ResultScreen
          key={step}
          top={top}
          log={st.firstLog}
          onMealType={(t) => set({ firstLog: st.firstLog ? { ...st.firstLog, meal_type: t } : null })}
          onNext={go}
        />
      ) : null;

    case S.streak:
      return <StreakScreen key={step} top={top} logged={!!st.firstLog} onNext={go} />;

    case S.body:
      return <BodyScreen key={step} top={top} st={st} setSt={setSt} onNext={go} />;

    case S.pace:
      return <PaceScreen key={step} top={top} st={st} teen={teen} plan={plan} answer={answer} onNext={go} />;

    case S.training: {
      const days = a.training_days;
      const sports = a.sports ?? [];
      const perKg = plan && a.weight_kg ? round1(plan.targets.protein / a.weight_kg) : null;
      return (
        <Shell key={step}>
          {top}
          <Heading
            eyebrow="Your training"
            title={
              <>
                How many days
                <br />
                do you train?
              </>
            }
            sub="Per week. Be real, we'll build from here."
          />
          <div className="m-rise flex justify-between" style={md(450, { padding: "22px 20px 0" })} role="radiogroup" aria-label="Training days per week">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                className="press display grid place-items-center"
                style={{ width: 40, height: 48, borderRadius: 14, border: 0, fontSize: 18, fontWeight: 800, background: days === d ? "var(--btn)" : "var(--surf)", color: days === d ? "var(--btn-ink)" : "var(--ink)" }}
                onClick={() => answer({ training_days: d })}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="m-rise" style={md(600, { padding: "22px 20px 0" })}>
            <div className="mono mb-2.5" style={{ fontSize: 12, color: "var(--mute)" }}>
              What do you do?
            </div>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((sp) => {
                const on = sports.includes(sp);
                return (
                  <button
                    key={sp}
                    type="button"
                    aria-pressed={on}
                    className="press rounded-full"
                    style={{ padding: "11px 16px", border: 0, fontSize: 15, fontWeight: 600, background: on ? "var(--btn)" : "var(--surf)", color: on ? "var(--btn-ink)" : "var(--ink)" }}
                    onClick={() => answer({ sports: on ? sports.filter((x) => x !== sp) : [...sports, sp] })}
                  >
                    {sp}
                  </button>
                );
              })}
            </div>
          </div>
          {days != null && days > 0 && perKg ? (
            <div className="m-rise" style={md(200, { margin: "20px 20px 0", padding: "14px 16px", borderRadius: 18, background: "var(--ember-bg)", color: "var(--ember)", fontSize: 14, fontWeight: 600 })}>
              {days} day{days === 1 ? "" : "s"}
              {sports.length ? ` + ${sports.slice(0, 2).join(" + ").toLowerCase()}` : ""} → we&apos;ll set protein at {perKg} g/kg to keep the gains.
            </div>
          ) : null}
          <Cta label={tune ? "Next" : "Continue"} disabled={days == null} onClick={go} />
        </Shell>
      );
    }

    case S.eater:
      return <EaterScreen key={step} top={top} teen={teen} value={a.diet_mode ?? null} onPick={(m) => answer({ diet_mode: m })} onNext={go} />;

    case S.obstacles: {
      const picked = a.obstacles ?? [];
      return (
        <Shell key={step}>
          {top}
          <Heading
            eyebrow="Real talk"
            title={
              <>
                What&apos;s got in
                <br />
                your way before?
              </>
            }
            sub="Pick any. We build around the obstacle, not the goal."
          />
          <List gap={8}>
            {OBSTACLES.map((o, i) => (
              <Option
                key={o.key}
                multi
                compact
                icon={OBSTACLE_ICON[o.key]}
                title={o.label}
                sub={o.sub}
                selected={picked.includes(o.key)}
                delay={300 + i * 110}
                onClick={() => answer({ obstacles: picked.includes(o.key) ? picked.filter((x) => x !== o.key) : [...picked, o.key] })}
              />
            ))}
          </List>
          <Cta
            label={tune ? "Next" : "Continue"}
            disabled={!picked.length}
            onClick={go}
            secondary="None of these"
            onSecondary={() => {
              answer({ obstacles: [] });
              go();
            }}
          />
        </Shell>
      );
    }

    case S.coach:
      return (
        <CoachStyleScreen
          key={step}
          top={top}
          teen={teen}
          value={a.coach_style ?? "balanced"}
          onPick={(v) => answer({ coach_style: v })}
          onNext={go}
          busy={saving}
          err={err}
          tune={tune}
        />
      );

    case S.buddy:
      return <BuddyScreen key={step} top={top} initial={firstName || a.name || ""} squadCode={st.squadCode} onInvite={() => { set({ buddy: "invite" }); go(); }} onLater={() => { set({ buddy: "later" }); go(); }} onSquad={(code) => set({ squadCode: code })} />;

    case S.challenge:
      return (
        <Shell key={step}>
          {top}
          <Heading eyebrow="First challenge" title="Pick your first W." sub="Small, winnable, today. Your squad can join." />
          <List>
            {CHALLENGES.map((c, i) => (
              <div key={c.key} className="m-rise" style={md(400 + i * 150)}>
                {i === 0 ? (
                  <div className="mono mb-1.5 pl-2" style={{ fontSize: 11, color: "var(--ember)" }}>
                    Recommended
                  </div>
                ) : null}
                <button
                  type="button"
                  role="radio"
                  aria-checked={a.first_challenge === c.key}
                  className="press flex w-full items-center justify-between gap-3 text-left"
                  style={{ padding: 18, borderRadius: 22, border: 0, background: a.first_challenge === c.key ? "var(--btn)" : "var(--surf)", color: a.first_challenge === c.key ? "var(--btn-ink)" : "var(--ink)" }}
                  onClick={() => answer({ first_challenge: c.key })}
                >
                  <span>
                    <span className="display block" style={{ fontSize: 19, fontWeight: 800 }}>
                      {c.title}
                    </span>
                    <span className="mt-0.5 block" style={{ fontSize: 13.5, opacity: 0.7 }}>
                      {c.sub}
                    </span>
                  </span>
                  <span className="mono rounded-full" style={{ fontSize: 10, padding: "5px 9px", border: "1px solid currentColor", opacity: 0.8 }}>
                    {c.level}
                  </span>
                </button>
              </div>
            ))}
          </List>
          <Cta label="I'm in" disabled={!a.first_challenge} onClick={go} secondary="Skip for now" onSecondary={go} />
        </Shell>
      );

    case S.building:
      return <BuildingScreen key={step} st={st} teen={teen} onDone={() => set({ step: S.reveal })} />;

    case S.reveal:
      return <RevealScreen key={step} st={st} plan={plan} onNext={go} onBack={back} />;

    case S.pledge:
      return <PledgeScreen key={step} plan={plan} goalWeight={a.goal_weight_kg ?? null} onDone={() => set({ step: S.save, done: true, savedAt: Date.now() })} onBack={back} />;

    case S.save:
      return <SaveScreen key={step} st={st} plan={plan} signedIn={signedIn} busy={saving} err={err} onSaveSignedIn={() => void finish()} onName={(n) => answer({ name: n })} />;
  }
  return null;
}

// ---------------------------------------------------------------- layout

function Shell({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col"
      style={dark ? { background: "#0B0B0C", color: "#F4F1EA" } : { background: "var(--bg)", color: "var(--ink)" }}
    >
      {children}
    </main>
  );
}

function List({ children, gap = 10 }: { children: React.ReactNode; gap?: number }) {
  return (
    <div className="flex flex-col" style={{ padding: "20px 20px 0", gap }} role="radiogroup">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- 03 first log

function FirstLogScreen({ top, signedIn, onParsed, onSkip }: { top: React.ReactNode; signedIn: boolean; onParsed: (log: NonNullable<OnbState["firstLog"]>) => void; onSkip: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [later, setLater] = useState<null | "photo" | "barcode">(null);
  const dictation = useDictation((t) => setText((v) => (v ? `${v} ${t}` : t)));

  async function parse() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/parse-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
        body: JSON.stringify({ text: t, preview: !signedIn }),
      });
      const out = (await res.json().catch(() => ({}))) as ParseResult & { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't read that. Try again?");
      const items: MealItem[] = (out.items ?? []).map((i) => ({ ...i }));
      if (!items.length) throw new Error("We couldn't find food in that. Try “2 roti, dal, curd”.");
      onParsed({ text: t, items, meal_type: defaultMealType(), date: todayIst() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that. Try again?");
      setBusy(false);
    }
  }

  const ways: { n: number; title: string; sub: string; onClick: () => void }[] = [
    { n: 1, title: "Type it", sub: "2 roti, dal, curd", onClick: () => document.getElementById("onb-first-log")?.focus() },
    { n: 2, title: "Say it", sub: "Hinglish works: “do roti aur dal”", onClick: () => dictation.toggle() },
    { n: 3, title: "Snap it", sub: "Photo of your plate", onClick: () => setLater("photo") },
    { n: 4, title: "Scan it", sub: "Any packaged food", onClick: () => setLater("barcode") },
  ];

  return (
    <Shell>
      {top}
      <Heading
        eyebrow="Try it first"
        title={
          <>
            What did you
            <br />
            eat today?
          </>
        }
        sub="Log your first meal before we ask you anything. Takes 5 seconds."
      />
      <div className="flex flex-col gap-2.5" style={{ padding: "20px 20px 0" }}>
        {ways.map((w, i) => (
          <button key={w.n} type="button" className="m-rise press flex items-center gap-3.5 text-left" style={md(400 + i * 130, { padding: "14px 16px", borderRadius: 18, border: 0, background: "var(--surf)", color: "var(--ink)" })} onClick={w.onClick}>
            <span className="grid place-items-center rounded-full" style={{ width: 28, height: 28, background: "var(--ember-bg)", color: "var(--ember)", fontSize: 13, fontWeight: 800, flex: "none" }}>
              {w.n}
            </span>
            <span>
              <span className="block" style={{ fontSize: 16, fontWeight: 700 }}>
                {w.n === 2 && dictation.listening ? "Listening… tap to stop" : w.title}
              </span>
              <span className="block" style={{ fontSize: 13.5, color: "var(--mute)" }}>
                {w.sub}
              </span>
            </span>
          </button>
        ))}
        {later ? (
          <p className="m-fade rounded-2xl px-4 py-3 text-[13.5px]" style={{ background: "var(--surf2)", color: "var(--ink)" }}>
            {later === "photo" ? "Plate photos" : "Barcode scans"} unlock once you save your plan. Type or say it for now, it&apos;s just as quick.
          </p>
        ) : null}
        <ErrorNote text={err ?? dictation.error} />
      </div>
      <div className="sticky bottom-0 mt-auto flex flex-col items-center gap-3" style={{ padding: "18px 20px calc(24px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(to top, var(--bg) 70%, transparent)" }}>
        <form
          className="flex w-full items-center gap-2 rounded-full"
          style={{ height: 58, padding: "0 8px 0 18px", background: "var(--surf)", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void parse();
          }}
        >
          <input
            id="onb-first-log"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="2 roti, dal, curd, salad"
            aria-label="What did you eat?"
            className="min-w-0 flex-1 bg-transparent"
            style={{ border: 0, outline: "none", fontSize: 16, caretColor: "var(--ember)" }}
            enterKeyHint="send"
          />
          {dictation.supported ? (
            <button type="button" aria-label={dictation.listening ? "Stop listening" : "Say it"} aria-pressed={dictation.listening} className="press grid place-items-center rounded-full" style={{ width: 42, height: 42, border: 0, background: dictation.listening ? "var(--ember-bg)" : "transparent", color: dictation.listening ? "var(--ember)" : "var(--mute)" }} onClick={() => dictation.toggle()}>
              <OnbIcon name="mic" />
            </button>
          ) : null}
          <button type="submit" aria-label="Log it" disabled={!text.trim() || busy} className="press grid place-items-center rounded-full" style={{ width: 42, height: 42, border: 0, background: "var(--btn)", color: "var(--btn-ink)" }}>
            {busy ? <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--btn-ink)", borderTopColor: "transparent" }} /> : <OnbIcon name="send" size={18} />}
          </button>
        </form>
        <button type="button" className="press hit" style={{ background: "none", border: 0, fontSize: 14, color: "var(--mute)" }} onClick={onSkip}>
          I haven&apos;t eaten yet
        </button>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- 04 result

function portion(i: MealItem): string {
  if (i.servings && i.serving_unit) {
    const unit = i.serving_unit.label.replace(/^1\s+/, "");
    return `${round1(i.servings)} ${unit}`;
  }
  return `${Math.round(i.grams)} g`;
}

function ResultScreen({ top, log, onMealType, onNext }: { top: React.ReactNode; log: NonNullable<OnbState["firstLog"]>; onMealType: (t: MealType) => void; onNext: () => void }) {
  const t = log.items.reduce((s, i) => ({ calories: s.calories + i.calories, protein: s.protein + i.protein_g, carbs: s.carbs + i.carbs_g, fat: s.fat + i.fat_g }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return (
    <Shell>
      {top}
      <Heading eyebrow="Locked In read it" title="Here's what you ate." />
      <div className="m-rise flex flex-col" style={md(300, { margin: "18px 20px 0", borderRadius: 22, background: "var(--surf)", padding: "6px 16px" })}>
        {log.items.map((i, n) => (
          <div key={`${i.name}-${n}`} className="flex items-center justify-between gap-3" style={{ padding: "12px 0", borderTop: n ? "1px solid var(--line)" : 0 }}>
            <span className="min-w-0">
              <span className="block truncate" style={{ fontSize: 16, fontWeight: 700 }}>
                {i.name}
              </span>
              <span className="block" style={{ fontSize: 13, color: "var(--mute)" }}>
                {portion(i)}
              </span>
            </span>
            <span className="text-right">
              <span className="num block" style={{ fontSize: 15, fontWeight: 700 }}>
                {Math.round(i.calories)} kcal
              </span>
              <span className="num block" style={{ fontSize: 12.5, color: "var(--mute)" }}>
                {Math.round(i.protein_g)} g protein
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="m-rise flex items-baseline justify-between" style={md(450, { margin: "10px 20px 0", padding: "14px 16px", borderRadius: 18, background: "var(--btn)", color: "var(--btn-ink)" })}>
        <span className="display num" style={{ fontSize: 26, fontWeight: 800 }}>
          {Math.round(t.calories)} kcal
        </span>
        <span className="mono" style={{ fontSize: 11, opacity: 0.75 }}>
          P {Math.round(t.protein)} g · C {Math.round(t.carbs)} g · F {Math.round(t.fat)} g
        </span>
      </div>
      <div className="m-rise" style={md(650, { padding: "14px 20px 0" })}>
        <CoachBubble label="Coach note">{firstLogNote(t, log.items.map((i) => i.name))}</CoachBubble>
      </div>
      <div className="m-rise" style={md(800, { padding: "16px 20px 0" })}>
        <div className="mono mb-2" style={{ fontSize: 11, color: "var(--mute)" }}>
          Log as
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Meal">
          {MEAL_TYPES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={log.meal_type === m.key} className="press rounded-full" style={{ padding: "9px 15px", border: 0, fontSize: 14, fontWeight: 600, background: log.meal_type === m.key ? "var(--btn)" : "var(--surf)", color: log.meal_type === m.key ? "var(--btn-ink)" : "var(--ink)" }} onClick={() => onMealType(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <Cta label="Looks right, continue" onClick={onNext} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 05 streak

function StreakScreen({ top, logged, onNext }: { top: React.ReactNode; logged: boolean; onNext: () => void }) {
  const dow = new Date().getDay();
  return (
    <Shell>
      {top}
      <Heading
        title={
          <>
            Day 1.
            <br />
            Don&apos;t break
            <br />
            the chain.
          </>
        }
      />
      <div className="grid place-items-center" style={{ paddingTop: 30 }}>
        <div className="m-pop grid place-items-center rounded-full" style={md(500, { width: 180, height: 180, background: "radial-gradient(circle, color-mix(in srgb, var(--ember) 20%, transparent), transparent 70%)" })}>
          <span className="flame-breathe" style={{ color: "var(--ember)" }}>
            <OnbIcon name="flame" size={84} stroke={1.4} />
          </span>
        </div>
      </div>
      <div className="mono text-center" style={{ fontSize: 12, color: "var(--ember)", marginTop: 8 }}>
        Streak · Day 1
      </div>
      <p className="text-center" style={{ margin: "10px 32px 0", fontSize: 15, lineHeight: 1.5, color: "var(--mute)" }}>
        One log a day keeps it alive. Your squad sees it too, so no pressure… okay, a little pressure.
      </p>
      <div className="flex justify-between" style={{ padding: "26px 34px 0" }} aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className={i === dow && logged ? "m-pop grid place-items-center rounded-full" : "grid place-items-center rounded-full"} style={md(1400, { width: 34, height: 34, background: i === dow && logged ? "var(--ember)" : "var(--surf)", color: "#fff", outline: i === dow && !logged ? "2px solid var(--ember)" : "none" })}>
              {i === dow && logged ? <OnbIcon name="flame" size={16} stroke={2} /> : null}
            </span>
            <span style={{ fontSize: 11, color: "var(--mute)", fontWeight: 600 }}>{d}</span>
          </div>
        ))}
      </div>
      <Cta label="Keep going" onClick={onNext} secondary={logged ? "Logged today. That's all it takes." : "Log anything today and day 1 is yours."} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 06 body

function BodyScreen({ top, st, setSt, onNext }: { top: React.ReactNode; st: OnbState; setSt: React.Dispatch<React.SetStateAction<OnbState>>; onNext: () => void }) {
  const a = st.answers;
  const cm = a.height_cm ?? 170;
  const kg = a.weight_kg ?? 70;
  const answer = (patch: Partial<OnbState["answers"]>) => setSt((s) => ({ ...s, answers: { ...s.answers, ...patch } }));
  const units = st.units;
  // Seed the defaults so Continue works even without touching the wheels.
  useEffect(() => {
    if (a.height_cm == null || a.weight_kg == null) answer({ height_cm: a.height_cm ?? 170, weight_kg: a.weight_kg ?? 70 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once
  }, []);
  const age = ageYears(a.dob ?? null);
  const b = bmi(kg, cm);
  const cat = b != null && age != null && age >= 18 ? bmiCategoryIndia(b) : null;
  const catWords = cat === "Normal" ? "in the healthy range" : cat === "Overweight" ? "a little above healthy" : cat === "Obese" ? "above healthy" : cat === "Underweight" ? "a little under healthy" : null;
  const maxDob = `${new Date().getFullYear() - 10}-12-31`;
  const seg = (on: boolean): React.CSSProperties => ({ padding: "7px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600, border: 0, background: on ? "var(--surf)" : "transparent", color: on ? "var(--ink)" : "var(--mute)" });
  const setUnits = (u: Partial<OnbState["units"]>) => setSt((s) => ({ ...s, units: { ...s.units, ...u } }));

  return (
    <Shell>
      {top}
      <Heading
        eyebrow="About you"
        title={
          <>
            Height and
            <br />
            weight.
          </>
        }
        sub="Honest numbers make a plan that actually works."
      />
      <div className="m-rise flex justify-center gap-2.5" style={md(300, { paddingTop: 16 })}>
        <div className="inline-flex rounded-full p-1" style={{ background: "var(--surf2)" }}>
          <button type="button" className="press" style={seg(units.height === "cm")} aria-pressed={units.height === "cm"} onClick={() => setUnits({ height: "cm" })}>
            cm
          </button>
          <button type="button" className="press" style={seg(units.height === "ftin")} aria-pressed={units.height === "ftin"} onClick={() => setUnits({ height: "ftin" })}>
            ft/in
          </button>
        </div>
        <div className="inline-flex rounded-full p-1" style={{ background: "var(--surf2)" }}>
          <button type="button" className="press" style={seg(units.weight === "kg")} aria-pressed={units.weight === "kg"} onClick={() => setUnits({ weight: "kg" })}>
            kg
          </button>
          <button type="button" className="press" style={seg(units.weight === "lb")} aria-pressed={units.weight === "lb"} onClick={() => setUnits({ weight: "lb" })}>
            lb
          </button>
        </div>
      </div>
      <div className="m-rise flex justify-center gap-[18px]" style={md(450, { paddingTop: 18 })}>
        <Wheel label="Height" unit={units.height === "cm" ? "CM" : "FT / IN"} values={HEIGHTS} index={nearest(HEIGHTS, cm)} onIndex={(i) => answer({ height_cm: HEIGHTS[i] })} format={(v) => (units.height === "cm" ? String(v) : ftIn(v))} />
        {units.weight === "kg" ? (
          <Wheel label="Weight" unit="KG" values={KGS} index={nearest(KGS, kg)} onIndex={(i) => answer({ weight_kg: KGS[i] })} format={(v) => v.toFixed(1)} />
        ) : (
          <Wheel label="Weight" unit="LB" values={LBS} index={nearest(LBS, kg / LB)} onIndex={(i) => answer({ weight_kg: round1(LBS[i] * LB) })} format={(v) => String(v)} />
        )}
      </div>
      <div className="m-rise flex items-center gap-2.5" style={md(600, { margin: "16px 20px 0" })}>
        <label className="flex flex-1 flex-col gap-1">
          <span className="mono" style={{ fontSize: 10.5, color: "var(--mute)" }}>
            Birthday
          </span>
          <input type="date" className="pickfield" style={{ background: "var(--surf)" }} max={maxDob} min="1920-01-01" value={a.dob ?? ""} onChange={(e) => answer({ dob: e.target.value || null })} />
        </label>
        <div className="flex flex-col gap-1">
          <span className="mono" style={{ fontSize: 10.5, color: "var(--mute)" }}>
            Sex
          </span>
          <div className="inline-flex rounded-full p-1" style={{ background: "var(--surf2)" }} role="radiogroup" aria-label="Sex">
            {(["male", "female", "other"] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={a.gender === g} className="press" style={{ ...seg(a.gender === g), padding: "7px 12px" }} onClick={() => answer({ gender: g })}>
                {g === "male" ? "M" : g === "female" ? "F" : "Other"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {b != null && catWords ? (
        <div className="m-rise flex items-center justify-between" style={md(750, { margin: "12px 20px 0", padding: "14px 16px", borderRadius: 18, background: "var(--surf)", fontSize: 14 })}>
          <span style={{ color: "var(--mute)" }}>Your BMI (Indian ranges)</span>
          <b>
            {b.toFixed(1)} · {catWords}
          </b>
        </div>
      ) : null}
      <Cta label="Continue" disabled={!a.dob || !a.gender || age == null} onClick={onNext} secondary={!a.dob || !a.gender ? "Birthday and sex set your calories. Nothing else." : undefined} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 07 target + pace

function PaceScreen({ top, st, teen, plan, answer, onNext }: { top: React.ReactNode; st: OnbState; teen: boolean; plan: OnbPlan | null; answer: (p: Partial<OnbState["answers"]>) => void; onNext: () => void }) {
  const a = st.answers;
  const kg = a.weight_kg ?? 70;
  const gt = goalTypeOf(a.goal ?? null, teen ? 15 : 30);
  const gain = gt === "gain";
  const dflt = Math.round((gain ? kg + 4 : kg - Math.max(2, kg * 0.07)) * 2) / 2;
  const target = a.goal_weight_kg != null && (gain ? a.goal_weight_kg > kg : a.goal_weight_kg < kg) ? a.goal_weight_kg : dflt;
  useEffect(() => {
    if (!teen && a.goal_weight_kg !== target) answer({ goal_weight_kg: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep the stored target on the right side of the current weight
  }, [target, teen]);
  const pace: OnbPace = a.pace ?? "steady";
  const perWeek = paceKg(gt, pace);
  const weeks = plan?.weeks ?? null;
  const bump = (d: number) => answer({ goal_weight_kg: Math.max(30, Math.min(200, Math.round((target + d) * 2) / 2)) });
  const stops: OnbPace[] = ["chill", "steady", "aggressive"];
  const idx = stops.indexOf(pace);

  if (teen && (a.goal === "lose" || a.goal === "recomp"))
    return (
      <Shell>
        {top}
        <Heading eyebrow="Your pace" title="Build habits, not a deficit." sub={TEEN_GOAL_NOTE} />
        <div className="m-rise" style={md(400, { margin: "20px 20px 0", padding: 20, borderRadius: 24, background: "var(--surf)" })}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
            Under 18 we don&apos;t set a weight-loss pace. Your plan fuels growth and training, and the coach focuses on protein, sleep and showing up.
          </p>
        </div>
        <Cta label="Continue" onClick={onNext} />
      </Shell>
    );

  return (
    <Shell>
      {top}
      <div className="m-rise" style={md(100, { padding: "28px 22px 0" })}>
        <div className="mono flex gap-2.5" style={{ fontSize: 11, color: "var(--mute)" }}>
          <span style={{ color: "var(--ember)" }}>05</span>
          <span>Your pace</span>
        </div>
        <h1 className="mt-3" style={{ fontSize: 40, fontWeight: 800, lineHeight: 0.98 }}>
          Where to, and how fast?
        </h1>
      </div>
      <div className="m-rise flex items-center justify-between" style={md(400, { margin: "18px 20px 0", padding: "10px 10px 10px 18px", borderRadius: 20, border: "1px solid var(--line)" })}>
        <span className="mono" style={{ fontSize: 10, color: "var(--mute)" }}>
          Target weight
        </span>
        <span className="flex items-center gap-2">
          <button type="button" aria-label="Lower target" className="press grid h-9 w-9 place-items-center rounded-full" style={{ border: 0, background: "var(--surf2)", color: "var(--ink)" }} onClick={() => bump(-0.5)}>
            −
          </button>
          <span>
            <span className="display num" style={{ fontSize: 26, fontWeight: 800 }}>
              {target.toFixed(1)}
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--mute)" }}>
              {" "}
              kg
            </span>
          </span>
          <button type="button" aria-label="Raise target" className="press grid h-9 w-9 place-items-center rounded-full" style={{ border: 0, background: "var(--surf2)", color: "var(--ink)" }} onClick={() => bump(0.5)}>
            +
          </button>
        </span>
      </div>
      <div className="m-rise" style={md(600, { margin: "12px 20px 0", padding: 20, borderRadius: 24, background: "var(--surf)", border: "1px solid var(--line)" })}>
        <div className="mono" style={{ fontSize: 10, color: "var(--mute)" }}>
          At this pace
        </div>
        <div className="display num" style={{ fontSize: 42, fontWeight: 800, marginTop: 4 }}>
          {gain ? "+" : "−"}
          {perWeek}
          <span className="mono" style={{ fontSize: 11, color: "var(--mute)", fontWeight: 500 }}>
            {" "}
            kg / week{weeks ? ` · ~${weeks} weeks` : ""}
          </span>
        </div>
        <svg viewBox="0 0 300 92" width="100%" style={{ marginTop: 8 }} aria-hidden="true">
          <path d={gain ? "M0,76 L60,70 L120,60 L180,48 L240,32 L300,18 L300,92 L0,92 Z" : "M0,18 L60,32 L120,48 L180,60 L240,70 L300,76 L300,92 L0,92 Z"} style={{ fill: "var(--ink)" }} fillOpacity=".05" />
          <path d={gain ? "M0,76 L60,70 L120,60 L180,48 L240,32 L300,18" : "M0,18 L60,32 L120,48 L180,60 L240,70 L300,76"} fill="none" strokeWidth="2" pathLength={1} className="m-draw" style={{ stroke: "var(--ink)", ["--len" as string]: 1, animationDelay: "900ms" } as React.CSSProperties} />
          <circle cx="300" cy={gain ? 18 : 76} r="4.5" className="m-pop" style={{ fill: "var(--ink)", animationDelay: "2600ms" }} />
          <text x="0" y={gain ? 90 : 10} fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" style={{ fill: "var(--mute)" }}>
            {kg.toFixed(1)} KG
          </text>
          <text x="300" y={gain ? 10 : 90} textAnchor="end" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" style={{ fill: "var(--mute)" }}>
            {target.toFixed(1)} KG
          </text>
        </svg>
        <div style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 4 }}>Your exact finish date shows up at the end.</div>
      </div>
      <div className="m-rise" style={md(800)}>
        <div className="relative" style={{ margin: "24px 30px 0", height: 4, borderRadius: 2, background: "var(--surf2)" }}>
          <span className="absolute left-0 top-0" style={{ height: 4, width: `${idx * 50}%`, background: "var(--ink)", borderRadius: 2, transition: "width .3s ease" }} />
          <span className="absolute" style={{ left: `calc(${idx * 50}% - 15px)`, top: -13, width: 30, height: 30, borderRadius: 999, background: "var(--bg)", border: "2px solid var(--ink)", transition: "left .3s ease" }} />
        </div>
        <div className="flex justify-between" style={{ margin: "16px 20px 0" }} role="radiogroup" aria-label="Pace">
          {stops.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={pace === s} className="press text-center" style={{ background: "none", border: 0, color: pace === s ? "var(--ink)" : "var(--mute)", minWidth: 90 }} onClick={() => answer({ pace: s })}>
              <span className="display block" style={{ fontSize: 16, fontWeight: pace === s ? 800 : 600 }}>
                {s === "chill" ? "Chill" : s === "steady" ? "Steady" : "Aggressive"}
              </span>
              <span className="mono block" style={{ fontSize: 9, color: "var(--mute)" }}>
                {gain ? "+" : "−"}
                {paceKg(gt, s)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Cta label="Continue" onClick={onNext} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 09 eater

function EaterScreen({ top, teen, value, onPick, onNext }: { top: React.ReactNode; teen: boolean; value: string | null; onPick: (m: NonNullable<OnbState["answers"]["diet_mode"]>) => void; onNext: () => void }) {
  const [more, setMore] = useState(() => !!value && !["balanced", "high_protein", "vegetarian", "eggetarian", "jain"].includes(value));
  const list = EATER_TYPES.filter((e) => (more ? true : ["balanced", "high_protein", "vegetarian", "eggetarian", "jain"].includes(e.key))).filter((e) => !(teen && e.adultsOnly));
  return (
    <Shell>
      {top}
      <Heading
        eyebrow="Your food"
        title={
          <>
            What kind of
            <br />
            eater are you?
          </>
        }
        sub="Every suggestion follows this. Backed by the science."
      />
      <List gap={9}>
        {list.map((e, i) => (
          <Option key={e.key} icon={EATER_ICON[e.key]} title={e.label} sub={e.sub} selected={value === e.key} delay={300 + i * 110} onClick={() => onPick(e.key)} />
        ))}
      </List>
      <Cta label="Continue" disabled={!value} onClick={onNext} secondary={more ? undefined : teen ? "More: vegan" : "More: vegan, keto, low carb"} onSecondary={more ? undefined : () => setMore(true)} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 11 coach style

const SAMPLE: Record<CoachStyle, string> = {
  calm: "You skipped the gym today, that's okay. A 20-minute walk after dinner still counts. Tomorrow's a fresh start.",
  balanced: "You skipped the gym today. Fine once. Get a 20-minute walk in after dinner and we're back on track tomorrow.",
  no_excuses: "3 skipped sessions this week. You said recomp, not rest. Gym at 6. Shoes by the door tonight. No excuses.",
};

function CoachStyleScreen({ top, teen, value, onPick, onNext, busy, err, tune }: { top: React.ReactNode; teen: boolean; value: CoachStyle; onPick: (v: CoachStyle) => void; onNext: () => void; busy: boolean; err: string | null; tune: boolean }) {
  const v = effectiveCoachStyle(value, teen ? 15 : 30);
  const idx = STYLES.findIndex((s) => s.key === v);
  const other: CoachStyle = v === "calm" ? "no_excuses" : "calm";
  const label = STYLES[idx].label;
  return (
    <Shell>
      {top}
      <Heading
        eyebrow="Your coach"
        title={
          <>
            How should we
            <br />
            talk to you?
          </>
        }
        sub="Some people want a hug. Some want a push. Change it anytime."
      />
      <div className="m-rise" style={md(400)}>
        <div className="relative" style={{ margin: "26px 30px 0", height: 8, borderRadius: 4, background: "linear-gradient(90deg, var(--ember), var(--track) 50%, var(--ember))" }}>
          <span className="absolute" style={{ left: `calc(${idx * 50}% - 14px)`, top: -10, width: 28, height: 28, borderRadius: 999, background: "var(--bg)", border: "3px solid var(--ember)", transition: "left .3s cubic-bezier(.16,1,.3,1)" }} />
        </div>
        <div className="flex justify-between" style={{ margin: "12px 20px 0" }} role="radiogroup" aria-label="Coach style">
          {STYLES.map((s) => {
            const locked = teen && s.key === "no_excuses";
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={v === s.key}
                disabled={locked}
                className="press flex flex-col items-center gap-1"
                style={{ background: "none", border: 0, minWidth: 92, fontSize: 13, fontWeight: v === s.key ? 800 : 600, color: v === s.key ? "var(--ember)" : "var(--mute)", opacity: locked ? 0.4 : 1 }}
                onClick={() => onPick(s.key)}
              >
                <OnbIcon name={STYLE_ICON[s.key]} size={18} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-3" style={{ padding: "20px 20px 0" }}>
        <div className="m-fade" style={{ opacity: 0.45 }}>
          <CoachBubble label={STYLES.find((s) => s.key === other)!.label}>{SAMPLE[other]}</CoachBubble>
        </div>
        <div key={v} className="m-rise">
          <CoachBubble label={label}>{SAMPLE[v]}</CoachBubble>
        </div>
      </div>
      <div className="m-rise flex items-start gap-2.5" style={md(700, { margin: "16px 20px 0", fontSize: 13, lineHeight: 1.45, color: "var(--mute)" })}>
        <OnbIcon name="shield" size={18} />
        <span>Tough love is about your habits, never your body. No comments on looks, ever. Under 18? We keep it at Balanced.</span>
      </div>
      {err ? (
        <div style={{ padding: "10px 20px 0" }}>
          <ErrorNote text={err} />
        </div>
      ) : null}
      <Cta label={tune ? `Save: ${label}` : `Lock in ${label}`} busy={busy} onClick={onNext} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 12 buddy

function BuddyScreen({ top, initial, squadCode, onInvite, onLater, onSquad }: { top: React.ReactNode; initial: string; squadCode: string | null; onInvite: () => void; onLater: () => void; onSquad: (code: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(squadCode ?? "");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  return (
    <Shell>
      {top}
      <Heading
        eyebrow="Lock in together"
        title={
          <>
            Bring a buddy.
            <br />
            <span className="serif" style={{ color: "var(--ember)", fontSize: 38 }}>
              2× more likely
            </span>
            <br />
            to stick.
          </>
        }
      />
      <div className="m-rise flex items-center justify-between" style={md(450, { margin: "22px 20px 0", padding: 22, borderRadius: 24, background: "var(--surf)" })}>
        <div className="flex flex-col items-center gap-2">
          <span className="display grid place-items-center rounded-full" style={{ width: 64, height: 64, background: "var(--btn)", color: "var(--btn-ink)", fontSize: 24, fontWeight: 800 }}>
            {(initial.trim()[0] ?? "Y").toUpperCase()}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>You</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="flame-breathe" style={{ color: "var(--ember)" }}>
            <OnbIcon name="flame" size={34} stroke={1.6} />
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--mute)" }}>
            Shared streak
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="m-pop grid place-items-center rounded-full" style={md(900, { width: 64, height: 64, border: "2px dashed var(--mute)", color: "var(--mute)" })}>
            <OnbIcon name="plus" size={22} />
          </span>
          <span style={{ fontSize: 14, color: "var(--mute)" }}>Your buddy</span>
        </div>
      </div>
      <div className="m-rise flex gap-2.5" style={md(600, { margin: "12px 20px 0", padding: "14px 16px", borderRadius: 18, background: "var(--ember-bg)", color: "var(--ember)", fontSize: 14, lineHeight: 1.45, fontWeight: 600 })}>
        <OnbIcon name="bell" size={18} />
        <span>Both log = streak grows. One skips = the other gets to nudge. Break it and you both start over.</span>
      </div>
      <button type="button" className="m-rise press flex items-center gap-3.5 text-left" style={md(750, { margin: "12px 20px 0", padding: 16, borderRadius: 20, background: "var(--surf)", border: 0, color: "var(--ink)" })} onClick={() => setOpen(true)}>
        <span className="grid place-items-center rounded-full" style={{ width: 42, height: 42, background: "var(--surf2)", flex: "none" }}>
          <OnbIcon name="users" />
        </span>
        <span className="flex-1">
          <span className="block" style={{ fontSize: 16, fontWeight: 700 }}>
            {squadCode ? `Joining squad ${squadCode}` : "Or join a squad"}
          </span>
          <span className="block" style={{ fontSize: 13, color: "var(--mute)" }}>
            {squadCode ? "We'll take you there after you save." : "Got a 6-letter code? Your crew is waiting."}
          </span>
        </span>
        <OnbIcon name="chevron" size={18} style={{ color: "var(--mute)" }} />
      </button>
      <Cta label="Invite a buddy" onClick={onInvite} secondary={squadCode ? "Continue" : "I'll do it later"} onSecondary={onLater} />
      <BottomSheet
        open={open}
        title="Join your squad"
        subtitle="Type the 6-character code or paste the invite link. You'll join right after saving your plan."
        onClose={() => setOpen(false)}
        primary={{
          label: "Use this code",
          disabled: !code.trim(),
          onClick: () => {
            const raw = code.trim();
            const m = raw.match(/join\/([a-z0-9]{6})/i) ?? raw.replace(/[^a-z0-9]/gi, "").match(/^([a-z0-9]{6})$/i);
            if (!m) return setCodeErr("That doesn't look like a squad code.");
            onSquad(m[1].toUpperCase());
            setOpen(false);
          },
        }}
      >
        <input
          className="field"
          value={code}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="AB12CD"
          aria-label="Squad code"
          onChange={(e) => {
            setCode(e.target.value);
            setCodeErr(null);
          }}
        />
        <ErrorNote text={codeErr} />
      </BottomSheet>
    </Shell>
  );
}

// ---------------------------------------------------------------- 14 building

function BuildingScreen({ st, teen, onDone }: { st: OnbState; teen: boolean; onDone: () => void }) {
  const a = st.answers;
  const style = STYLES.find((s) => s.key === effectiveCoachStyle(a.coach_style, teen ? 15 : 30))!;
  const lines = [
    st.firstLog ? "Reading your first meal" : null,
    "Setting calories + protein",
    ...(a.obstacles ?? []).slice(0, 2).map((o) => (o === "mess_food" ? "Hostel-food swaps" : `Planning around ${OBSTACLES.find((x) => x.key === o)?.label.toLowerCase()}`)),
    `Loading your ${style.label} coach`,
    a.goal === "habits" || teen ? "Setting your daily rhythm" : "Pacing to your finish date",
  ].filter((x): x is string => !!x);
  const [pct, setPct] = useState(0);
  const cb = useRef(onDone);
  useEffect(() => {
    cb.current = onDone;
  });
  useEffect(() => {
    const start = performance.now();
    const total = 3400;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / total);
      setPct(Math.round(p * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
      else window.setTimeout(() => cb.current(), 450);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = 74;
  const c = 2 * Math.PI * r;
  return (
    <Shell>
      <div className="m-rise text-center" style={{ padding: "calc(70px + env(safe-area-inset-top, 0px)) 24px 0" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05 }}>Building your plan</h1>
        <div className="serif" style={{ fontSize: 30, color: "var(--ember)", marginTop: 4 }}>
          just for you…
        </div>
      </div>
      <div className="relative mx-auto grid place-items-center" style={{ width: 170, height: 170, marginTop: 30 }}>
        <svg width="170" height="170" viewBox="0 0 170 170" className="absolute -rotate-90" aria-hidden="true">
          <circle cx="85" cy="85" r={r} fill="none" strokeWidth="8" style={{ stroke: "var(--track)" }} />
          <circle cx="85" cy="85" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ stroke: "var(--ember)" }} />
        </svg>
        <span className="display num" style={{ fontSize: 44, fontWeight: 800 }} aria-live="polite">
          {pct}
          <span style={{ fontSize: 20 }}>%</span>
        </span>
      </div>
      <div className="mx-auto flex w-full flex-col gap-3" style={{ maxWidth: 320, padding: "34px 24px 0" }}>
        {lines.map((l, i) => {
          const on = pct >= ((i + 1) / (lines.length + 0.5)) * 100;
          return (
            <div key={l} className="flex items-center gap-3" style={{ opacity: on ? 1 : 0.35, transition: "opacity .4s ease" }}>
              <span className="grid place-items-center rounded-full" style={{ width: 22, height: 22, background: on ? "var(--ink)" : "var(--surf2)", color: "var(--bg)", flex: "none" }}>
                {on ? <OnbIcon name="check" size={12} stroke={3} /> : null}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{l}</span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- 15 reveal

function RevealScreen({ st, plan, onNext, onBack }: { st: OnbState; plan: OnbPlan | null; onNext: () => void; onBack: () => void }) {
  const a = st.answers;
  if (!plan)
    return (
      <Shell>
        <Heading eyebrow="One more thing" title="We need your height, weight, birthday and sex for the plan." />
        <Cta label="Go back" onClick={onBack} />
      </Shell>
    );
  const t = plan.targets;
  const dated = plan.goal_date && a.goal_weight_kg != null;
  const cells: [string, string][] = [
    [t.calories.toLocaleString("en-IN"), "KCAL"],
    [`${t.protein} g`, "PROTEIN"],
    [`${t.carbs} g`, "CARBS"],
    [`${t.fat} g`, "FAT"],
    [`${t.fiber} g`, "FIBRE"],
  ];
  const kg = a.weight_kg ?? 0;
  const goal = a.goal_weight_kg ?? kg;
  const down = goal < kg;
  return (
    <Shell>
      <div className="m-rise" style={{ padding: "calc(50px + env(safe-area-inset-top, 0px)) 22px 0" }}>
        <Eyebrow>Your plan is ready</Eyebrow>
        {dated ? (
          <>
            <div className="display" style={{ fontSize: 36, lineHeight: 1.05, fontWeight: 800, marginTop: 8 }}>
              {goal} kg by
            </div>
            <div className="serif" style={{ fontSize: 52, lineHeight: 1, color: "var(--ember)" }}>
              {prettyDate(plan.goal_date!)}
            </div>
          </>
        ) : (
          <>
            <div className="display" style={{ fontSize: 36, lineHeight: 1.05, fontWeight: 800, marginTop: 8 }}>
              Locked in from
            </div>
            <div className="serif" style={{ fontSize: 52, lineHeight: 1, color: "var(--ember)" }}>
              today
            </div>
          </>
        )}
      </div>
      {dated ? (
        <div className="m-rise" style={md(300, { margin: "16px 20px 0", padding: "14px 16px", borderRadius: 22, background: "var(--surf)" })}>
          <svg viewBox="0 0 330 120" width="100%" aria-hidden="true">
            <path d={down ? "M0,18 L55,34 L110,52 L165,68 L220,80 L275,88 L330,92 L330,120 L0,120 Z" : "M0,92 L55,88 L110,80 L165,68 L220,52 L275,34 L330,18 L330,120 L0,120 Z"} fillOpacity=".12" className="m-fade" style={{ fill: "var(--ember)", animationDelay: "2200ms" }} />
            <path d={down ? "M0,18 L55,34 L110,52 L165,68 L220,80 L275,88 L330,92" : "M0,92 L55,88 L110,80 L165,68 L220,52 L275,34 L330,18"} fill="none" strokeWidth="2.6" pathLength={1} className="m-draw" style={{ stroke: "var(--ember)", ["--len" as string]: 1, animationDelay: "900ms" } as React.CSSProperties} />
            {[0, 110, 220, 330].map((x, i) => (
              <circle key={x} cx={x} cy={down ? [18, 52, 80, 92][i] : [92, 80, 52, 18][i]} r="4" className="m-pop" style={{ fill: "var(--ember)", animationDelay: `${1200 + i * 500}ms` }} />
            ))}
          </svg>
          <div className="mono flex justify-between" style={{ fontSize: 10, color: "var(--mute)", marginTop: 6 }}>
            <span>Today · {kg} kg</span>
            <span>
              {prettyDate(plan.goal_date!, true)} · {goal} kg
            </span>
          </div>
        </div>
      ) : null}
      <div className="m-rise" style={md(500, { margin: "12px 20px 0", padding: 16, borderRadius: 22, background: "#0B0B0C", color: "#F4F1EA" })}>
        <div className="mono" style={{ fontSize: 11, color: "#8F8A82", marginBottom: 8 }}>
          Daily target
        </div>
        <div className="flex justify-between">
          {cells.map(([v, l]) => (
            <div key={l}>
              <div className="display num" style={{ fontSize: 20, fontWeight: 800 }}>
                {v}
              </div>
              <div className="mono" style={{ fontSize: 10, color: "#8F8A82" }}>
                {l}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="m-rise flex flex-col gap-2" style={md(700, { margin: "12px 20px 0" })}>
        {plan.reasons.map((r) => (
          <div key={r} className="flex gap-2.5" style={{ fontSize: 14.5, lineHeight: 1.4 }}>
            <span style={{ color: "var(--ember)" }}>✓</span>
            <span>
              <Bolded text={r} />
            </span>
          </div>
        ))}
      </div>
      <Cta label="Make this plan mine" onClick={onNext} secondary={plan.honest} />
    </Shell>
  );
}

// ---------------------------------------------------------------- 16 pledge

function PledgeScreen({ plan, goalWeight, onDone, onBack }: { plan: OnbPlan | null; goalWeight: number | null; onDone: () => void; onBack: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const done = useRef(false);
  const HOLD = 1500;
  const third = plan?.goal_date && goalWeight != null ? `${goalWeight} kg by ${prettyDate(plan.goal_date, true)}.` : "Every day, not every Monday.";

  function begin() {
    if (done.current) return;
    start.current = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - start.current) / HOLD);
      setP(f);
      if (f >= 1) {
        done.current = true;
        try {
          navigator.vibrate?.([30, 40, 60]);
        } catch {
          // no vibration API
        }
        window.setTimeout(onDone, 350);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }
  function end() {
    if (done.current) return;
    cancelAnimationFrame(raf.current);
    setP(0);
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const r = 58;
  const c = 2 * Math.PI * r;
  const lines: [string, string][] = [
    ["Log every day.", "Even the bad ones."],
    ["Show up when week 3", "slows down."],
    [third, "Locked in."],
  ];

  return (
    <Shell dark>
      <div className="flex items-center justify-between" style={{ padding: "calc(20px + env(safe-area-inset-top, 0px)) 20px 0" }}>
        <button type="button" aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "#141416", border: 0, color: "#F4F1EA" }} onClick={onBack}>
          <OnbIcon name="back" size={18} stroke={2} />
        </button>
      </div>
      <div className="m-rise" style={{ padding: "30px 26px 0" }}>
        <Eyebrow color="#8F8A82">The pledge</Eyebrow>
      </div>
      <div className="flex flex-col gap-[22px]" style={{ padding: "20px 26px 0" }}>
        {lines.map(([a, b], i) => (
          <div key={i} className="m-rise flex items-baseline gap-4" style={md(500 + i * 250)}>
            <span className="mono" style={{ fontSize: 13, color: "#8F8A82" }}>
              0{i + 1}
            </span>
            <span className="display" style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-.5px", lineHeight: 1.2 }}>
              {a}{" "}
              <span className="serif" style={{ color: "#FF5B1F", fontSize: 25 }}>
                {b}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="m-fade mt-auto flex flex-col items-center gap-3.5" style={md(1200, { paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))", paddingTop: 40 })}>
        <button
          type="button"
          aria-label="Hold to lock in"
          className="relative select-none"
          style={{ width: 132, height: 132, border: 0, background: "none", touchAction: "none", WebkitTouchCallout: "none" }}
          onPointerDown={begin}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) begin();
          }}
          onKeyUp={end}
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg viewBox="0 0 132 132" width="132" height="132" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
            <circle cx="66" cy="66" r={r} fill="none" stroke="#FF5B1F" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
          </svg>
          <span className="absolute grid place-items-center rounded-full" style={{ inset: 14, background: "#FF5B1F", color: "#fff", transform: `scale(${1 - p * 0.06})`, transition: "transform .1s linear" }}>
            <span className={p > 0 ? "" : "m-float"}>
              <OnbIcon name="lock" size={38} stroke={1.8} />
            </span>
          </span>
        </button>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Hold to lock in</span>
        <span style={{ fontSize: 13, color: "#8F8A82" }}>Only when you mean it.</span>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- 17 save

function SaveScreen({ st, plan, signedIn, busy, err, onSaveSignedIn, onName }: { st: OnbState; plan: OnbPlan | null; signedIn: boolean; busy: boolean; err: string | null; onSaveSignedIn: () => void; onName: (n: string) => void }) {
  const router = useRouter();
  const a = st.answers;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(a.name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [working, setWorking] = useState(false);
  const style = STYLES.find((s) => s.key === effectiveCoachStyle(a.coach_style, isTeen(ageYears(a.dob ?? null)) ? 15 : 30))!;
  const planText = plan?.goal_date && a.goal_weight_kg != null ? `${a.goal_weight_kg} kg by ${prettyDate(plan.goal_date, true)}` : plan ? `${plan.targets.calories.toLocaleString("en-IN")} kcal · ${plan.targets.protein} g protein` : "Ready";

  async function signUp() {
    setWorking(true);
    setMsg(null);
    const nm = name.trim().slice(0, 40) || nameFromEmail(email);
    onName(nm);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: nm } } });
    if (error) {
      setWorking(false);
      return setMsg(/registered|already/i.test(error.message) ? "That email already has an account. Sign in and your plan saves automatically." : error.message);
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setWorking(false);
      setPending(true);
      return;
    }
    // Signed in: /start re-renders signed in, sees the finished plan on this device and saves it.
    setOpen(false);
    router.refresh();
  }

  const rows: [string, string, boolean][] = [
    ["Plan", planText, false],
    ["Streak", "Day 1", true],
    ["Coach", style.label, false],
    ["Pro", "Free for beta testers", true],
  ];

  return (
    <Shell>
      <div className="grid place-items-center" style={{ paddingTop: "calc(90px + env(safe-area-inset-top, 0px))" }}>
        <div className="m-pop" style={md(300)}>
          <Padlock size={108} title="Locked In" />
        </div>
      </div>
      <div className="m-rise text-center" style={md(400, { padding: "26px 24px 0" })}>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-1.5px" }}>You&apos;re locked in.</h1>
        <p style={{ fontSize: 16, color: "var(--mute)", marginTop: 10, lineHeight: 1.5 }}>Save your plan to keep your streak, your coach and your squad.</p>
      </div>
      <div className="m-rise flex flex-col gap-3" style={md(600, { margin: "30px 20px 0", padding: 18, borderRadius: 22, background: "var(--surf)", fontSize: 15 })}>
        {rows.map(([k, v, ember]) => (
          <div key={k} className="flex justify-between gap-3">
            <span>{k}</span>
            <b style={{ color: ember ? "var(--ember)" : "var(--ink)" }}>{v}</b>
          </div>
        ))}
      </div>
      {err ? (
        <div style={{ padding: "12px 20px 0" }}>
          <ErrorNote text={err} />
        </div>
      ) : null}
      {signedIn ? (
        <Cta label="Save my plan" busy={busy} onClick={onSaveSignedIn} />
      ) : (
        <Cta label="Save with email" onClick={() => setOpen(true)} secondary="Takes 20 seconds. No spam, ever." />
      )}
      {!signedIn ? (
        <p className="pb-6 text-center" style={{ fontSize: 13.5, color: "var(--mute)" }}>
          Already have an account?{" "}
          <a href="/login?next=/start" className="font-semibold" style={{ color: "var(--ink)" }}>
            Sign in
          </a>
        </p>
      ) : null}
      <BottomSheet
        open={open}
        title={pending ? "Check your inbox" : "Save your plan"}
        subtitle={pending ? `We sent a link to ${email}. Confirm it, then sign in: your plan, first meal and streak are saved on this phone and move over automatically.` : "Your email and a password. That's it."}
        onClose={() => setOpen(false)}
        primary={
          pending
            ? { label: "I've confirmed, sign in", onClick: () => router.push("/login?next=/start") }
            : { label: working ? "Saving…" : "Create account", disabled: working || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6, onClick: () => void signUp() }
        }
      >
        {pending ? null : (
          <div className="flex flex-col gap-2.5 pb-1">
            <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" autoComplete="new-password" placeholder="Password (6+ characters)" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <input className="field" autoComplete="given-name" placeholder="What your squad calls you (optional)" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <ErrorNote text={msg} />
          </div>
        )}
      </BottomSheet>
    </Shell>
  );
}
