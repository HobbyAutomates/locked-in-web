import type { ItemMicros, Meal, Profile } from "./types";
import { ageYears, todayIso } from "./goals";
import { foodAllowed, type DietMode } from "./dietModes";

/**
 * v2.13 micronutrient dashboard (spec §9), pure. Uses the micros every meal item already carries
 * (scaled to its grams): fibre, sugar, sodium, iron, calcium, vitamin C, potassium.
 *
 * Targets: ICMR-NIN 2020 RDA by age and sex for iron, calcium, vitamin C and potassium; fibre at
 * 30 g per 2,000 kcal (ICMR-NIN) unless the user set their own; sugar under 10 % of calories (WHO)
 * unless set in Nutrition goals; sodium under 2,000 mg (WHO).
 * TODO(before launch): re-check the adolescent vitamin C and potassium bands against the ICMR-NIN
 * 2020 tables (they are close to the adult values used here). Keep Android's util/Micros.kt in step.
 */

export type MicroKey = "fiber_g" | "sugar_g" | "sodium_mg" | "iron_mg" | "calcium_mg" | "vitamin_c_mg" | "potassium_mg";

export type MicroTarget = {
  key: MicroKey;
  label: string;
  unit: "g" | "mg";
  /** A goal to reach ("min") or a limit to stay under ("max"). */
  kind: "min" | "max";
  target: number;
  source: string;
};

export const MICRO_KEYS: MicroKey[] = ["fiber_g", "iron_mg", "calcium_mg", "vitamin_c_mg", "potassium_mg", "sugar_g", "sodium_mg"];

type Sex = Profile["gender"];

/** ICMR-NIN 2020 iron RDA (mg/day). */
export function ironRda(age: number | null, sex: Sex): number {
  const f = sex === "female";
  const m = sex === "male";
  const pick = (boy: number, girl: number) => (m ? boy : f ? girl : Math.round((boy + girl) / 2));
  if (age == null || age >= 18) return pick(19, 29);
  if (age <= 12) return pick(16, 28);
  if (age <= 15) return pick(22, 30);
  return pick(26, 32);
}

/** ICMR-NIN 2020 calcium RDA (mg/day). */
export function calciumRda(age: number | null): number {
  if (age == null || age >= 18) return 1000;
  if (age <= 12) return 850;
  if (age <= 15) return 1000;
  return 1050;
}

/** ICMR-NIN 2020 vitamin C RDA (mg/day). */
export function vitaminCRda(sex: Sex): number {
  return sex === "male" ? 80 : sex === "female" ? 65 : 72;
}

/** ICMR-NIN 2020 potassium (mg/day). */
export function potassiumRda(age: number | null): number {
  return age != null && age < 16 ? 3000 : 3510;
}

export const SODIUM_LIMIT_MG = 2000;

export function microTargets(p: Profile, today: string = todayIso()): MicroTarget[] {
  const age = ageYears(p.dob, today);
  const kcal = Math.max(1000, p.calorie_target || 2000);
  return [
    { key: "fiber_g", label: "Fibre", unit: "g", kind: "min", target: p.fiber_target ?? Math.round((30 * kcal) / 2000), source: "ICMR-NIN 2020: 30 g per 2,000 kcal" },
    { key: "iron_mg", label: "Iron", unit: "mg", kind: "min", target: ironRda(age, p.gender), source: "ICMR-NIN 2020 RDA for your age and sex" },
    { key: "calcium_mg", label: "Calcium", unit: "mg", kind: "min", target: calciumRda(age), source: "ICMR-NIN 2020 RDA for your age" },
    { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", kind: "min", target: vitaminCRda(p.gender), source: "ICMR-NIN 2020 RDA" },
    { key: "potassium_mg", label: "Potassium", unit: "mg", kind: "min", target: potassiumRda(age), source: "ICMR-NIN 2020" },
    { key: "sugar_g", label: "Sugar", unit: "g", kind: "max", target: p.sugar_target ?? Math.round((kcal * 0.1) / 4), source: "WHO: under 10 % of your calories" },
    { key: "sodium_mg", label: "Sodium", unit: "mg", kind: "max", target: SODIUM_LIMIT_MG, source: "WHO: under 2,000 mg (about 5 g salt)" },
  ];
}

export type MicroDay = { values: Record<MicroKey, number>; items: number; itemsWithData: number };

const empty = (): Record<MicroKey, number> => ({ fiber_g: 0, sugar_g: 0, sodium_mg: 0, iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0 });

/** One day's totals. `itemsWithData` counts items that carried any micro at all. */
export function dayMicros(meals: Pick<Meal, "date" | "items">[], date: string): MicroDay {
  const values = empty();
  let items = 0;
  let withData = 0;
  for (const m of meals) {
    if (m.date !== date) continue;
    for (const it of m.items) {
      items++;
      const mic = (it.micros ?? {}) as ItemMicros;
      let any = false;
      for (const k of MICRO_KEYS) {
        const v = Number(mic[k]);
        if (Number.isFinite(v) && v > 0) {
          values[k] += v;
          any = true;
        }
      }
      if (any) withData++;
    }
  }
  for (const k of MICRO_KEYS) values[k] = Math.round(values[k] * 10) / 10;
  return { values, items, itemsWithData: withData };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
};

/** The average over the days with anything logged among the `days` days ending `today`. */
export function weekAverage(meals: Pick<Meal, "date" | "items">[], today: string, days = 7): { values: Record<MicroKey, number>; loggedDays: number; coverage: number } {
  const sum = empty();
  let logged = 0;
  let items = 0;
  let withData = 0;
  for (let i = 0; i < days; i++) {
    const d = dayMicros(meals, addDays(today, -i));
    if (!d.items) continue;
    logged++;
    items += d.items;
    withData += d.itemsWithData;
    for (const k of MICRO_KEYS) sum[k] += d.values[k];
  }
  const values = empty();
  for (const k of MICRO_KEYS) values[k] = logged ? Math.round((sum[k] / logged) * 10) / 10 : 0;
  return { values, loggedDays: logged, coverage: items ? withData / items : 0 };
}

/** Indian foods that are good sources, per nutrient (filtered by diet mode before showing). */
export const FOOD_HINTS: Partial<Record<MicroKey, string[]>> = {
  fiber_g: ["Rajma", "Whole moong or chana", "Oats", "Guava", "Bajra or jowar roti", "Apple with the skin", "Cucumber and carrot salad"],
  iron_mg: ["Rajma", "Chana", "Palak", "Bajra roti", "Ragi dosa", "Poha with lemon", "Eggs", "Mutton"],
  calcium_mg: ["Ragi", "Curd (dahi)", "Paneer", "Til (sesame) chikki", "Milk", "Tofu"],
  vitamin_c_mg: ["Amla", "Guava", "Orange or mosambi", "Lemon on your dal", "Capsicum", "Papaya"],
  potassium_mg: ["Banana", "Coconut water", "Rajma", "Curd", "Palak", "Sweet potato"],
};

export type MicroHint = { key: MicroKey; label: string; kind: "low" | "high"; pct: number; text: string; foods: string[] };

/**
 * "Low this week": goals under 70 % of target on average, and limits over 100 %. Needs at least
 * 3 logged days so a single day can't raise a flag.
 */
export function weekHints(targets: MicroTarget[], avg: Record<MicroKey, number>, loggedDays: number, mode: DietMode): MicroHint[] {
  if (loggedDays < 3) return [];
  const out: MicroHint[] = [];
  for (const t of targets) {
    const pct = t.target > 0 ? avg[t.key] / t.target : 0;
    if (t.kind === "min" && pct < 0.7) {
      const foods = (FOOD_HINTS[t.key] ?? []).filter((f) => foodAllowed(mode, f)).slice(0, 4);
      out.push({ key: t.key, label: t.label, kind: "low", pct, text: `${t.label} was low this week (about ${Math.round(pct * 100)}% of your ${t.target.toLocaleString("en-IN")} ${t.unit}).`, foods });
    } else if (t.kind === "max" && pct > 1) {
      out.push({ key: t.key, label: t.label, kind: "high", pct, text: `${t.label} averaged over your limit this week (${Math.round(avg[t.key]).toLocaleString("en-IN")} of ${t.target.toLocaleString("en-IN")} ${t.unit}).`, foods: [] });
    }
  }
  return out;
}
