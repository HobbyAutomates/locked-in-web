import type { GoalType, Profile } from "./types";
import { ageMonths, bmi, bmiForAgeZ, healthyRange } from "./bmi";

/**
 * "Auto Generate Goals", v2.10 science pass (see LockedIn-backups/science-spec.md).
 *
 * Adults (18+): Mifflin-St Jeor BMR × a standard PAL band from workouts per week, then the
 * lose / maintain / gain intent at a pace capped to a safe share of body weight, never below
 * max(85 % of BMR, 1200 female / 1500 male). Protein by the ISSN / ICMR-NIN rule, fat 25 % of
 * calories, carbs take the remainder.
 *
 * Under 18: no deficit, ever. Energy comes from the teen EER (IOM 2005 interim coefficients) with
 * a small surplus for "gain"; protein from the ICMR-NIN 2020 adolescent table. A saved "lose" goal
 * is treated as maintain (see migrateTeenGoal).
 *
 * Every function here is pure, so scripts/check-goals.ts runs the spec's test vectors against it.
 * Android's util/Goals.kt is a line-for-line port — same maths, same numbers.
 */

export type Targets = { calories: number; protein: number; carbs: number; fat: number };
type Sex = Profile["gender"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** One decimal, dropping ".0" (the same as ui.fmt and Android's fmt). */
const one = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Today as yyyy-MM-dd in the device's zone. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole years on `today`, or null. */
export function ageYears(dob: string | null | undefined, today: string = todayIso()): number | null {
  const m = ageMonths(dob, today);
  if (m == null) return null;
  const y = Math.floor(m / 12);
  return y >= 1 && y <= 120 ? y : null;
}

export const ADULT_AGE = 18;
/** Under 18: the growing-body rules apply (no deficit, teen EER, ICMR-NIN adolescent protein). */
export const isTeen = (age: number | null | undefined): boolean => age != null && age < ADULT_AGE;

/** Human-readable list of what Personal details is still missing; empty means `generate` works. */
export function missing(p: Profile): string[] {
  const out: string[] = [];
  if (p.weight_kg == null || p.weight_kg <= 0) out.push("current weight");
  if (p.height_cm == null || p.height_cm <= 0) out.push("height");
  if (ageYears(p.dob) == null) out.push("date of birth");
  if (!p.gender) out.push("gender");
  return out;
}

// ---------------------------------------------------------------- goal choices by age

export type GoalOption = { key: GoalType; label: string; sub: string };

export const TEEN_GOAL_NOTE = "At your age your body is still growing. Talk to a doctor or dietitian before trying to lose weight.";

/** What the goal picker offers. Under 18 there is no "lose". */
export function goalOptions(age: number | null | undefined): GoalOption[] {
  if (isTeen(age))
    return [
      { key: "maintain", label: "Maintain / grow stronger", sub: "Fuel for growing, training and school" },
      { key: "gain", label: "Gain / build muscle", sub: "A small extra on top of what you need to grow" },
    ];
  return [
    { key: "lose", label: "Lose weight", sub: "At a pace that keeps your muscle" },
    { key: "maintain", label: "Maintain", sub: "Stay where you are, feel stronger" },
    { key: "gain", label: "Gain weight", sub: "Lean gains, slow and steady" },
  ];
}

/** The goal the maths actually uses: a teen's saved "lose" counts as maintain. */
export function effectiveGoal(goal: GoalType, age: number | null | undefined): GoalType {
  return isTeen(age) && goal === "lose" ? "maintain" : goal;
}

/** True when this profile is an under-18 account still holding a "lose" goal. */
export function needsTeenMigration(p: Profile, today: string = todayIso()): boolean {
  return isTeen(ageYears(p.dob, today)) && p.goal_type === "lose";
}

/**
 * v2.10 one-time migration: an under-18 "lose" goal becomes maintain with fresh targets. Nothing
 * else changes (goal weight, pace and history stay as they were). Null when nothing to migrate.
 */
export function migrateTeenGoal(p: Profile, today: string = todayIso()): Profile | null {
  if (!needsTeenMigration(p, today)) return null;
  return applyTo({ ...p, goal_type: "maintain" }, today);
}

export const TEEN_MIGRATION_TITLE = "We switched your goal to maintain";
export const TEEN_MIGRATION_BODY =
  "Under 18, your body is still growing, so Locked In doesn't set weight-loss targets anymore. Your calories now fuel growth and training. Your logs, weights and history are all still here. Talk to a doctor or dietitian if weight is on your mind.";

// ---------------------------------------------------------------- energy

export type PalBand = { key: "sedentary" | "light" | "moderate" | "very"; factor: number; label: string };

/**
 * Standard PAL bands (FAO/WHO/UNU 1985) from workouts per week: 0 → 1.2, 1–2 → 1.375,
 * 3–5 → 1.55, 6+ → 1.725. "Extra active" (1.9) needs a physical job, which the app doesn't ask.
 */
export function adultPal(workoutsPerWeek: number): PalBand {
  const w = Math.max(0, Math.round(workoutsPerWeek || 0));
  if (w === 0) return { key: "sedentary", factor: 1.2, label: "Sedentary" };
  if (w <= 2) return { key: "light", factor: 1.375, label: "Lightly active" };
  if (w <= 5) return { key: "moderate", factor: 1.55, label: "Moderately active" };
  return { key: "very", factor: 1.725, label: "Very active" };
}

/** Mifflin-St Jeor (1990). "other" uses the midpoint of the two sex constants — an approximation. */
export function mifflinBmr(kg: number, cm: number, age: number, sex: Sex): number {
  const s = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return 10 * kg + 6.25 * cm - 5 * age + s;
}

/** IOM 2005 physical-activity coefficients for 9–18 y, same workout buckets as adultPal. */
function teenPaCoefficient(workoutsPerWeek: number, boy: boolean): number {
  const w = Math.max(0, Math.round(workoutsPerWeek || 0));
  const i = w === 0 ? 0 : w <= 2 ? 1 : w <= 5 ? 2 : 3;
  return (boy ? [1.0, 1.13, 1.26, 1.42] : [1.0, 1.16, 1.31, 1.56])[i];
}

/**
 * Teen Estimated Energy Requirement, kcal/day, including the 25 kcal/day growth allowance.
 * TODO(NASEM 2023): these are the interim IOM 2005 coefficients; swap in NASEM 2023 DRI for Energy
 * Table 5-15 once transcribed from the report (nationalacademies.org/read/26818/chapter/7). Keep
 * Android's Goals.kt in step.
 */
export function teenEer(kg: number, cm: number, age: number, sex: Sex, workoutsPerWeek: number): number {
  const m = cm / 100;
  const boy = 88.5 - 61.9 * age + teenPaCoefficient(workoutsPerWeek, true) * (26.7 * kg + 903 * m) + 25;
  const girl = 135.3 - 30.8 * age + teenPaCoefficient(workoutsPerWeek, false) * (10.0 * kg + 934 * m) + 25;
  return sex === "male" ? boy : sex === "female" ? girl : (boy + girl) / 2;
}

/** Teen "gain": a small surplus on top of EER — 10 % of EER, never more than 300 kcal. */
export function teenGainSurplus(eer: number): number {
  return Math.min(eer * 0.1, 300);
}

// ---------------------------------------------------------------- safe pace and floors

/** 1 kg of body mass ≈ 7700 kcal. */
export const KCAL_PER_KG = 7700;

/** Loss: 1 % of body weight a week, at least 0.25, never more than 1.0 kg/week. */
export function maxSafeWeeklyLossKg(kg: number): number {
  return clamp(kg * 0.01, 0.25, 1.0);
}

/** Lean gain: 0.5 % of body weight a week, 0.1–0.5 kg/week. */
export function maxSafeWeeklyGainKg(kg: number): number {
  return clamp(kg * 0.005, 0.1, 0.5);
}

/** Daily deficit for a requested pace, after the safe cap. */
export function safeDeficitKcalPerDay(kg: number, requestedKgPerWeek: number): number {
  return (Math.min(requestedKgPerWeek, maxSafeWeeklyLossKg(kg)) * KCAL_PER_KG) / 7;
}

/** Daily surplus for a requested pace, after the safe cap. */
export function safeSurplusKcalPerDay(kg: number, requestedKgPerWeek: number): number {
  return (Math.min(requestedKgPerWeek, maxSafeWeeklyGainKg(kg)) * KCAL_PER_KG) / 7;
}

/** Sex backstop under the floor: 1200 female, 1500 male, the midpoint 1350 for other / unset. */
export function sexFloor(sex: Sex): number {
  return sex === "female" ? 1200 : sex === "male" ? 1500 : 1350;
}

/** Lowest calorie target the app will generate or save: max(85 % of BMR, the sex backstop). */
export function calorieFloor(bmr: number, sex: Sex): number {
  return Math.max(bmr * 0.85, sexFloor(sex));
}

/** The floor for a whole profile, rounded; just the sex backstop when details are missing. */
export function floorFor(p: Profile, today: string = todayIso()): number {
  const age = ageYears(p.dob, today);
  if (!p.weight_kg || !p.height_cm || age == null) return sexFloor(p.gender);
  return Math.round(calorieFloor(mifflinBmr(p.weight_kg, p.height_cm, age, p.gender), p.gender));
}

/** The slider's top notch for a goal and body weight (0.1 kg grid, never below 0.1). */
export function speedMax(goal: GoalType, kg: number | null | undefined): number {
  const cap = goal === "gain" ? (kg ? maxSafeWeeklyGainKg(kg) : 0.5) : kg ? maxSafeWeeklyLossKg(kg) : 1.0;
  return Math.max(0.1, Math.floor(cap * 10 + 1e-9) / 10);
}

/** Round to the slider's 0.1 kg notches inside 0.1…max so the label and the saved value agree. */
export function roundSpeed(v: number, max = 1.0) {
  return Math.round(clamp(v, 0.1, Math.max(0.1, max)) * 10) / 10;
}

export type SpeedBand = "Slow and steady" | "Recommended" | "Max safe pace";

/** Band for the slider chip, relative to this person's safe max. */
export function speedLabel(kgPerWeek: number, max = 1.0): SpeedBand {
  const f = kgPerWeek / Math.max(0.1, max);
  if (f < 0.5) return "Slow and steady";
  if (f < 0.95) return "Recommended";
  return "Max safe pace";
}

/** The one-line "why" under the speed slider. */
export function speedWhy(goal: GoalType, kg: number | null | undefined): string {
  const max = speedMax(goal, kg);
  if (goal === "gain") return `Capped at ${one(max)} kg a week, about 0.5% of your body weight, so most of what you add is muscle.`;
  return `Capped at ${one(max)} kg a week, about 1% of your body weight. Faster mostly costs muscle, not fat.`;
}

// ---------------------------------------------------------------- protein and macros

/** ICMR-NIN 2020 adolescent protein RDA, grams/day (10–12, 13–15, 16–17 bands; under 10 uses 10–12). */
export function teenProteinG(age: number, sex: Sex): number {
  const band = age <= 12 ? 0 : age <= 15 ? 1 : 2;
  const boy = [31, 44, 55][band];
  const girl = [32, 43, 46][band];
  return sex === "male" ? boy : sex === "female" ? girl : Math.round((boy + girl) / 2);
}

/**
 * Protein, grams/day. Under 18: the ICMR-NIN table. Adults training 3+ times a week: 1.6 g/kg
 * (inside ISSN's 1.4–2.0). Otherwise max(0.83 g/kg ICMR-NIN RDA, 1.0 g/kg).
 */
export function proteinTargetG(age: number, kg: number, sex: Sex, workoutsPerWeek: number): number {
  if (isTeen(age)) return teenProteinG(age, sex);
  if (workoutsPerWeek >= 3) return Math.round(clamp(1.6 * kg, 1.4 * kg, 2.0 * kg));
  return Math.round(Math.max(0.83 * kg, 1.0 * kg));
}

/** Fat 25 % of calories, carbs the remainder after protein and fat. */
export function macrosFor(calories: number, protein: number): Targets {
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories: Math.round(calories), protein, carbs, fat };
}

export type MacroNote = { macro: "protein" | "carbs" | "fat"; level: "info" | "warn"; text: string };

/**
 * AMDR checks for the macro editor — soft notes, never blocks. "warn" for the clearly-low lines
 * (protein < 10 %, fat < 15 %, carbs < 20 % or < 130 g); "info" when outside the usual
 * AMDR ranges (protein 10–35 %, fat 20–35 %, carbs 45–65 %).
 */
export function amdrNotes(t: Targets): MacroNote[] {
  const kcal = Math.max(1, t.calories);
  const p = ((t.protein * 4) / kcal) * 100;
  const c = ((t.carbs * 4) / kcal) * 100;
  const f = ((t.fat * 9) / kcal) * 100;
  const out: MacroNote[] = [];
  if (p < 10) out.push({ macro: "protein", level: "warn", text: "Protein is under 10% of calories. That's low for recovery and muscle." });
  else if (p > 35) out.push({ macro: "protein", level: "info", text: "Protein is over 35%, above the usual range. Carbs are what fuel hard sessions." });
  if (f < 15) out.push({ macro: "fat", level: "warn", text: "Fat is under 15%. Your body needs some for hormones and vitamins." });
  else if (f < 20) out.push({ macro: "fat", level: "info", text: "Fat is a little under the usual 20–35% range." });
  else if (f > 35) out.push({ macro: "fat", level: "info", text: "Fat is over 35%, above the usual range." });
  if (c < 20 || t.carbs < 130) out.push({ macro: "carbs", level: "warn", text: "Carbs are under 130 g a day. Your brain alone runs on about that much." });
  else if (c < 45) out.push({ macro: "carbs", level: "info", text: "Carbs are under 45%, below the usual 45–65% range. Fine if that's on purpose." });
  else if (c > 65) out.push({ macro: "carbs", level: "info", text: "Carbs are over 65%, above the usual range." });
  return out;
}

// ---------------------------------------------------------------- the generator

export type Plan = {
  targets: Targets;
  teen: boolean;
  age: number;
  /** The goal the maths used (a teen's "lose" is maintain). */
  goal: GoalType;
  /** Mifflin-St Jeor, also used for the floor. */
  bmr: number;
  /** Maintenance energy: BMR × PAL for adults, EER for teens. */
  maintenance: number;
  pal: PalBand;
  /** kg/week after the safe cap (0 for maintain and for teens). */
  speed: number;
  speedCapped: boolean;
  floor: number;
  floorApplied: boolean;
};

/** The full working behind a set of targets; null when details are missing. */
export function plan(p: Profile, today: string = todayIso()): Plan | null {
  if (missing(p).length) return null;
  const kg = p.weight_kg as number;
  const cm = p.height_cm as number;
  const age = ageYears(p.dob, today) as number;
  const teen = isTeen(age);
  const goal = effectiveGoal(p.goal_type, age);
  const bmr = mifflinBmr(kg, cm, age, p.gender);
  const pal = adultPal(p.weekly_workout_target);
  const floor = calorieFloor(bmr, p.gender);

  let maintenance: number;
  let raw: number;
  let speed = 0;
  let speedCapped = false;
  if (teen) {
    maintenance = teenEer(kg, cm, age, p.gender, p.weekly_workout_target);
    raw = goal === "gain" ? maintenance + teenGainSurplus(maintenance) : maintenance;
  } else {
    maintenance = bmr * pal.factor;
    const requested = Math.max(0.1, p.goal_speed_kg_wk || 0.5);
    if (goal === "lose") {
      speed = Math.min(requested, maxSafeWeeklyLossKg(kg));
      raw = maintenance - safeDeficitKcalPerDay(kg, requested);
    } else if (goal === "gain") {
      speed = Math.min(requested, maxSafeWeeklyGainKg(kg));
      raw = maintenance + safeSurplusKcalPerDay(kg, requested);
    } else raw = maintenance;
    speedCapped = goal !== "maintain" && speed < requested - 1e-9;
  }
  const calories = Math.max(floor, raw);
  const protein = proteinTargetG(age, kg, p.gender, p.weekly_workout_target);
  return {
    targets: macrosFor(calories, protein),
    teen,
    age,
    goal,
    bmr,
    maintenance,
    pal,
    speed,
    speedCapped,
    floor,
    floorApplied: raw < floor,
  };
}

export function generate(p: Profile, today: string = todayIso()): Targets | null {
  return plan(p, today)?.targets ?? null;
}

/** Copy of `p` with freshly generated targets applied (unchanged when details are missing). */
export function applyTo(p: Profile, today: string = todayIso()): Profile {
  const t = generate(p, today);
  if (!t) return p;
  return { ...p, calorie_target: t.calories, protein_target_g: t.protein, carb_target_g: t.carbs, fat_target_g: t.fat };
}

/** A calorie target the user typed, lifted to the floor if it is under it. Never blocks the save. */
export function capToFloor(requested: number, floor: number): { calories: number; capped: boolean } {
  const f = Math.round(floor);
  return requested < f ? { calories: f, capped: true } : { calories: Math.round(requested), capped: false };
}

// ---------------------------------------------------------------- eating-disorder safety flags

export type EdFlag = "very_low_bmi" | "very_low_bmi_for_age" | "rapid_loss" | "extreme_target" | "goal_below_range" | "repeated_lowering";
export type WeighIn = { date: string; kg: number };
/** One downward-or-upward edit of the calorie target or goal weight, kept on the device. */
export type TargetEdit = { date: string; field: "calories" | "goal_weight"; from: number; to: number };

const dayNum = (iso: string) => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);

/**
 * Loss in kg/week across weigh-ins from the last 28 days (first vs last), positive = losing.
 * Null unless those weigh-ins span at least 14 days, so one noisy scale reading can't trip it.
 */
export function recentWeeklyLoss(weights: WeighIn[], today: string): number | null {
  const t = dayNum(today);
  const recent = weights.filter((w) => w.kg > 0 && t - dayNum(w.date) <= 28 && dayNum(w.date) <= t).sort((a, b) => dayNum(a.date) - dayNum(b.date));
  if (recent.length < 2) return null;
  const span = dayNum(recent[recent.length - 1].date) - dayNum(recent[0].date);
  if (span < 14) return null;
  return (recent[0].kg - recent[recent.length - 1].kg) / (span / 7);
}

/** How many edits in the last `days` days moved a target down. */
export function downwardEdits(edits: TargetEdit[], today: string, days = 14): number {
  const t = dayNum(today);
  return edits.filter((e) => e.to < e.from && t - dayNum(e.date) <= days && dayNum(e.date) <= t).length;
}

export type ScreenInput = {
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  /** BMI-for-age z (teens only). */
  bmiZ: number | null;
  weights: WeighIn[];
  /** A calorie target the user asked for, before any capping. */
  requestedCalories: number | null;
  floor: number;
  goalType: GoalType;
  goalWeightKg: number | null;
  edits: TargetEdit[];
  today: string;
};

/**
 * Pattern signals only — never a diagnosis, never a block. Any flag caps the target at the floor
 * (where there is a target) and shows the kind safety note with helplines.
 */
export function edFlags(i: ScreenInput): EdFlag[] {
  const flags: EdFlag[] = [];
  const b = bmi(i.weightKg, i.heightCm);
  if (i.age != null && !isTeen(i.age) && b != null && b < 17.5) flags.push("very_low_bmi");
  if (isTeen(i.age) && i.bmiZ != null && i.bmiZ < -2) flags.push("very_low_bmi_for_age");
  const loss = recentWeeklyLoss(i.weights, i.today);
  const kg = i.weightKg ?? i.weights[0]?.kg ?? null;
  if (loss != null && kg && loss > maxSafeWeeklyLossKg(kg)) flags.push("rapid_loss");
  if (i.requestedCalories != null && i.requestedCalories < Math.round(i.floor)) flags.push("extreme_target");
  if (i.age != null && !isTeen(i.age) && i.goalType === "lose" && i.goalWeightKg != null && i.heightCm && i.goalWeightKg < healthyRange(i.heightCm).min) flags.push("goal_below_range");
  if (downwardEdits(i.edits, i.today) >= 3) flags.push("repeated_lowering");
  return flags;
}

/** Fill a ScreenInput from a profile plus what the screen knows. */
export function screenInput(p: Profile, extra: { weights?: WeighIn[]; requestedCalories?: number | null; edits?: TargetEdit[]; today?: string } = {}): ScreenInput {
  const today = extra.today ?? todayIso();
  const age = ageYears(p.dob, today);
  const months = ageMonths(p.dob, today);
  const b = bmi(p.weight_kg, p.height_cm);
  return {
    age,
    heightCm: p.height_cm,
    weightKg: p.weight_kg,
    bmiZ: isTeen(age) && b != null && months != null ? bmiForAgeZ(b, p.gender, months) : null,
    weights: extra.weights ?? [],
    requestedCalories: extra.requestedCalories ?? null,
    floor: floorFor(p, today),
    goalType: p.goal_type,
    goalWeightKg: p.goal_weight_kg,
    edits: extra.edits ?? [],
    today,
  };
}

// ---------------------------------------------------------------- copy shared by both apps

export const SAFETY_TITLE = "Let's keep this kind to your body";

/** The safety note's body. `floor` is set when a calorie number was lifted to the floor. */
export function safetyBody(flags: EdFlag[], floor: number | null): string {
  const parts: string[] = [];
  if (floor != null) parts.push(`We've set your target to ${Math.round(floor).toLocaleString("en-IN")} kcal, a safer floor based on general nutrition guidance for your body.`);
  else if (flags.includes("goal_below_range")) parts.push("That goal sits under the healthy range for your height, so we'll keep your daily target at a safer level.");
  else parts.push("We noticed a pattern that can sometimes mean food or weight feels heavy right now. No judgement, just checking in.");
  parts.push("If food or your body has been on your mind a lot, talking to someone can really help.");
  return parts.join(" ");
}

export type Helpline = { name: string; detail: string; phones: string[]; whatsapp?: string };

/**
 * Indian helplines from the science spec (Sept 2026).
 * TODO(before launch): re-verify every number — Indian helplines change periodically.
 */
export const HELPLINES: Helpline[] = [
  { name: "iCall (TISS)", detail: "Free counselling with trained professionals, Mon–Sat, 8 am–10 pm", phones: ["9152987821", "022-25521111"] },
  { name: "Vandrevala Foundation", detail: "Free, 24×7, calls or WhatsApp", phones: ["1860-2662-345", "1800-233-3330"], whatsapp: "+91 9999 666 555" },
  { name: "KIRAN", detail: "Govt. of India mental health helpline, 24×7, toll-free", phones: ["1800-599-0019"] },
];

export const HELPLINE_NOTE = "Numbers checked September 2026. Helplines change sometimes, so if one doesn't connect, please try another.";

/** "The science" sheet: what each number is based on. */
export const SCIENCE_SOURCES: { title: string; body: string }[] = [
  { title: "Safe pace", body: "Loss is capped at 1% of your body weight a week (never over 1 kg), in line with NIH and AHA/ACC/TOS obesity guidelines. Gain is capped at 0.5% a week, from sports-nutrition reviews on lean gaining (Helms, Aragon and colleagues)." },
  { title: "Your energy", body: "Adults: the Mifflin-St Jeor equation (1990), the best-validated everyday formula, times a standard activity factor (FAO/WHO/UNU). Under 18: the IOM estimated energy requirement for teens, which includes energy for growing." },
  { title: "The floor", body: "Your target never goes under 85% of your resting burn, or 1200 kcal (women) / 1500 kcal (men), whichever is higher." },
  { title: "Protein", body: "1.6 g per kg if you train 3+ times a week (ISSN position stand: 1.4–2.0 g/kg). Otherwise about 1 g/kg. Under 18: ICMR-NIN 2020 recommended amounts for your age." },
  { title: "BMI", body: "Adults: Indian cut-offs (normal under 23, from the 2009 Indian consensus statement and WHO's Asia-Pacific advice), with the WHO global category shown too. Under 18: WHO 2007 growth reference for your exact age. BMI can't tell muscle from fat, so it's one signal, not a verdict." },
  { title: "Waist-to-height", body: "Keeping your waist under half your height is linked with lower health risk at most ages (Ashwell & Gibson)." },
];

// ---------------------------------------------------------------- hide-numbers mode

/** Words instead of kcal for the opt-in "Hide calorie numbers" mode. Never moralizing. */
export function calorieWords(eaten: number, target: number): string {
  if (target <= 0) return "No target set";
  const r = eaten / target;
  if (r <= 0) return "Nothing logged yet";
  if (r < 0.35) return "Just getting started";
  if (r < 0.75) return "Building up";
  if (r < 0.92) return "Nearly there";
  if (r <= 1.1) return "Right around your target";
  return "Past your target, and that's okay";
}
