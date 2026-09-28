"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { startFast } from "../nutrition-actions";
import { createFromTemplate, saveRoutine } from "../platformActions";
import { saveExercise } from "../actions";
import { isPresetKey } from "./fastingPresets";
import { HOME_TEMPLATES } from "./homeWorkouts";
import { findVariant, sportKcal, stepsBurn, STEP_PACES } from "./sports";
import { missingV43 } from "./schema";
import { today as todayIso } from "../dates";

/**
 * v2.18 coach stream server actions (web, cookie session). Thin wrappers over the existing actions
 * so the v2.13 fasting timer, routines and exercise log stay the single source of truth.
 */

type R = { ok: true } | { ok: false; error: string };

/** B10: start a fast from an Indian preset; tags the session's preset when schema_v43 is there. */
export async function startPresetFast(preset: string, hours: number, backdateMin = 0): Promise<R> {
  if (!isPresetKey(preset)) return { ok: false, error: "Unknown fast" };
  const back = Math.max(0, Math.min(24 * 60, Math.round(Number(backdateMin) || 0)));
  const r = await startFast(hours, back > 0 ? new Date(Date.now() - back * 60_000).toISOString() : undefined);
  if (!r.ok) return r;
  const supabase = await createClient();
  const { error } = await supabase.from("fasting_sessions").update({ preset }).eq("id", r.id);
  if (error && !missingV43(error)) return { ok: true }; // the fast runs either way; the tag is a nicety
  revalidatePath("/fasting");
  return { ok: true };
}

/** C1: a home / hostel / band plan into the routine planner (made active, like the gym templates). */
export async function createHomeRoutine(key: string): Promise<R> {
  const t = HOME_TEMPLATES.find((x) => x.key === key);
  if (!t) return createFromTemplate(key).then((x) => (x.ok ? { ok: true as const } : { ok: false as const, error: x.error }));
  const r = await saveRoutine({ name: t.name, days: t.days, activate: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** C3: log a sport preset or a step count to the exercise log (MET-priced). */
export async function logSport(input: { sport: string; variant: string; minutes: number; weightKg: number | null; date?: string }): Promise<R> {
  const hit = findVariant(input.sport, input.variant);
  if (!hit) return { ok: false, error: "Unknown sport" };
  const minutes = Math.max(5, Math.min(300, Math.round(input.minutes)));
  try {
    await saveExercise({
      date: input.date ?? todayIso(),
      activity_code: hit.variant.code,
      name: `${hit.sport.name} · ${hit.variant.label}`,
      minutes,
      intensity: hit.variant.met >= 7 ? "high" : hit.variant.met >= 5 ? "medium" : "low",
      kcal: sportKcal(hit.variant.met, input.weightKg, minutes),
      source: "manual",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't log it" };
  }
}

export async function logSteps(input: { steps: number; pace: string; weightKg: number | null; heightCm: number | null; date?: string }): Promise<R> {
  const steps = Math.round(input.steps);
  if (!(steps >= 100 && steps <= 100000)) return { ok: false, error: "Enter between 100 and 100,000 steps" };
  const pace = STEP_PACES.find((p) => p.key === input.pace)?.key ?? "brisk";
  const b = stepsBurn(steps, { weightKg: input.weightKg, heightCm: input.heightCm, pace });
  try {
    await saveExercise({ date: input.date ?? todayIso(), activity_code: "LI-17190", name: "Walking (steps)", minutes: b.minutes, intensity: pace === "fast" ? "high" : pace === "easy" ? "low" : "medium", kcal: b.kcal, source: "manual", steps, distance_km: b.km });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't log it" };
  }
}
