"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { ONBOARD_SKIP_COOKIE } from "./onboarding";
import { bandCode, bandIntensity, bandKcal, burnKcal } from "./burn";
import { rollupQuietly } from "./rollup";
import { adminClient } from "./apiAuth";
import { today as todayIso } from "./dates";
import type { Activity, DescribedExercise, FoodSearchHit, LeaderRow, MealItem, Profile, SavedMeal, SquadMember, SquadPost, WaterEntry, WaterVessel, WorkoutExercise, WorkoutKind } from "./types";
import { mealPostBody, prPostBody, workoutPostBody } from "./squadPosts";
import { fetchSquadPosts } from "./data";

/** v2.5: Compendium rows for the auto-burn of gym / bodyweight sessions. */
const LIFT_BURN: Record<"gym" | "bodyweight", { code: string; met: number; label: string }> = {
  gym: { code: "02050", met: 6, label: "Gym" },
  bodyweight: { code: "02020", met: 7.5, label: "Bodyweight" },
};

/** Keep only well-formed sets: a name, reps > 0 (whole), kg ≥ 0 or null. */
function cleanExercises(list: WorkoutExercise[] | null | undefined): WorkoutExercise[] {
  return (list ?? [])
    .map((x) => ({
      name: String(x?.name ?? "").trim().slice(0, 60),
      sets: (Array.isArray(x?.sets) ? x.sets : [])
        .map((st) => ({ kg: st?.kg == null || !Number.isFinite(Number(st.kg)) ? null : Math.max(0, Math.round(Number(st.kg) * 100) / 100), reps: Math.round(Number(st?.reps) || 0) }))
        .filter((st) => st.reps > 0)
        .slice(0, 30),
    }))
    .filter((x) => x.name)
    .slice(0, 40);
}

async function userOrThrow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

/**
 * What the workout actions hand back. They never throw for a database failure: Next hides thrown
 * Server Action messages in production ("An error occurred in the Server Components render..."),
 * which is how a failed save used to look like nothing happened. The Supabase error text comes
 * back in `error` (and is console.error'd on the server) so the form can show it.
 */
export type ActionResult = { ok: true; id?: string; warning?: string } | { ok: false; error: string };

function describe(error: { message?: string; code?: string; details?: string | null; hint?: string | null }) {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ") + (error.code ? ` (${error.code})` : "");
}

export async function saveWorkout(input: {
  id?: string;
  date: string;
  muscles: string[];
  band_level: string;
  resistance_kg: number | null;
  minutes: number | null;
  exercises: string;
  notes: string;
  /** v2.5: gym | bodyweight | bands (cardio / sport / yoga go through the exercise log). Default bands. */
  kind?: WorkoutKind;
  exercises_json?: WorkoutExercise[] | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out — sign in again, then save." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick a valid date for this workout." };
  const kind: WorkoutKind = input.kind ?? "bands";
  const lift = kind === "gym" || kind === "bodyweight" ? kind : null;
  const exercisesJson = lift ? cleanExercises(input.exercises_json) : null;
  if (lift && !exercisesJson?.length) return { ok: false, error: "Add at least one exercise" };
  if (!lift && !input.muscles.length) return { ok: false, error: "Pick at least one muscle" };
  const { id: _id, ...fields } = input;
  void _id;
  const row = { ...fields, muscles: input.muscles.length ? input.muscles : ["Other"], kind, exercises_json: exercisesJson, user_id: user.id };
  const before = input.id ? ((await supabase.from("workouts").select("date").eq("id", input.id).maybeSingle()).data?.date as string | undefined) : undefined;
  const { data, error } = input.id
    ? await supabase.from("workouts").update(row).eq("id", input.id).eq("user_id", user.id).select("id").single()
    : await supabase.from("workouts").insert(row).select("id").single();
  if (error) {
    console.error("[saveWorkout] workouts write failed", { user: user.id, id: input.id ?? null, date: input.date, error });
    return { ok: false, error: `Couldn't save the workout: ${describe(error)}` };
  }
  const workoutId = (data?.id as string | undefined) ?? input.id;
  // Auto-burn: one exercise_log row per workout, tagged with the workout id in `note`. An edit
  // replaces the row so minutes / band changes flow through to the burn. The workout itself is
  // saved by now, so a failure here is a warning, not a failed save — but it is never silent.
  let warning: string | undefined;
  if (workoutId) {
    try {
      if (input.id) {
        const del = await supabase.from("exercise_log").delete().eq("user_id", user.id).eq("source", "workout").eq("note", workoutId);
        if (del.error) console.error("[saveWorkout] old burn row delete failed", { workoutId, error: del.error });
      }
      const { data: prof } = await supabase.from("profiles").select("weight_kg").eq("id", user.id).maybeSingle();
      const weight = prof?.weight_kg == null ? null : Number(prof.weight_kg);
      const minutes = Math.max(1, input.minutes ?? (lift ? 45 : 30));
      const burn = await supabase.from("exercise_log").insert(
        lift
          ? {
              user_id: user.id,
              date: input.date,
              activity_code: LIFT_BURN[lift].code,
              name: `${LIFT_BURN[lift].label}: ${(exercisesJson ?? []).map((x) => x.name).slice(0, 4).join(", ")}`,
              minutes,
              intensity: "medium",
              kcal: burnKcal(LIFT_BURN[lift].met, weight, minutes),
              source: "workout",
              note: workoutId,
            }
          : {
              user_id: user.id,
              date: input.date,
              activity_code: bandCode(input.band_level),
              name: `Bands: ${input.muscles.join(", ")}`,
              minutes,
              intensity: bandIntensity(input.band_level),
              kcal: bandKcal(input.band_level, weight, minutes),
              source: "workout",
              note: workoutId,
            },
      );
      if (burn.error) {
        console.error("[saveWorkout] burn row insert failed", { workoutId, error: burn.error });
        warning = `Workout saved, but its calories burned didn't: ${describe(burn.error)}`;
      }
    } catch (e) {
      console.error("[saveWorkout] burn row threw", e);
      warning = "Workout saved, but its calories burned didn't.";
    }
  }
  await rollupQuietly(supabase, user.id, before && before !== input.date ? [input.date, before] : [input.date]);
  if (workoutId) await postWorkoutToSquads(supabase, user.id, workoutId, kind, exercisesJson, input.muscles, input.minutes);
  revalidatePath("/", "layout");
  return { ok: true, id: workoutId, warning };
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're signed out — sign in again." };
  const date = (await supabase.from("workouts").select("date").eq("id", id).maybeSingle()).data?.date as string | undefined;
  const burn = await supabase.from("exercise_log").delete().eq("user_id", user.id).eq("source", "workout").eq("note", id);
  if (burn.error) console.error("[deleteWorkout] burn row delete failed", { id, error: burn.error });
  const { error } = await supabase.from("workouts").delete().eq("id", id).eq("user_id", user.id);
  if (!error) await supabase.from("group_posts").delete().eq("user_id", user.id).eq("ref_id", id);
  if (error) {
    console.error("[deleteWorkout] failed", { id, error });
    return { ok: false, error: `Couldn't delete the workout: ${describe(error)}` };
  }
  await rollupQuietly(supabase, user.id, date ? [date] : []);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- exercise log (calories burned) ----

export async function saveExercise(input: {
  date: string;
  activity_code: string | null;
  name: string;
  minutes: number;
  intensity: "low" | "medium" | "high";
  kcal: number;
  source: "manual" | "describe";
  /** v2.3 details: ISO timestamp, 0–100 slider, km, steps, free text. */
  started_at?: string | null;
  intensity_pct?: number | null;
  distance_km?: number | null;
  steps?: number | null;
  note?: string;
}) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("exercise_log").insert({
    user_id: user.id,
    date: input.date,
    activity_code: input.activity_code,
    name: input.name,
    minutes: Math.max(1, Math.round(input.minutes)),
    intensity: input.intensity,
    kcal: Math.round(input.kcal * 10) / 10,
    source: input.source,
    note: (input.note ?? "").trim().slice(0, 200),
    started_at: input.started_at ?? null,
    intensity_pct: input.intensity_pct == null ? null : Math.max(0, Math.min(100, Math.round(input.intensity_pct))),
    distance_km: input.distance_km == null || !(input.distance_km > 0) ? null : Math.round(input.distance_km * 100) / 100,
    steps: input.steps == null || !(input.steps > 0) ? null : Math.round(input.steps),
  });
  if (error) throw new Error(error.message);
  await rollupQuietly(supabase, user.id, [input.date]);
  revalidatePath("/", "layout");
}

/** Every activity Haiku found in a description, saved as its own row. */
export async function saveDescribedExercises(date: string, items: DescribedExercise[]) {
  const { supabase, user } = await userOrThrow();
  const rows = items
    .filter((i) => i.kcal > 0)
    .map((i) => ({
      user_id: user.id,
      date,
      activity_code: i.activity_code,
      name: i.name,
      minutes: Math.max(1, Math.round(i.minutes)),
      intensity: i.intensity,
      kcal: Math.round(i.kcal * 10) / 10,
      source: "describe",
      note: "",
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("exercise_log").insert(rows);
  if (error) throw new Error(error.message);
  await rollupQuietly(supabase, user.id, [date]);
  revalidatePath("/", "layout");
}

export async function deleteExercise(id: string) {
  const { supabase, user } = await userOrThrow();
  const date = (await supabase.from("exercise_log").select("date").eq("id", id).maybeSingle()).data?.date as string | undefined;
  const { error } = await supabase.from("exercise_log").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await rollupQuietly(supabase, user.id, date ? [date] : []);
  revalidatePath("/", "layout");
}

/** Codes shown before the user types anything: the everyday picks. */
const POPULAR_ACTIVITIES = ["LI-17190", "LI-17200", "LI-17133", "12150", "LI-15150", "LI-15030", "LI-02101", "LI-15551", "01015", "02020", "02040", "LI-05010"];

/** Activity search: name / description substring or an exact tag. Blank query → the popular set. */
export async function searchActivities(q: string): Promise<Activity[]> {
  const { supabase } = await userOrThrow();
  const term = q.trim().toLowerCase().replace(/[^a-z0-9 -]/g, "");
  const cols = "code, name, description, met, category, tags";
  if (!term) {
    const { data } = await supabase.from("activities").select(cols).in("code", POPULAR_ACTIVITIES);
    const rows = (data ?? []) as Activity[];
    return rows.map((r) => ({ ...r, met: Number(r.met), tags: r.tags ?? [] })).sort((a, b) => POPULAR_ACTIVITIES.indexOf(a.code) - POPULAR_ACTIVITIES.indexOf(b.code));
  }
  const { data } = await supabase
    .from("activities")
    .select(cols)
    .or(`name.ilike.*${term}*,description.ilike.*${term}*,tags.cs.{${term}}`)
    .order("name")
    .order("met")
    .limit(40);
  return ((data ?? []) as Activity[]).map((r) => ({ ...r, met: Number(r.met), tags: r.tags ?? [] }));
}

export async function saveMeal(input: { date: string; raw_text: string; items: MealItem[]; photo_path?: string | null }) {
  const { supabase, user } = await userOrThrow();
  const { data: meal, error } = await supabase
    .from("meals")
    .insert({ user_id: user.id, date: input.date, raw_text: input.raw_text, photo_path: input.photo_path ?? null })
    .select("id")
    .single();
  if (error || !meal) throw new Error(error?.message ?? "Could not save meal");
  const items = input.items
    .filter((i) => i.grams > 0)
    .map((i) => ({
      meal_id: meal.id,
      user_id: user.id,
      food_id: i.food_id,
      name: i.name,
      grams: i.grams,
      calories: i.calories,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
      source: i.source,
      confidence: i.confidence,
      micros: i.micros ?? {},
      unit: i.unit ?? null,
      servings: i.servings ?? null,
      cooked_in: i.cooked_in ?? null,
    }));
  if (items.length) {
    const { error: e2 } = await supabase.from("meal_items").insert(items);
    if (e2) throw new Error(e2.message);
  }
  await rollupQuietly(supabase, user.id, [input.date]);
  await postMealToSquads(supabase, user.id, meal.id as string, mealPostBody(items, input.raw_text), input.photo_path ?? null);
  revalidatePath("/", "layout");
}

export async function deleteMeal(id: string) {
  const { supabase, user } = await userOrThrow();
  const date = (await supabase.from("meals").select("date").eq("id", id).maybeSingle()).data?.date as string | undefined;
  const { error } = await supabase.from("meals").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await supabase.from("group_posts").delete().eq("user_id", user.id).eq("ref_id", id);
  await rollupQuietly(supabase, user.id, date ? [date] : []);
  revalidatePath("/", "layout");
}

// ---- profile ----

/** Columns a client may write; anything else in the patch is dropped. */
const PROFILE_KEYS: (keyof Profile)[] = [
  "weekly_workout_target",
  "protein_target_g",
  "calorie_target",
  "name",
  "dob",
  "gender",
  "height_cm",
  "weight_kg",
  "goal_weight_kg",
  "goal_type",
  "goal_speed_kg_wk",
  "step_goal",
  "carb_target_g",
  "fat_target_g",
  "reminders",
  "lens_default",
  "share_stats",
  "fiber_target",
  "sugar_target",
  "add_burned_to_goal",
  "rollover_calories",
  "water_goal_ml",
  "units",
  "water_glass_ml",
  "water_reminder_from",
  "water_reminder_to",
  "water_reminder_every_min",
];

/** Upserts the given profile columns for the signed-in user (a partial patch is fine). */
export async function saveProfile(patch: Partial<Profile>) {
  const { supabase, user } = await userOrThrow();
  const row: Record<string, unknown> = { id: user.id };
  for (const k of PROFILE_KEYS) if (k in patch) row[k] = patch[k];
  if (typeof row.name === "string") row.name = row.name.trim().slice(0, 40);
  if ("water_reminder_every_min" in row && ![0, 30, 60, 120, 180, 240].includes(Number(row.water_reminder_every_min))) throw new Error("Pick a reminder interval from the list");
  for (const k of ["water_reminder_from", "water_reminder_to"] as const) if (k in row && !/^\d{2}:\d{2}$/.test(String(row[k]))) throw new Error("Pick a valid time");
  if ("water_glass_ml" in row) row.water_glass_ml = Math.max(50, Math.min(2000, Math.round(Number(row.water_glass_ml) || 250)));
  if ("water_goal_ml" in row) row.water_goal_ml = Math.max(250, Math.min(10000, Math.round(Number(row.water_goal_ml) || 2500)));
  const { error } = await supabase.from("profiles").upsert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Kept for older callers: the three classic targets. */
export async function saveTargets(p: Pick<Profile, "weekly_workout_target" | "protein_target_g" | "calorie_target">) {
  await saveProfile(p);
}

/** Onboarding's last screen: the whole profile plus the generated targets, in one go. */
export async function completeOnboarding(patch: Partial<Profile>) {
  await saveProfile(patch);
  const jar = await cookies();
  jar.delete(ONBOARD_SKIP_COOKIE);
}

/** "Skip for now": stay out of onboarding for 30 days on this device. */
export async function skipOnboarding() {
  const jar = await cookies();
  jar.set(ONBOARD_SKIP_COOKIE, "1", { maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", httpOnly: true });
}

// ---- weight log ----

/** Logs a weigh-in and mirrors it onto `profiles.weight_kg` so every screen agrees. */
export async function logWeight(input: { date: string; weight_kg: number; note: string }) {
  const { supabase, user } = await userOrThrow();
  const kg = Math.round(Number(input.weight_kg) * 10) / 10;
  if (!Number.isFinite(kg) || kg < 20 || kg > 300) throw new Error("Enter a weight between 20 and 300 kg");
  const { error } = await supabase.from("weight_log").insert({ user_id: user.id, date: input.date, weight_kg: kg, note: input.note.trim().slice(0, 80) || null });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from("profiles").upsert({ id: user.id, weight_kg: kg });
  if (e2) throw new Error(e2.message);
  revalidatePath("/", "layout");
}

export async function deleteWeight(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("weight_log").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/** Repeat meals: the one-tap cards at the top of the Meal form. */
export async function listSavedMeals(): Promise<SavedMeal[]> {
  const { supabase, user } = await userOrThrow();
  const { data, error } = await supabase
    .from("saved_meals")
    .select("id, name, items, calories, protein_g, image_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name ?? "") as string,
    items: ((r.items ?? []) as MealItem[]),
    calories: Number(r.calories ?? 0),
    protein_g: Number(r.protein_g ?? 0),
    image_url: (r.image_url as string | null) ?? null,
  }));
}

export async function createSavedMeal(input: { name: string; items: MealItem[] }) {
  const { supabase, user } = await userOrThrow();
  const calories = input.items.reduce((a, i) => a + Number(i.calories), 0);
  const protein = input.items.reduce((a, i) => a + Number(i.protein_g), 0);
  const { error } = await supabase.from("saved_meals").insert({
    user_id: user.id,
    name: input.name,
    items: input.items,
    calories: Math.round(calories * 10) / 10,
    protein_g: Math.round(protein * 10) / 10,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteSavedMeal(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("saved_meals").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

/**
 * Food picker search over bandlog.foods (the same trigram RPC the parser uses), as the signed-in
 * user. Returns per-100 g numbers plus the row's household units so the Quantity sheet can offer
 * real serving sizes. Hinglish and Devanagari both match because search_text carries names_local.
 */
export async function searchFoodsForPicker(q: string, limit = 12): Promise<FoodSearchHit[]> {
  const { supabase } = await userOrThrow();
  const key = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (key.length < 2) return [];
  const { data, error } = await supabase.rpc("search_foods", { q: key, n: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    name_hi: ((r.names_local as Record<string, string> | null)?.hi as string | undefined) ?? null,
    calories: Number(r.calories ?? 0),
    protein_g: Number(r.protein_g ?? 0),
    carbs_g: Number(r.carbs_g ?? 0),
    fat_g: Number(r.fat_g ?? 0),
    source: String(r.source ?? "custom"),
    units: Array.isArray(r.units) ? (r.units as { name: string; grams: number }[]).map((u) => ({ label: u.name, grams: Number(u.grams) })) : [],
    micros: {
      ...((r.micros ?? {}) as Record<string, number>),
      ...(r.fiber_g != null ? { fiber_g: Number(r.fiber_g) } : {}),
      ...(r.sugar_g != null ? { sugar_g: Number(r.sugar_g) } : {}),
      ...(r.sodium_mg != null ? { sodium_mg: Number(r.sodium_mg) } : {}),
    },
    score: Number(r.score ?? 0),
  }));
}

/** Remove one scan from History. */
export async function deleteScan(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("label_scans").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/scan");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---- v2.0: squads ----

/** The name a squad-mate sees: the profile name, else the email's local part. */
async function myDisplayName(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string }) {
  const { data } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name || (user.email ?? "").split("@")[0] || "Member";
}

/** Create a squad (server generates the 6-letter code); the creator is the owner and first member. */
export async function createSquad(name: string): Promise<{ id: string; code: string }> {
  const { supabase, user } = await userOrThrow();
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Give the squad a name");
  const { data, error } = await supabase.rpc("create_group", { p_name: clean, p_display: await myDisplayName(supabase, user) });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; code: string } | null;
  if (!row) throw new Error("Could not create the squad");
  revalidatePath("/squad");
  return row;
}

/** Join with a 6-letter code. */
export async function joinSquad(code: string): Promise<string> {
  const { supabase, user } = await userOrThrow();
  const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (clean.length !== 6) throw new Error("Codes are 6 letters, like LOCK7Q");
  const { data, error } = await supabase.rpc("join_group", { p_code: clean, p_name: await myDisplayName(supabase, user) });
  if (error) throw new Error(error.message.includes("No group") ? "No squad with that code" : error.message);
  revalidatePath("/squad");
  return data as string;
}

/** Leave (the last one out deletes the squad; an owner hands it to the longest-standing member). */
export async function leaveSquad(groupId: string) {
  const { supabase } = await userOrThrow();
  const { error } = await supabase.rpc("leave_group", { g: groupId });
  if (error) throw new Error(error.message);
  revalidatePath("/squad");
}

/** Owner only (RLS): rename the squad. */
export async function renameSquad(groupId: string, name: string) {
  const { supabase, user } = await userOrThrow();
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Give the squad a name");
  const { data, error } = await supabase.from("groups").update({ name: clean }).eq("id", groupId).eq("owner_id", user.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only the squad's owner can rename it");
  revalidatePath("/squad");
}

/** The board for one squad (members + last 7 days), for client-side switching between squads. */
export async function loadSquadBoard(groupId: string): Promise<SquadMember[]> {
  const { supabase } = await userOrThrow();
  const { data, error } = await supabase.rpc("squad_board", { g: groupId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SquadMember[]).map((m) => ({
    ...m,
    days: (m.days ?? []).map((d) => ({
      ...d,
      protein_g: d.protein_g == null ? null : Number(d.protein_g),
      calories: d.calories == null ? null : Number(d.calories),
      burned: d.burned == null ? null : Number(d.burned),
      meals: d.meals == null ? null : Number(d.meals),
      week_streak: Number(d.week_streak ?? 0),
    })),
  }));
}

/** Nudge a squad-mate who hasn't trained today. One per person per day is plenty. */
export async function nudgeMember(groupId: string, toUser: string) {
  const { supabase, user } = await userOrThrow();
  if (toUser === user.id) throw new Error("You can't nudge yourself");
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: recent } = await supabase.from("nudges").select("id").eq("from_user", user.id).eq("to_user", toUser).gte("created_at", since).limit(1);
  if (recent?.length) return { already: true };
  const { error } = await supabase.from("nudges").insert({ group_id: groupId, from_user: user.id, to_user: toUser, kind: "nudge" });
  if (error) throw new Error(error.message);
  return { already: false };
}

// ---- v2.3: water ----

/** Log a glass / bottle of water for `date` (defaults to today, IST). One row per tap; returns it. */
export async function logWater(ml: number, date?: string, vessel?: WaterVessel | null): Promise<WaterEntry> {
  const { supabase, user } = await userOrThrow();
  const amount = Math.round(Number(ml));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) throw new Error("Enter between 1 and 5000 mL");
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();
  const v = vessel && ["glass", "bottle", "large", "custom"].includes(vessel) ? vessel : null;
  const { data, error } = await supabase.from("water_log").insert({ user_id: user.id, date: day, ml: amount, vessel: v }).select("id, date, ml, created_at, vessel").single();
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return { id: data.id as string, date: data.date as string, ml: Number(data.ml), created_at: data.created_at as string, vessel: (data.vessel as WaterVessel | null) ?? null };
}

/** The water page's −: removes the latest row logged for `date` (an undo). Returns its id, or null. */
export async function undoLastWater(date?: string): Promise<string | null> {
  const { supabase, user } = await userOrThrow();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();
  const { data } = await supabase.from("water_log").select("id").eq("user_id", user.id).eq("date", day).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.id) return null;
  const { error } = await supabase.from("water_log").delete().eq("id", data.id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data.id as string;
}

export async function deleteWater(id: string) {
  const { supabase, user } = await userOrThrow();
  const { error } = await supabase.from("water_log").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- v2.3: progress photos ----

/**
 * Upload a progress photo (already resized to <= 1024 px JPEG in the browser, sent as bare base64)
 * to progress-photos/<uid>/<date>-<ts>.jpg with the service-role client, then add the row.
 */
export async function uploadProgressPhoto(input: { base64: string; date?: string; note?: string }): Promise<ActionResult> {
  const { supabase, user } = await userOrThrow();
  const day = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayIso();
  const bytes = Buffer.from(input.base64 || "", "base64");
  if (bytes.length < 100) return { ok: false, error: "That photo looks empty — try another one." };
  if (bytes.length > 3_000_000) return { ok: false, error: "That photo is too large." };
  const path = `${user.id}/${day}-${Date.now()}.jpg`;
  const admin = adminClient();
  const up = await admin.storage.from("progress-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (up.error) {
    console.error("[uploadProgressPhoto] storage failed", up.error);
    return { ok: false, error: `Couldn't upload the photo: ${up.error.message}` };
  }
  const { error } = await supabase.from("progress_photos").insert({ user_id: user.id, date: day, path, note: (input.note ?? "").trim().slice(0, 120) || null });
  if (error) {
    await admin.storage.from("progress-photos").remove([path]);
    return { ok: false, error: `Couldn't save the photo: ${describe(error)}` };
  }
  revalidatePath("/progress");
  return { ok: true };
}

export async function deleteProgressPhoto(id: string) {
  const { supabase, user } = await userOrThrow();
  const { data } = await supabase.from("progress_photos").select("path").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("progress_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  if (data?.path) await adminClient().storage.from("progress-photos").remove([data.path as string]);
  revalidatePath("/progress");
}

// ---- v2.3: public squads ----

export async function joinPublicSquad(groupId: string): Promise<string> {
  const { supabase } = await userOrThrow();
  const { error } = await supabase.rpc("join_public_group", { g: groupId });
  if (error) throw new Error(error.message);
  revalidatePath("/squad");
  return groupId;
}

// ---- v2.6: squad feed auto-posts ----

type Sb = Awaited<ReturnType<typeof createClient>>;

/** Is the user in any squad and sharing more than streaks? (No squads → no posts, no photo copies.) */
async function postsWanted(supabase: Sb, userId: string) {
  const [{ data: member }, { data: prof }] = await Promise.all([
    supabase.from("group_members").select("group_id").eq("user_id", userId).limit(1),
    supabase.from("profiles").select("share_stats").eq("id", userId).maybeSingle(),
  ]);
  return !!member?.length && prof?.share_stats !== false;
}

/** "Ayaan logged Dal + 2 roti · 420 kcal" on every squad; the plate photo is copied into group-photos. Never throws. */
async function postMealToSquads(supabase: Sb, userId: string, mealId: string, body: string, photoPath: string | null) {
  try {
    if (!(await postsWanted(supabase, userId))) return;
    let groupPhoto: string | null = null;
    if (photoPath) {
      const dest = `${userId}/meal-${mealId}.jpg`;
      const copy = await supabase.storage.from("meal-photos").copy(photoPath, dest, { destinationBucket: "group-photos" });
      if (copy.error) console.error("[postMealToSquads] photo copy failed", copy.error);
      else groupPhoto = dest;
    }
    const { error } = await supabase.rpc("post_to_my_groups", { p_kind: "meal", p_body: body, p_ref: mealId, p_photo: groupPhoto });
    if (error) console.error("[postMealToSquads]", error);
  } catch (e) {
    console.error("[postMealToSquads] threw", e);
  }
}

/** "Gym · 5 exercises · 42 min", plus a PR post when a lift beats every earlier session. Never throws. */
async function postWorkoutToSquads(supabase: Sb, userId: string, workoutId: string, kind: WorkoutKind, exercises: WorkoutExercise[] | null, muscles: string[], minutes: number | null) {
  try {
    if (!(await postsWanted(supabase, userId))) return;
    const { error } = await supabase.rpc("post_to_my_groups", { p_kind: "workout", p_body: workoutPostBody(kind, exercises, muscles, minutes), p_ref: workoutId, p_photo: null });
    if (error) console.error("[postWorkoutToSquads]", error);
    if (kind !== "gym" || !exercises?.length) return;
    const { data: prev } = await supabase.from("workouts").select("exercises_json").eq("user_id", userId).eq("kind", "gym").neq("id", workoutId).order("date", { ascending: false }).limit(200);
    const pr = prPostBody(exercises, (prev ?? []).map((r) => (r.exercises_json as WorkoutExercise[] | null) ?? null));
    if (pr) {
      const res = await supabase.rpc("post_to_my_groups", { p_kind: "pr", p_body: pr, p_ref: workoutId, p_photo: null });
      if (res.error) console.error("[postWorkoutToSquads] pr", res.error);
    }
  } catch (e) {
    console.error("[postWorkoutToSquads] threw", e);
  }
}

// ---- v2.6: usernames ----

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function checkUsername(u: string): Promise<boolean> {
  const { supabase } = await userOrThrow();
  const clean = u.trim().toLowerCase();
  if (!USERNAME_RE.test(clean)) return false;
  const { data, error } = await supabase.rpc("username_available", { u: clean });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function saveUsername(u: string): Promise<ActionResult> {
  const { supabase, user } = await userOrThrow();
  const clean = u.trim().toLowerCase();
  if (!USERNAME_RE.test(clean)) return { ok: false, error: "3–20 characters: letters, numbers and _ only" };
  const { error } = await supabase.from("profiles").update({ username: clean }).eq("id", user.id);
  if (error) return { ok: false, error: error.code === "23505" ? "That username was just taken — try another" : describe(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- v2.6: squads v2 ----

/** Create flow: name + description + icon + public/private, then the new columns on the fresh row. */
export async function createSquadV2(input: { name: string; description: string; icon: string | null; isPublic: boolean; coverUrl?: string | null }): Promise<{ id: string; code: string }> {
  const { supabase, user } = await userOrThrow();
  const clean = input.name.trim().slice(0, 40);
  if (!clean) throw new Error("Give the squad a name");
  const { data, error } = await supabase.rpc("create_group", { p_name: clean, p_display: await myDisplayName(supabase, user) });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; code: string } | null;
  if (!row) throw new Error("Could not create the squad");
  const { error: e2 } = await supabase
    .from("groups")
    .update({
      description: input.description.trim().slice(0, 200) || null,
      icon: input.icon,
      cover_url: input.coverUrl ?? null,
      is_public: input.isPublic,
      join_policy: input.isPublic ? "open" : "request",
      tagline: input.description.trim().slice(0, 80) || null,
    })
    .eq("id", row.id)
    .eq("owner_id", user.id);
  if (e2) console.error("[createSquadV2] details update failed", e2);
  revalidatePath("/squad");
  return row;
}

/** Owner only: edit name / description / icon / public-private. */
export async function updateSquad(groupId: string, patch: { name?: string; description?: string; icon?: string | null; coverUrl?: string | null; isPublic?: boolean }) {
  const { supabase, user } = await userOrThrow();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 40);
    if (!n) throw new Error("Give the squad a name");
    row.name = n;
  }
  if (patch.description !== undefined) {
    row.description = patch.description.trim().slice(0, 200) || null;
    row.tagline = patch.description.trim().slice(0, 80) || null;
  }
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.coverUrl !== undefined) row.cover_url = patch.coverUrl;
  if (patch.isPublic !== undefined) {
    row.is_public = patch.isPublic;
    row.join_policy = patch.isPublic ? "open" : "request";
  }
  const { data, error } = await supabase.from("groups").update(row).eq("id", groupId).eq("owner_id", user.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only the owner can change this squad");
  revalidatePath("/squad", "layout");
}

/** Join an open squad now, or ask to join a private one: "member" | "joined" | "requested". */
export async function requestJoin(groupId: string): Promise<"member" | "joined" | "requested"> {
  const { supabase } = await userOrThrow();
  const { data, error } = await supabase.rpc("request_join", { g: groupId });
  if (error) throw new Error(error.message);
  revalidatePath("/squad", "layout");
  return (data as "member" | "joined" | "requested") ?? "requested";
}

export async function approveJoin(requestId: string) {
  const { supabase } = await userOrThrow();
  const { error } = await supabase.rpc("approve_join", { req: requestId });
  if (error) throw new Error(error.message);
  revalidatePath("/squad", "layout");
}

export async function declineJoin(requestId: string) {
  const { supabase } = await userOrThrow();
  const { error } = await supabase.rpc("decline_join", { req: requestId });
  if (error) throw new Error(error.message);
  revalidatePath("/squad", "layout");
}

/** Chat (kinds = ["message"]) or Feed (the rest), newest first — the 5 s poll. */
export async function loadSquadPosts(groupId: string, kinds: string[] | null, before: string | null = null): Promise<SquadPost[]> {
  const { supabase } = await userOrThrow();
  return fetchSquadPosts(supabase, groupId, kinds, before);
}

export async function sendSquadMessage(groupId: string, body: string): Promise<ActionResult> {
  const { supabase, user } = await userOrThrow();
  const text = body.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Type a message first" };
  const { data, error } = await supabase.from("group_posts").insert({ group_id: groupId, user_id: user.id, kind: "message", body: text }).select("id").single();
  if (error) return { ok: false, error: describe(error) };
  return { ok: true, id: data.id as string };
}

/** A photo post (<= 1280 px JPEG as bare base64) to one squad's feed, with an optional caption. */
export async function postSquadPhoto(groupId: string, base64: string, caption: string): Promise<ActionResult> {
  const { supabase, user } = await userOrThrow();
  const bytes = Buffer.from(base64 || "", "base64");
  if (bytes.length < 100) return { ok: false, error: "That photo looks empty — try another one." };
  if (bytes.length > 3_000_000) return { ok: false, error: "That photo is too large." };
  const path = `${user.id}/${groupId}-${Date.now()}.jpg`;
  const up = await supabase.storage.from("group-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (up.error) return { ok: false, error: `Couldn't upload the photo: ${up.error.message}` };
  const { error } = await supabase.from("group_posts").insert({ group_id: groupId, user_id: user.id, kind: "photo", body: caption.trim().slice(0, 300), photo_path: path });
  if (error) {
    await supabase.storage.from("group-photos").remove([path]);
    return { ok: false, error: describe(error) };
  }
  return { ok: true };
}

export async function deleteSquadPost(id: string) {
  const { supabase } = await userOrThrow();
  const { error } = await supabase.from("group_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadLeaderboard(groupId: string): Promise<LeaderRow[]> {
  const { supabase } = await userOrThrow();
  const { data, error } = await supabase.rpc("group_leaderboard", { g: groupId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LeaderRow[]).map((r) => ({ ...r, rank: Number(r.rank), flames: Number(r.flames ?? 0), week_points: Number(r.week_points ?? 0) }));
}
