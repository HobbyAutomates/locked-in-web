import type { Meal } from "./types";

/**
 * v2.8 meal types (bandlog.meals.meal_type, schema_v30.sql). Pure, so Home, Calendar, the meal
 * form and scripts/check-meal-type.ts share it. Mirrors Android's util/MealTypes.kt.
 */
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/** Home's section order: Breakfast · Lunch · Dinner · Snacks. */
export const MEAL_TYPES: { key: MealType; label: string; emoji: string }[] = [
  { key: "breakfast", label: "Breakfast", emoji: "🍳" },
  { key: "lunch", label: "Lunch", emoji: "🍛" },
  { key: "dinner", label: "Dinner", emoji: "🌙" },
  { key: "snack", label: "Snacks", emoji: "🍿" },
];

export function isMealType(x: unknown): x is MealType {
  return x === "breakfast" || x === "lunch" || x === "dinner" || x === "snack";
}

export function mealTypeLabel(t: MealType): string {
  return MEAL_TYPES.find((m) => m.key === t)?.label ?? "Meal";
}

/**
 * The hour rule (India time): 04–10:59 breakfast, 11–15:59 lunch, 16–18:59 snack, 19–03:59 dinner.
 * The same rule backfills old rows in schema_v30.sql.
 */
export function mealTypeForHour(hour: number): MealType {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 16 && h < 19) return "snack";
  return "dinner";
}

const HOUR = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });

/** The India-time hour of a Date (defaults to now). */
export function istHour(d: Date = new Date()): number {
  const h = Number(HOUR.format(d));
  return Number.isFinite(h) ? h % 24 : 12;
}

/** A Postgres timestamptz ("2026-09-24 08:15:00+00", "…T08:15:00.1+00:00", "…Z") as a Date, or null. */
export function parseTimestamp(createdAt: string | null | undefined): Date | null {
  if (!createdAt) return null;
  const raw = createdAt.trim().replace(" ", "T");
  // "…+00:00", "…+00", "…Z" carry a zone; a bare timestamp is UTC.
  const d = new Date(/(Z|[+-]\d\d(:?\d\d)?)$/i.test(raw) ? raw.replace(/([+-]\d\d)$/, "$1:00") : `${raw}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The India-time hour of a Postgres timestamptz, or null when unreadable. */
export function hourOfTimestamp(createdAt: string | null | undefined): number | null {
  const d = parseTimestamp(createdAt);
  return d ? istHour(d) : null;
}

/**
 * v2.8: whether a meal came from the AI (a parsed sentence, a plate photo or a scan) — only those
 * ask "AI right?" in the editor. Preset / search taps are table rows at confidence 1; parsed rows carry the model's confidence (or none).
 */
export function aiLogged(meal: Pick<Meal, "items"> & { photo_path?: string | null }): boolean {
  if (meal.photo_path) return true;
  return meal.items.some((i) => i.source === "estimated" || i.source === "scan" || i.confidence == null || Number(i.confidence) < 1);
}

/** The default type for a meal being logged now. */
export function defaultMealType(now: Date = new Date()): MealType {
  return mealTypeForHour(istHour(now));
}

/** A saved meal's type: its column when set, else the hour rule on when it was logged (column missing / null). */
export function mealTypeOf(meal: Pick<Meal, "created_at"> & { meal_type?: string | null }): MealType {
  if (isMealType(meal.meal_type)) return meal.meal_type;
  const h = hourOfTimestamp(meal.created_at);
  return mealTypeForHour(h ?? 12);
}

export type MealSection<M> = { type: MealType; label: string; emoji: string; meals: M[]; kcal: number; protein: number };

/** Meals grouped into the four sections, in Home's order; each section's meals oldest first. */
export function groupMeals<M extends Meal>(meals: M[]): MealSection<M>[] {
  return MEAL_TYPES.map((t) => {
    const list = meals.filter((m) => mealTypeOf(m) === t.key).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    const items = list.flatMap((m) => m.items);
    return {
      type: t.key,
      label: t.label,
      emoji: t.emoji,
      meals: list,
      kcal: Math.round(items.reduce((a, i) => a + Number(i.calories || 0), 0)),
      protein: Math.round(items.reduce((a, i) => a + Number(i.protein_g || 0), 0) * 10) / 10,
    };
  });
}

/** A PostgREST / Postgres error that means "the meal_type column isn't there yet" (schema_v30 not applied). */
export function missingMealTypeColumn(error: { message?: string; code?: string; details?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return /meal_type/i.test(text) && (error.code === "42703" || error.code === "PGRST204" || /column|schema cache/i.test(text));
}
