"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { rollupQuietly } from "./rollup";
import { today as todayIso } from "./dates";
import type { ExerciseEntry, WaterEntry, WaterVessel } from "./types";

/**
 * v2.8 logging: edit anything you logged. Exercise rows, water rows and weigh-ins get an update
 * next to the existing insert / delete in actions.ts; the FAB's one-tap glass lives here too.
 */

async function userOrThrow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

const EXERCISE_COLS = "id, date, activity_code, name, minutes, intensity, kcal, source, note, created_at, started_at, intensity_pct, distance_km, steps";

/** One exercise_log row, for the Log activity editor (`/log?exercise=<id>`). */
export async function getExercise(id: string): Promise<ExerciseEntry | null> {
  const { supabase } = await userOrThrow();
  const { data } = await supabase.from("exercise_log").select(EXERCISE_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return {
    ...data,
    kcal: Number(data.kcal),
    minutes: Number(data.minutes),
    note: data.note ?? "",
    intensity_pct: data.intensity_pct == null ? null : Number(data.intensity_pct),
    distance_km: data.distance_km == null ? null : Number(data.distance_km),
    steps: data.steps == null ? null : Number(data.steps),
  } as ExerciseEntry;
}

/** Saves an edited run / activity / manual burn in place, then reruns the daily_stats rollup. */
export async function updateExercise(
  id: string,
  input: {
    activity_code: string | null;
    name: string;
    minutes: number;
    intensity: "low" | "medium" | "high";
    kcal: number;
    intensity_pct?: number | null;
    started_at?: string | null;
    distance_km?: number | null;
    steps?: number | null;
    note?: string;
  },
) {
  const { supabase, user } = await userOrThrow();
  const date = (await supabase.from("exercise_log").select("date").eq("id", id).eq("user_id", user.id).maybeSingle()).data?.date as string | undefined;
  const base = {
    activity_code: input.activity_code,
    name: input.name.trim().slice(0, 120) || "Exercise",
    minutes: Math.max(1, Math.round(input.minutes)),
    intensity: input.intensity,
    kcal: Math.round(input.kcal * 10) / 10,
    note: (input.note ?? "").trim().slice(0, 200),
  };
  const extras = {
    started_at: input.started_at ?? null,
    intensity_pct: input.intensity_pct == null ? null : Math.max(0, Math.min(100, Math.round(input.intensity_pct))),
    distance_km: input.distance_km == null || !(input.distance_km > 0) ? null : Math.round(input.distance_km * 100) / 100,
    steps: input.steps == null || !(input.steps > 0) ? null : Math.round(input.steps),
  };
  let { error } = await supabase.from("exercise_log").update({ ...base, ...extras }).eq("id", id).eq("user_id", user.id);
  // An older database without the v2.3 columns: save the burn without the extras.
  if (error && /column|PGRST204/i.test(`${error.message} ${error.code ?? ""}`)) ({ error } = await supabase.from("exercise_log").update(base).eq("id", id).eq("user_id", user.id));
  if (error) throw new Error(error.message);
  await rollupQuietly(supabase, user.id, date ? [date] : []);
  revalidatePath("/", "layout");
}

/** The FAB's Water action: one glass of the user's own size, logged for today. Undo deletes the returned row. */
export async function logDefaultGlass(): Promise<{ entry: WaterEntry; glassMl: number }> {
  const { supabase, user } = await userOrThrow();
  const { data: prof } = await supabase.from("profiles").select("water_glass_ml").eq("id", user.id).maybeSingle();
  const glassMl = Math.max(50, Math.min(2000, Math.round(Number(prof?.water_glass_ml) || 250)));
  const day = todayIso();
  let res = await supabase.from("water_log").insert({ user_id: user.id, date: day, ml: glassMl, vessel: "glass" }).select("id, date, ml, created_at").single();
  // The vessel column isn't there yet: log the glass without it.
  if (res.error && /vessel|column|PGRST204/i.test(`${res.error.message} ${res.error.code ?? ""}`)) res = await supabase.from("water_log").insert({ user_id: user.id, date: day, ml: glassMl }).select("id, date, ml, created_at").single();
  if (res.error || !res.data) throw new Error(res.error?.message ?? "Could not log water");
  revalidatePath("/", "layout");
  return { entry: { id: res.data.id as string, date: res.data.date as string, ml: Number(res.data.ml), created_at: res.data.created_at as string, vessel: "glass" }, glassMl };
}

/** Changes one water_log row's amount (and its vessel to "custom" when it no longer matches one). */
export async function updateWater(id: string, ml: number, vessel?: WaterVessel | null) {
  const { supabase, user } = await userOrThrow();
  const amount = Math.round(Number(ml));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) throw new Error("Enter between 1 and 5000 mL");
  let { error } = await supabase.from("water_log").update(vessel === undefined ? { ml: amount } : { ml: amount, vessel }).eq("id", id).eq("user_id", user.id);
  if (error && vessel !== undefined && /vessel|column|PGRST204/i.test(`${error.message} ${error.code ?? ""}`)) ({ error } = await supabase.from("water_log").update({ ml: amount }).eq("id", id).eq("user_id", user.id));
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Edits a weigh-in; when it's (still) the newest one, mirrors the kg onto `profiles.weight_kg`. */
export async function updateWeight(id: string, input: { date: string; weight_kg: number; note: string }) {
  const { supabase, user } = await userOrThrow();
  const kg = Math.round(Number(input.weight_kg) * 10) / 10;
  if (!Number.isFinite(kg) || kg < 20 || kg > 300) throw new Error("Enter a weight between 20 and 300 kg");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a valid date");
  const { error } = await supabase.from("weight_log").update({ date: input.date, weight_kg: kg, note: input.note.trim().slice(0, 80) || null }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  const { data: newest } = await supabase.from("weight_log").select("id, weight_kg").eq("user_id", user.id).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (newest?.id === id) {
    const { error: e2 } = await supabase.from("profiles").upsert({ id: user.id, weight_kg: kg });
    if (e2) throw new Error(e2.message);
  }
  revalidatePath("/", "layout");
}
