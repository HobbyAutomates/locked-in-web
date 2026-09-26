import { DEFAULT_PROFILE, type GoalType, type Profile } from "./types";
import { addDays } from "./dates";
import { ageYears, isTeen, maxSafeWeeklyGainKg, maxSafeWeeklyLossKg, plan, todayIso, type Targets } from "./goals";
import { dietTargets, effectiveDietMode, isDietMode, type DietMode } from "./dietModes";

/**
 * v2.14 Gen Z onboarding (docs/v214-spec.md). Pure, so scripts/check-onboarding.ts runs it and
 * Android's port gives the same plan. The answers live on the device until the account exists
 * (web: localStorage `li_onb_v2`), then /api/onboarding/finish saves them.
 */

export type OnbGoal = "lose" | "gain" | "recomp" | "habits";
export type OnbPace = "chill" | "steady" | "aggressive";
export type CoachStyle = "calm" | "balanced" | "no_excuses";

export type OnbAnswers = {
  heard_from?: string | null;
  goal?: OnbGoal | null;
  name?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  dob?: string | null;
  gender?: Profile["gender"];
  goal_weight_kg?: number | null;
  pace?: OnbPace | null;
  training_days?: number | null;
  sports?: string[] | null;
  diet_mode?: DietMode | null;
  obstacles?: string[] | null;
  coach_style?: CoachStyle | null;
  first_challenge?: string | null;
};

export const SOURCES = [
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "friend", label: "A friend sent it" },
  { key: "college_gym", label: "College or gym" },
  { key: "search", label: "Google / Play Store" },
  { key: "other", label: "Somewhere else" },
] as const;

export const GOALS: { key: OnbGoal; label: string; sub: string }[] = [
  { key: "lose", label: "Lose fat", sub: "Most people start here" },
  { key: "gain", label: "Build muscle", sub: "Get stronger, add size" },
  { key: "recomp", label: "Both. Recomp.", sub: "Lose fat, keep the gains" },
  { key: "habits", label: "Just stay locked in", sub: "Habits, energy, consistency" },
];

export const OBSTACLES = [
  { key: "exam_stress", label: "Exam stress", sub: "Food as a coping tool" },
  { key: "mess_food", label: "Hostel or mess food", sub: "No control over what's served" },
  { key: "late_night", label: "Late-night Maggi", sub: "The 1 am kitchen run" },
  { key: "no_time", label: "No time to cook", sub: "Convenience wins" },
  { key: "eating_out", label: "Eating out with friends", sub: "Hard to track, harder to say no" },
  { key: "lost_motivation", label: "Lost motivation before", sub: "Started strong, then drifted" },
] as const;

export const SPORTS = ["Gym", "Home workout", "Running", "Cricket", "Football", "Yoga", "Badminton", "Walking"] as const;

export const EATER_TYPES: { key: DietMode; label: string; sub: string; adultsOnly?: boolean }[] = [
  { key: "balanced", label: "Balanced", sub: "Eat everything, in moderation" },
  { key: "high_protein", label: "High protein", sub: "Gym focus, stay full longer" },
  { key: "vegetarian", label: "Vegetarian", sub: "No meat, fish or egg" },
  { key: "eggetarian", label: "Eggetarian", sub: "Veg + eggs" },
  { key: "jain", label: "Jain", sub: "No roots, no onion-garlic" },
  { key: "vegan", label: "Vegan", sub: "Fully plant-based" },
  { key: "keto", label: "Keto", sub: "Very low carb", adultsOnly: true },
  { key: "low_carb", label: "Low carb", sub: "Fewer carbs, more fat", adultsOnly: true },
];

export const CHALLENGES = [
  { key: "protein_7", title: "7-day protein streak", sub: "Hit your protein 7 days in a row", level: "WINNABLE", days: 7 },
  { key: "perfect_week", title: "Perfect week", sub: "Log 3 meals a day for 7 days", level: "MEDIUM", days: 7 },
  { key: "no_maggi_30", title: "No-Maggi month", sub: "30 days, zero instant noodles", level: "HARD", days: 30 },
] as const;

export const STYLES: { key: CoachStyle; label: string; short: string; sample: string }[] = [
  { key: "calm", label: "Calm", short: "Gentle, encouraging, zero pressure", sample: "Rough day? One good meal tonight is enough." },
  { key: "balanced", label: "Balanced", short: "Honest, supportive, a nudge when needed", sample: "You're 20 g short on protein. Curd before bed?" },
  { key: "no_excuses", label: "No excuses", short: "Direct. Calls out skipped days. Pushes you.", sample: "3 skipped workouts. Gym at 6. No excuses." },
];

/** Pace in kg/week per band. Loss and gain have their own scales; the safe cap still applies. */
export const PACES: Record<"loss" | "gain", Record<OnbPace, number>> = {
  loss: { chill: 0.3, steady: 0.5, aggressive: 0.75 },
  gain: { chill: 0.1, steady: 0.25, aggressive: 0.4 },
};

export const isCoachStyle = (v: unknown): v is CoachStyle => v === "calm" || v === "balanced" || v === "no_excuses";

/** Under 18 the coach is capped at Balanced (the database trigger does the same). */
export function effectiveCoachStyle(style: unknown, age: number | null | undefined): CoachStyle {
  const s = isCoachStyle(style) ? style : "balanced";
  return isTeen(age) && s === "no_excuses" ? "balanced" : s;
}

/** The goal_type the maths uses. Recomp is a slow cut; a teen never gets a deficit. */
export function goalTypeOf(goal: OnbGoal | null | undefined, age: number | null | undefined): GoalType {
  if (goal === "gain") return "gain";
  if ((goal === "lose" || goal === "recomp") && !isTeen(age)) return "lose";
  return "maintain";
}

export function paceKg(goalType: GoalType, pace: OnbPace | null | undefined): number {
  if (goalType === "maintain") return 0;
  return PACES[goalType === "gain" ? "gain" : "loss"][pace ?? "steady"];
}

const clean = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return v == null || v === "" || !Number.isFinite(n) || n < lo || n > hi ? null : n;
};

/** Validates and trims answers that came from a client (either platform). */
export function sanitizeAnswers(raw: unknown): OnbAnswers {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown, allowed?: readonly string[]) =>
    Array.isArray(v) ? [...new Set(v.map(String).map((s) => s.trim().slice(0, 40)).filter((s) => s && (!allowed || allowed.includes(s))))].slice(0, 12) : null;
  return {
    heard_from: SOURCES.some((s) => s.key === a.heard_from) ? String(a.heard_from) : null,
    goal: GOALS.some((g) => g.key === a.goal) ? (a.goal as OnbGoal) : null,
    name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 40) : null,
    height_cm: clean(a.height_cm, 100, 250),
    weight_kg: clean(a.weight_kg, 25, 300),
    dob: typeof a.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.dob) ? a.dob : null,
    gender: a.gender === "male" || a.gender === "female" || a.gender === "other" ? a.gender : null,
    goal_weight_kg: clean(a.goal_weight_kg, 25, 300),
    pace: a.pace === "chill" || a.pace === "steady" || a.pace === "aggressive" ? a.pace : null,
    training_days: clean(a.training_days, 0, 7) == null ? null : Math.round(Number(a.training_days)),
    sports: strs(a.sports),
    diet_mode: isDietMode(a.diet_mode) ? a.diet_mode : null,
    obstacles: strs(a.obstacles, OBSTACLES.map((o) => o.key)),
    coach_style: isCoachStyle(a.coach_style) ? a.coach_style : null,
    first_challenge: CHALLENGES.some((c) => c.key === a.first_challenge) ? String(a.first_challenge) : null,
  };
}

/** The profile columns the answers fill (the classic ones, i.e. without schema_v37). */
export function answersToProfile(a: OnbAnswers, base: Profile = DEFAULT_PROFILE, today: string = todayIso()): Profile {
  const age = ageYears(a.dob ?? base.dob, today);
  const goal_type = a.goal ? goalTypeOf(a.goal, age) : base.goal_type;
  const speed = paceKg(goal_type, a.pace);
  return {
    ...base,
    name: a.name ?? base.name,
    height_cm: a.height_cm ?? base.height_cm,
    weight_kg: a.weight_kg ?? base.weight_kg,
    dob: a.dob ?? base.dob,
    gender: a.gender ?? base.gender,
    goal_type,
    goal_weight_kg: goal_type === "maintain" ? null : (a.goal_weight_kg ?? base.goal_weight_kg),
    goal_speed_kg_wk: speed > 0 ? speed : base.goal_speed_kg_wk,
    weekly_workout_target: a.training_days ?? base.weekly_workout_target,
  };
}

export type OnbPlan = {
  targets: Targets & { fiber: number };
  goal_date: string | null;
  weeks: number | null;
  pace_kg_wk: number;
  teen: boolean;
  goal_type: GoalType;
  reasons: string[];
  honest: string;
};

/** Fibre: 14 g per 1,000 kcal (IOM), 25–40 g. */
export const fiberFor = (kcal: number) => Math.max(25, Math.min(40, Math.round((kcal / 1000) * 14)));

/** Everything the reveal screen shows. Null when the body details are still missing. */
export function onboardingPlan(a: OnbAnswers, today: string = todayIso()): OnbPlan | null {
  const p = answersToProfile(a, { ...DEFAULT_PROFILE, gender: a.gender ?? null }, today);
  const pl = plan(p, today);
  if (!pl) return null;
  const mode = effectiveDietMode(a.diet_mode ?? "balanced", pl.age);
  const t = mode === "balanced" ? pl.targets : dietTargets(p, pl.targets.calories, mode, today);
  const kg = p.weight_kg as number;
  let weeks: number | null = null;
  let goal_date: string | null = null;
  const speed = pl.goal === "lose" ? Math.min(p.goal_speed_kg_wk, maxSafeWeeklyLossKg(kg)) : pl.goal === "gain" ? Math.min(p.goal_speed_kg_wk, maxSafeWeeklyGainKg(kg)) : 0;
  const target = p.goal_weight_kg;
  if (speed > 0 && target != null && ((pl.goal === "lose" && target < kg) || (pl.goal === "gain" && target > kg))) {
    weeks = Math.max(1, Math.ceil(Math.abs(kg - target) / speed));
    goal_date = addDays(today, Math.ceil((Math.abs(kg - target) / speed) * 7));
  }
  return {
    targets: { ...t, fiber: fiberFor(t.calories) },
    goal_date,
    weeks,
    pace_kg_wk: Math.round(speed * 100) / 100,
    teen: pl.teen,
    goal_type: pl.goal,
    reasons: reasonsFor(a, t, pl.teen),
    honest: honestLine(pl.goal),
  };
}

const COACH_REASON: Record<CoachStyle, string> = {
  calm: "**Calm** coach: one kind note a morning, zero guilt",
  balanced: "**Balanced** coach: honest, with one concrete ask a day",
  no_excuses: "**No-excuses** coach, a nudge at 6 pm on training days",
};

const OBSTACLE_REASON: Record<string, string> = {
  exam_stress: "Protein front-loaded at breakfast for **exam-stress** snacking",
  mess_food: "Mess-food swaps: **dal + curd + roti** math done for you",
  late_night: "A **late-night** protein snack planned in, so Maggi isn't the only option",
  no_time: "**No-cook** picks first in every suggestion",
  eating_out: "**Eating out** logs in one line, and menus scan too",
  lost_motivation: "A **daily streak** and a buddy, so week 3 isn't a solo fight",
};

/** Three "why this works for you" lines, from the answers. `**x**` marks the bold words. */
export function reasonsFor(a: OnbAnswers, t: Targets, teen: boolean): string[] {
  const out: string[] = [];
  for (const o of a.obstacles ?? []) if (OBSTACLE_REASON[o] && out.length < 2) out.push(OBSTACLE_REASON[o]);
  if (out.length < 2 && a.training_days) out.push(`**${t.protein} g protein** to back ${a.training_days} training day${a.training_days === 1 ? "" : "s"} a week`);
  if (out.length < 2) out.push(`**${t.protein} g protein** a day keeps you full and protects muscle`);
  const style = effectiveCoachStyle(a.coach_style, teen ? 15 : 30);
  out.push(COACH_REASON[style]);
  return out.slice(0, 3);
}

export function honestLine(goal: GoalType): string {
  if (goal === "lose") return "First 2 weeks: mostly water weight. Week 3 slows. That's normal.";
  if (goal === "gain") return "The scale jumps early from water and food. Then it's slow, and that's the point.";
  return "Some days up, some days down. The weekly average is what counts.";
}

/** Memories the coach starts with (kind, text), from the answers. */
export function seedMemories(a: OnbAnswers, p: OnbPlan | null): { kind: "goal" | "food" | "life" | "body" | "style"; text: string }[] {
  const out: { kind: "goal" | "food" | "life" | "body" | "style"; text: string }[] = [];
  const goal = GOALS.find((g) => g.key === a.goal);
  if (goal) {
    const date = p?.goal_date ? ` · ${a.goal_weight_kg} kg by ${prettyDate(p.goal_date)}` : "";
    out.push({ kind: "goal", text: `${goal.key === "recomp" ? "Recomp" : goal.label}${date}` });
  }
  if (p) out.push({ kind: "goal", text: `Protein ${p.targets.protein} g` });
  const eater = EATER_TYPES.find((e) => e.key === a.diet_mode);
  if (eater && eater.key !== "balanced") out.push({ kind: "food", text: eater.label });
  for (const o of a.obstacles ?? []) {
    const ob = OBSTACLES.find((x) => x.key === o);
    if (ob) out.push({ kind: o === "mess_food" || o === "late_night" || o === "eating_out" ? "food" : "life", text: ob.label });
  }
  if (a.training_days) out.push({ kind: "life", text: `Trains ${a.training_days} day${a.training_days === 1 ? "" : "s"} a week${a.sports?.length ? ` · ${a.sports.slice(0, 3).join(", ")}` : ""}` });
  const ch = CHALLENGES.find((c) => c.key === a.first_challenge);
  if (ch) out.push({ kind: "goal", text: `First challenge: ${ch.title}` });
  const st = STYLES.find((s) => s.key === a.coach_style);
  if (st) out.push({ kind: "style", text: st.label });
  return out.slice(0, 12);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2027-02-14" → "14 February". */
export function prettyDate(iso: string, short = false): string {
  const [, m, d] = iso.split("-").map(Number);
  const name = MONTHS[(m || 1) - 1];
  return `${d} ${short ? name.slice(0, 3) : name}`;
}

/** The coach note under the first parsed meal (screen 4). Deterministic, no AI call. */
export function firstLogNote(t: { calories: number; protein: number }, names: string[]): string {
  const p = Math.round(t.protein);
  const joined = names.slice(0, 2).join(" + ");
  if (p >= 25) return `Solid plate. ${joined ? joined + " = " : ""}${p} g protein already. Keep that up at dinner and you're golden.`;
  if (p >= 12) return `Good start: ${p} g protein. Add paneer, eggs or curd at your next meal and you're on track.`;
  return `Logged. Only ${p} g protein here, so make the next meal the protein one: dal, paneer, eggs or chicken.`;
}
