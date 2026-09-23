import { ageFrom, type Profile } from "./types";

/**
 * "✨ Auto Generate Goals" — Mifflin-St Jeor BMR, a light activity multiplier, then the user's
 * lose/maintain/gain intent at their chosen speed. Protein 1.8 g/kg, fat 25% of calories, carbs
 * take the remainder. A one-for-one port of the Android app's util/Goals.kt so both surfaces
 * generate the same numbers.
 */

export type Targets = { calories: number; protein: number; carbs: number; fat: number };

/** Human-readable list of what Personal details is still missing; empty means `generate` works. */
export function missing(p: Profile): string[] {
  const out: string[] = [];
  if (p.weight_kg == null || p.weight_kg <= 0) out.push("current weight");
  if (p.height_cm == null || p.height_cm <= 0) out.push("height");
  if (ageFrom(p.dob) == null) out.push("date of birth");
  if (!p.gender) out.push("gender");
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function generate(p: Profile): Targets | null {
  if (missing(p).length) return null;
  const kg = p.weight_kg as number;
  const cm = p.height_cm as number;
  const age = ageFrom(p.dob) as number;
  // Mifflin-St Jeor, with the midpoint of the two sex constants for "other".
  const sex = p.gender === "male" ? 5 : p.gender === "female" ? -161 : -78;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + sex;
  // Light-activity baseline; hitting the bands 3+ times a week nudges it up a notch.
  const activity = p.weekly_workout_target >= 3 ? 1.45 : 1.4;
  const tdee = bmr * activity;

  // 1 kg of body mass ≈ 7700 kcal, spread across the week.
  const delta = (clamp(p.goal_speed_kg_wk, 0.1, 1.5) * 7700) / 7;
  const raw = p.goal_type === "lose" ? tdee - delta : p.goal_type === "gain" ? tdee + delta : tdee;
  const calories = Math.max(1200, raw);

  const protein = Math.round(1.8 * kg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories: Math.round(calories), protein, carbs, fat };
}

/** Copy of `p` with freshly generated targets applied (unchanged when details are missing). */
export function applyTo(p: Profile): Profile {
  const t = generate(p);
  if (!t) return p;
  return { ...p, calorie_target: t.calories, protein_target_g: t.protein, carb_target_g: t.carbs, fat_target_g: t.fat };
}

/** Slider copy for the weekly speed, matching Cal AI's three bands. */
export function speedLabel(kgPerWeek: number): "Slow and steady" | "Recommended" | "Aggressive" {
  if (kgPerWeek < 0.5) return "Slow and steady";
  if (kgPerWeek <= 0.8) return "Recommended";
  return "Aggressive";
}

/** Round to the slider's 0.1 kg notches so the label and the saved value always agree. */
export function roundSpeed(v: number) {
  return Math.round(clamp(v, 0.1, 1.5) * 10) / 10;
}
