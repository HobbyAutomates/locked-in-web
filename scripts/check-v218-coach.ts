/**
 * `npx tsx scripts/check-v218-coach.ts` — offline checks for the v2.18 coach stream (areas B + C,
 * schema_v43): check-in adjustments and recovery, supplements streaks, consistency score, plateau
 * detective, festival mode, cycle phases, weekly plan, the Hindi / English "why", Indian fasting
 * windows, home workout templates, sports burn, the form-check rep counter and voice text.
 */
import assert from "node:assert/strict";
import { MAX_DAY_BUMP, checkinAdjust, cleanCheckin, hrScore, recoveryScore, toneLine, trainedInRow } from "../src/lib/v218/checkin";
import { allTakenStreak, cleanSupplement, doseText, dueNow, matchSupplement, streak } from "../src/lib/v218/supplements";
import { consistencyScore, consistencyLabel, type DayFacts } from "../src/lib/v218/consistency";
import { detectPlateau, plateauCauses, type PlateauDay } from "../src/lib/v218/plateau";
import { activeMode, cleanMode, festivalLine, maintenanceBump, protectedDates, upcomingMode, type FestivalMode } from "../src/lib/v218/festival";
import { cleanCycle, cycleDay } from "../src/lib/v218/cycle";
import { fallbackReview, reviewWeek, weekPlan, type WeekFacts } from "../src/lib/v218/weekly";
import { targetsWhy } from "../src/lib/v218/targetsWhy";
import { PRESETS, presetWindow, startPlan, sunTimes } from "../src/lib/v218/fastingPresets";
import { HOME_TEMPLATES } from "../src/lib/v218/homeWorkouts";
import { SPORTS, sportKcal, stepsBurn, strideM } from "../src/lib/v218/sports";
import { angle, measure, newRepState, step, summary, type Landmark } from "../src/lib/v218/formCheck";
import { isStopPhrase, pickVoiceName, speakable } from "../src/lib/v218/voice";
import { missingV43, mondayOfIso, plusDays, weekdayOf } from "../src/lib/v218/schema";
import { EXERCISES } from "../src/lib/exercises";
import { EXERCISE_MUSCLES } from "../src/lib/muscles";
import { clampHours } from "../src/lib/fasting";

// ---- schema helpers
assert.equal(missingV43({ code: "42P01", message: "relation does not exist" }), true);
assert.equal(missingV43({ message: 'Could not find the table "bandlog.supplements" in the schema cache' }), true);
assert.equal(missingV43({ message: "duplicate key value" }), false);
assert.equal(missingV43(null), false);
assert.equal(plusDays("2026-09-29", 3), "2026-10-02");
assert.equal(weekdayOf("2026-09-29"), 2); // a Tuesday
assert.equal(mondayOfIso("2026-10-04"), "2026-09-28");

// ---- B4 check-in: clean, adjust (only ever up, capped, never for teens / non-cutters), tone
assert.equal(cleanCheckin({}, "2026-09-29"), null);
assert.deepEqual(cleanCheckin({ sleep_hours: 6.3, stress: 9, mood: 0 }, "2026-09-29"), { date: "2026-09-29", sleep_hours: 6.5, sleep_quality: null, stress: 5, mood: 1, resting_hr: null });
const bad = cleanCheckin({ sleep_hours: 5, stress: 5, mood: 1 }, "d")!;
const a1 = checkinAdjust(bad, "lose");
assert.equal(a1.kcal, 175 > MAX_DAY_BUMP ? MAX_DAY_BUMP : 175);
assert.equal(a1.kcal, 150);
assert.equal(a1.tone, "gentle");
assert.match(a1.training, /Recovery day/);
assert.equal(checkinAdjust(bad, "lose", true).kcal, 0); // teen: never a deficit to soften
assert.equal(checkinAdjust(bad, "gain").kcal, 0);
assert.equal(checkinAdjust(bad, "maintain").kcal, 0);
const good = cleanCheckin({ sleep_hours: 8, sleep_quality: 5, stress: 1, mood: 4 }, "d")!;
assert.equal(checkinAdjust(good, "lose").kcal, 0);
assert.equal(checkinAdjust(good, "lose").tone, "push");
assert.equal(checkinAdjust(null, "lose").kcal, 0);
assert.equal(toneLine(checkinAdjust(null, "lose")), "");
assert.match(toneLine(a1), /gentler/);
assert.equal(checkinAdjust(cleanCheckin({ sleep_hours: 5.5 }, "d"), "lose").kcal, 100);

// ---- B8 recovery
assert.equal(hrScore(60, 60), 100);
assert.equal(hrScore(70, 60), 30);
assert.equal(hrScore(63, 60), 79);
assert.equal(recoveryScore({}), null);
const r1 = recoveryScore({ sleepHours: 8, sleepQuality: 5, stress: 1, mood: 5 })!;
assert.equal(r1.band, "push");
assert.equal(r1.score, 100);
const r2 = recoveryScore({ sleepHours: 4, stress: 5, mood: 1 })!;
assert.equal(r2.band, "deload");
assert.equal(recoveryScore({ sleepHours: 7, stress: 3, mood: 3 })!.band, "normal");
assert.equal(recoveryScore({ sleepHours: 8, sleepQuality: 5, stress: 1, mood: 5, trainedDaysInRow: 4 })!.score, 90);
assert.equal(recoveryScore({ sleepHours: 7, restingHr: 72, baselineHr: 60, hcSleep: true })!.source, "health_connect");
assert.equal(trainedInRow(["2026-09-28", "2026-09-27", "2026-09-25"], "2026-09-29"), 2);
assert.equal(trainedInRow(["2026-09-29"], "2026-09-29"), 0);

// ---- B7 supplements
assert.equal(cleanSupplement({ name: "x" }).ok, false);
assert.equal(cleanSupplement({ kind: "creatine", dose: "-1" }).ok, false);
assert.equal(cleanSupplement({ kind: "creatine", remind_at: "25:00" }).ok, false);
const cs = cleanSupplement({ kind: "creatine", dose: "5", remind_at: "08:30" });
assert.ok(cs.ok && cs.value.name === "Creatine" && cs.value.unit === "g" && cs.value.dose === 5);
assert.equal(doseText({ dose: 2, unit: "capsule" }), "2 capsules");
assert.equal(doseText({ dose: 1, unit: "scoop" }), "1 scoop");
assert.equal(doseText({ dose: null, unit: "g" }), "");
assert.deepEqual(streak(["2026-09-27", "2026-09-28"], "2026-09-29"), { current: 2, best: 2, takenToday: false });
assert.deepEqual(streak(["2026-09-27", "2026-09-28", "2026-09-29"], "2026-09-29"), { current: 3, best: 3, takenToday: true });
assert.deepEqual(streak(["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-28"], "2026-09-29"), { current: 1, best: 3, takenToday: false });
assert.deepEqual(streak([], "2026-09-29"), { current: 0, best: 0, takenToday: false });
const logs = [
  { supplement_id: "a", date: "2026-09-28" },
  { supplement_id: "b", date: "2026-09-28" },
  { supplement_id: "a", date: "2026-09-27" },
];
assert.equal(allTakenStreak([{ id: "a" }, { id: "b" }], logs, "2026-09-29"), 1);
assert.equal(allTakenStreak([], logs, "2026-09-29"), 0);
const sup = { id: "s", name: "Creatine", kind: "creatine" as const, dose: 5, unit: "g", remind_at: "08:00", active: true };
assert.equal(dueNow(sup, false, 8 * 60 + 1), true);
assert.equal(dueNow(sup, true, 9 * 60), false);
assert.equal(dueNow(sup, false, 7 * 60), false);
assert.equal(matchSupplement([sup, { id: "w", name: "Whey protein", kind: "whey" }], "took my creatine"), "s");
assert.equal(matchSupplement([sup, { id: "w", name: "Whey protein", kind: "whey" }], "had a protein shake"), "w");
assert.equal(matchSupplement([sup], "vitamin d"), null);

// ---- B11 consistency
const days = (n: number, f: (i: number) => Partial<DayFacts>): DayFacts[] => Array.from({ length: n }, (_, i) => ({ date: plusDays("2026-09-16", i), logged: false, protein: 0, trained: false, sleepHours: null, sleepQuality: null, ...f(i) }));
const perfect = consistencyScore(days(14, (i) => ({ logged: true, protein: 130, trained: i % 2 === 0, sleepHours: 8 })), { protein: 120, workoutsPerWeek: 3 });
assert.equal(perfect.score, 100);
assert.equal(perfect.parts.length, 4);
assert.equal(perfect.label, "Locked in");
const nothing = consistencyScore(days(14, () => ({})), { protein: 120, workoutsPerWeek: 3 });
assert.equal(nothing.score, 0);
assert.equal(nothing.parts.length, 3); // no check-ins → sleep isn't counted against you
const half = consistencyScore(days(14, (i) => ({ logged: i < 7, protein: 130 })), { protein: 120, workoutsPerWeek: 3 });
assert.equal(half.score, Math.round((50 * 35 + 50 * 25 + 0 * 25) / 85));
assert.equal(half.weakest, "Training");
assert.equal(consistencyLabel(59), "Wobbly");
assert.equal(consistencyLabel(39), "Restarting");

// ---- B5 plateau
const flatWeights = Array.from({ length: 21 }, (_, i) => ({ date: plusDays("2026-09-09", i), kg: 80 + (i % 2 ? 0.2 : -0.2) }));
const pd = (f: (d: string, i: number) => Partial<PlateauDay>): PlateauDay[] => Array.from({ length: 14 }, (_, i) => ({ date: plusDays("2026-09-16", i), kcal: 2000, water: 2500, sodiumMg: 1800, ...f(plusDays("2026-09-16", i), i) }));
const flat = detectPlateau({ goal: "lose", weighIns: flatWeights, days: pd(() => ({})), target: 2000, asOf: "2026-09-29" });
assert.ok(flat.flat);
if (flat.flat) assert.equal(flat.top.key, "none");
const losing = Array.from({ length: 21 }, (_, i) => ({ date: plusDays("2026-09-09", i), kg: 82 - i * 0.1 }));
assert.equal(detectPlateau({ goal: "lose", weighIns: losing, days: pd(() => ({})), target: 2000, asOf: "2026-09-29" }).flat, false);
assert.equal(detectPlateau({ goal: "maintain", weighIns: flatWeights, days: pd(() => ({})), target: 2000, asOf: "2026-09-29" }).flat, false);
assert.equal(detectPlateau({ goal: "lose", weighIns: flatWeights.slice(-3), days: pd(() => ({})), target: 2000, asOf: "2026-09-29" }).flat, false);
const gaps = plateauCauses(pd((_, i) => ({ kcal: i < 6 ? 2000 : null })), 2000);
assert.equal(gaps[0].key, "gaps");
const weekend = plateauCauses(pd((d) => ({ kcal: [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) ? 2900 : 1900 })), 2000);
assert.equal(weekend[0].key, "weekends");
const salty = plateauCauses(pd(() => ({ sodiumMg: 3500 })), 2000);
assert.equal(salty[0].key, "sodium");
const dry = plateauCauses(pd(() => ({ water: 1200 })), 2000);
assert.equal(dry[0].key, "water");

// ---- B9 festival
const today = "2026-10-15";
assert.equal(cleanMode({ start_date: "2026-10-20", end_date: "2026-10-19" }, today).ok, false);
assert.equal(cleanMode({ start_date: "2026-10-01", end_date: "2026-10-30" }, today).ok, false);
assert.equal(cleanMode({ start_date: "2026-10-01", end_date: "2026-10-05" }, today).ok, false);
const cm = cleanMode({ kind: "diwali", start_date: "2026-10-17", end_date: "2026-10-21" }, today);
assert.ok(cm.ok && cm.value.name === "Diwali");
const modes: FestivalMode[] = [{ id: "1", kind: "diwali", name: "Diwali", start_date: "2026-10-17", end_date: "2026-10-21" }];
assert.equal(activeMode(modes, "2026-10-18")?.name, "Diwali");
assert.equal(activeMode(modes, today), null);
assert.deepEqual(upcomingMode(modes, today)?.inDays, 2);
assert.equal(upcomingMode(modes, "2026-10-10"), null);
assert.deepEqual(protectedDates(modes, "2026-10-19"), ["2026-10-17", "2026-10-18", "2026-10-19"]);
assert.equal(maintenanceBump(1800, 2350), 550);
assert.equal(maintenanceBump(2800, 2350), 0);
assert.equal(maintenanceBump(1800, null), 0);
assert.match(festivalLine(modes, today)!, /starts in 2 days/);
assert.match(festivalLine(modes, "2026-10-18")!, /mode is on/);
assert.equal(festivalLine(modes, "2026-11-30"), null);

// ---- B6 cycle
const cyc = cleanCycle({ enabled: true, last_period_start: "2026-09-01", cycle_length: 28, period_length: 5 });
assert.equal(cycleDay(cyc, "2026-09-01")!.phase, "menstrual");
assert.equal(cycleDay(cyc, "2026-09-08")!.phase, "follicular");
assert.equal(cycleDay(cyc, "2026-09-14")!.phase, "ovulation"); // day 14
assert.equal(cycleDay(cyc, "2026-09-22")!.phase, "luteal");
assert.equal(cycleDay(cyc, "2026-09-29")!.day, 1); // next cycle
assert.equal(cycleDay(cyc, "2026-08-30"), null);
assert.equal(cycleDay({ ...cyc, enabled: false }, "2026-09-10"), null);
assert.equal(cleanCycle({ cycle_length: 99, period_length: 0 }).cycle_length, 40);
assert.equal(cleanCycle({ cycle_length: 99, period_length: 0 }).period_length, 2);

// ---- B2 weekly
const wf: WeekFacts = { weekStart: "2026-09-21", loggedDays: 7, avgKcal: 2000, kcalTarget: 2000, avgProtein: 125, proteinTarget: 120, proteinDays: 6, workouts: 3, workoutTarget: 3, avgSleep: 7.5, checkins: 5, weightChange: -0.4, goal: "lose" };
assert.equal(weekPlan(wf).focus, "keep");
assert.equal(weekPlan({ ...wf, loggedDays: 3 }).focus, "logging");
assert.equal(weekPlan({ ...wf, proteinDays: 2, avgProtein: 90 }).focus, "protein");
assert.equal(weekPlan({ ...wf, workouts: 1 }).focus, "training");
assert.equal(weekPlan({ ...wf, avgSleep: 6.1 }).focus, "sleep");
assert.equal(weekPlan({ ...wf, avgKcal: 2400 }).focus, "calories");
assert.match(fallbackReview(wf, weekPlan(wf)), /7\/7 days logged/);
assert.equal(reviewWeek("2026-09-29", 600), "2026-09-21"); // Tuesday: last week
assert.equal(reviewWeek("2026-10-04", 17 * 60), "2026-09-28"); // Sunday 5 pm: this week
assert.equal(reviewWeek("2026-10-04", 9 * 60), "2026-09-21");

// ---- B3 why
const down = targetsWhy({ oldTarget: 2200, newTarget: 2090, trendKgPerWeek: -0.1, goalRateKgPerWeek: -0.5, avgKcal: 2180 });
assert.equal(down.direction, "down");
assert.equal(down.en.length, down.hi.length);
assert.match(down.en.join(" "), /trimming 110 kcal/);
assert.match(down.hi.join(" "), /कम कर रहे हैं/);
assert.equal(targetsWhy({ oldTarget: 2000, newTarget: 2000, trendKgPerWeek: -0.5, goalRateKgPerWeek: -0.5, avgKcal: 2000 }).direction, "same");
assert.match(targetsWhy({ oldTarget: 2000, newTarget: 2150, trendKgPerWeek: -0.9, goalRateKgPerWeek: -0.5, avgKcal: 2000 }).en.join(" "), /adding 150 kcal/);

// ---- B10 fasting presets: Delhi sunrise ~6:20 / sunset ~18:05 around the equinox; Ekadashi ~24 h
const delhi = sunTimes("2026-09-23", 28.61, 77.21);
assert.ok(Math.abs(delhi.sunrise - (6 * 60 + 12)) <= 12, `sunrise ${delhi.sunrise}`);
assert.ok(Math.abs(delhi.sunset - (18 * 60 + 17)) <= 12, `sunset ${delhi.sunset}`);
const summer = sunTimes("2026-06-21", 28.61, 77.21);
assert.ok(summer.sunset - summer.sunrise > 13 * 60 && summer.sunset - summer.sunrise < 14.5 * 60);
for (const p of PRESETS) {
  const w = presetWindow(p, "2026-09-23");
  assert.ok(w.hours >= 10 && w.hours <= 26, `${p.key} ${w.hours}`);
  assert.equal(clampHours(w.hours), w.hours);
}
const ek = presetWindow(PRESETS.find((p) => p.key === "ekadashi")!, "2026-09-23");
assert.ok(Math.abs(ek.hours - 24) <= 0.5);
const ram = presetWindow(PRESETS.find((p) => p.key === "ramadan")!, "2026-09-23");
assert.ok(ram.sehri && ram.iftar);
assert.deepEqual(startPlan({ startMin: 360, endMin: 1080, hours: 12, label: "" }, 600), { backdateMin: 240, hours: 12 });
assert.deepEqual(startPlan({ startMin: 360, endMin: 1080, hours: 12, label: "" }, 1200), { backdateMin: 0, hours: 12 });

// ---- C1 home workouts: every exercise is in the library and mapped to muscles
const lib = new Set(EXERCISES.map((e) => e.name));
for (const t of HOME_TEMPLATES) for (const d of t.days) for (const x of d.exercises) {
  assert.ok(lib.has(x.name), `${t.key}: ${x.name} not in the library`);
  assert.ok(EXERCISE_MUSCLES[x.name], `${x.name} not mapped`);
  assert.ok(x.muscles.length > 0, `${x.name} has no primary muscles`);
}
assert.equal(HOME_TEMPLATES.length, 4);
assert.ok(HOME_TEMPLATES.some((t) => t.equipment === "band" && t.level === "beginner"));
assert.ok(HOME_TEMPLATES.some((t) => t.equipment === "none" && t.level === "intermediate"));
assert.ok(HOME_TEMPLATES.filter((t) => t.equipment === "none").every((t) => t.days.every((d) => d.exercises.every((x) => !x.name.startsWith("Band")))));

// ---- C3 sports
assert.deepEqual(SPORTS.map((s) => s.key), ["cricket", "football", "badminton", "kabaddi"]);
assert.equal(sportKcal(7, 70, 60), 490);
assert.equal(sportKcal(4.8, null, 60), 288); // default 60 kg
assert.equal(strideM(175), 0.73);
assert.equal(strideM(null), 0.72);
const sb = stepsBurn(10000, { weightKg: 70, heightCm: 175, pace: "brisk" });
assert.equal(sb.km, 7.3);
assert.equal(sb.minutes, 91);
assert.equal(sb.kcal, Math.round(((4.3 - 1) * 70 * 91) / 60 * 10) / 10);

// ---- C2 form check: angle maths and a synthetic squat set
assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);
assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })), 180);
function pose(knee: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  const hip = { x: 0.5, y: 0.5, visibility: 0.99 };
  const k = { x: 0.5, y: 0.7, visibility: 0.99 };
  const rad = ((180 - knee) * Math.PI) / 180;
  const ankle = { x: 0.5 + Math.sin(rad) * 0.2, y: 0.7 + Math.cos(rad) * 0.2, visibility: 0.99 };
  lm[11] = { x: 0.5, y: 0.2, visibility: 0.99 };
  lm[23] = hip;
  lm[25] = k;
  lm[27] = ankle;
  return lm;
}
assert.ok(Math.abs(measure("squat", pose(90))!.main - 90) < 0.5);
let s = newRepState("squat");
let t = 0;
const frames = (angles: number[]) => {
  for (const a of angles) s = step(s, measure("squat", pose(a)), (t += 100));
};
for (let rep = 0; rep < 3; rep++) frames([170, 150, 120, 100, 85, 85, 85, 100, 130, 160, 172, 172, 172, 172, 172]);
assert.equal(s.reps, 3);
assert.equal(s.goodReps, 3);
frames([170, 150, 125, 108, 108, 108, 108, 125, 150, 170, 172, 172, 172, 172]); // shallow
assert.equal(s.reps, 4);
assert.equal(s.last, "depth");
const sum = summary(s);
assert.equal(sum.reps, 4);
assert.equal(sum.clean, 75);
assert.equal(step(s, null, t).reps, 4); // no pose → no change
assert.equal(measure("squat", []), null);

// ---- B1 voice
assert.equal(speakable("**120 g** protein left 💪 · 450 kcal"), "120 grams protein left, 450 calories");
assert.equal(speakable("2,000 → 2,100 kcal"), "2,000 to 2,100 calories");
assert.equal(isStopPhrase("Stop"), true);
assert.equal(isStopPhrase("bas karo"), true);
assert.equal(isStopPhrase("stop eating sugar?"), false);
assert.equal(pickVoiceName([{ name: "A", lang: "en-US" }, { name: "B", lang: "en-IN" }], "en-IN"), "B");
assert.equal(pickVoiceName([{ name: "A", lang: "en-US" }], "hi-IN"), null);
assert.equal(pickVoiceName([{ name: "A", lang: "hi_IN" }], "hi-IN"), "A");

console.log("check-v218-coach: all good");
