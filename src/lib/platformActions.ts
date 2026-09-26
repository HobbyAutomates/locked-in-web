"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { adminClient } from "./apiAuth";
import { today as todayIso } from "./dates";
import { MEASURES, POSES, measurementError, type MeasureKey, type Pose } from "./body";
import { isMissingSchema, type InboxItem } from "./notify";
import { TEMPLATES, normalizeDays, todaysDay, type Routine, type RoutineDay } from "./training";
import { loadInbox, loadPro, loadRoutines, loadUnread } from "./platform-data";

/**
 * v2.13 platform writes (body, photos, training, notifications). Separate from actions.ts so the
 * nutrition branch merges cleanly. Like the workout actions, these return `{ ok: false, error }`
 * instead of throwing (Next hides thrown messages in production); `schema: false` means
 * schema_v36 isn't applied yet.
 */

export type PResult = { ok: true; id?: string } | { ok: false; error: string; schema?: false };

const COMING = "This needs the next server update. It's coming soon.";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function fail(error: { message?: string; code?: string } | null | undefined, what: string): PResult {
  if (isMissingSchema(error)) return { ok: false, error: COMING, schema: false };
  console.error(`[platform] ${what} failed`, error?.message);
  return { ok: false, error: `Couldn't ${what}: ${error?.message ?? "unknown error"}` };
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

// ---------------------------------------------------------------- body measurements

export async function saveMeasurement(input: { id?: string; date: string; values: Partial<Record<MeasureKey, number | null>>; note?: string }): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out. Sign in again, then save." };
  if (!isDate(input.date) || input.date > todayIso()) return { ok: false, error: "Pick a date that isn't in the future." };
  const values: Partial<Record<MeasureKey, number | null>> = {};
  for (const m of MEASURES) {
    const v = input.values[m.key];
    values[m.key] = v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10;
  }
  const bad = measurementError(values);
  if (bad) return { ok: false, error: bad };
  const row = { ...values, date: input.date, note: (input.note ?? "").trim().slice(0, 120) || null };
  const res = input.id && isId(input.id)
    ? await supabase.from("body_measurements").update(row).eq("id", input.id).eq("user_id", user.id).select("id").single()
    : await supabase.from("body_measurements").insert({ ...row, user_id: user.id }).select("id").single();
  if (res.error) return fail(res.error, "save the measurement");
  revalidatePath("/progress", "layout");
  return { ok: true, id: res.data.id as string };
}

export async function deleteMeasurement(id: string): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  if (!isId(id)) return { ok: false, error: "Unknown entry" };
  const { error } = await supabase.from("body_measurements").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail(error, "delete the measurement");
  revalidatePath("/progress", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- progress photos

const cleanPose = (p: unknown): Pose | null => (POSES.includes(p as Pose) ? (p as Pose) : null);
const cleanWeight = (w: unknown): number | null => {
  if (w == null || w === "") return null;
  const n = Number(w);
  return Number.isFinite(n) && n >= 20 && n <= 400 ? Math.round(n * 10) / 10 : null;
};

/** Upload (<= 1024 px JPEG as bare base64) with date, note and, when v36 is there, weight and pose. */
export async function addPhoto(input: { base64: string; date?: string; note?: string; weight_kg?: number | null; pose?: Pose | null }): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  const day = isDate(input.date) && input.date <= todayIso() ? input.date : todayIso();
  const bytes = Buffer.from(input.base64 || "", "base64");
  if (bytes.length < 100) return { ok: false, error: "That photo looks empty. Try another one." };
  if (bytes.length > 3_000_000) return { ok: false, error: "That photo is too large." };
  const path = `${user.id}/${day}-${Date.now()}.jpg`;
  const admin = adminClient();
  const up = await admin.storage.from("progress-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (up.error) return { ok: false, error: `Couldn't upload the photo: ${up.error.message}` };
  const base = { user_id: user.id, date: day, path, note: (input.note ?? "").trim().slice(0, 120) || null };
  const extra = { weight_kg: cleanWeight(input.weight_kg), pose: cleanPose(input.pose) };
  let res = await supabase.from("progress_photos").insert({ ...base, ...extra }).select("id").single();
  if (res.error && isMissingSchema(res.error)) res = await supabase.from("progress_photos").insert(base).select("id").single();
  if (res.error) {
    await admin.storage.from("progress-photos").remove([path]);
    return fail(res.error, "save the photo");
  }
  revalidatePath("/progress", "layout");
  return { ok: true, id: res.data.id as string };
}

export async function updatePhoto(id: string, patch: { date?: string; note?: string; weight_kg?: number | null; pose?: Pose | null }): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  if (!isId(id)) return { ok: false, error: "Unknown photo" };
  const base: Record<string, unknown> = {};
  if (patch.date !== undefined) {
    if (!isDate(patch.date) || patch.date > todayIso()) return { ok: false, error: "Pick a date that isn't in the future." };
    base.date = patch.date;
  }
  if (patch.note !== undefined) base.note = patch.note.trim().slice(0, 120) || null;
  const extra: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.weight_kg !== undefined) extra.weight_kg = cleanWeight(patch.weight_kg);
  if (patch.pose !== undefined) extra.pose = cleanPose(patch.pose);
  let { error } = await supabase.from("progress_photos").update({ ...base, ...extra }).eq("id", id).eq("user_id", user.id);
  if (error && isMissingSchema(error) && Object.keys(base).length) ({ error } = await supabase.from("progress_photos").update(base).eq("id", id).eq("user_id", user.id));
  if (error) return fail(error, "update the photo");
  revalidatePath("/progress", "layout");
  return { ok: true };
}

/** Deletes the row and its storage object (the page offers Undo before calling this). */
export async function deletePhoto(id: string): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  if (!isId(id)) return { ok: false, error: "Unknown photo" };
  const { data } = await supabase.from("progress_photos").select("path").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("progress_photos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail(error, "delete the photo");
  if (data?.path) {
    const rm = await adminClient().storage.from("progress-photos").remove([data.path as string]);
    if (rm.error) console.error("[deletePhoto] storage remove failed", rm.error.message);
  }
  revalidatePath("/progress", "layout");
  return { ok: true };
}

/** My squads, for "Share to squad". */
export async function listShareSquads(): Promise<{ id: string; name: string }[]> {
  const { supabase, user } = await me();
  if (!user) return [];
  const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  const ids = (mine ?? []).map((m) => m.group_id as string);
  if (!ids.length) return [];
  const { data } = await supabase.from("groups").select("id, name").in("id", ids);
  return ((data ?? []) as { id: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Posts one private progress photo to a squad feed as a 'photo' post. Called only after the person
 * confirmed in the sheet (`confirmed` must be true). The file is copied into group-photos, so
 * deleting the progress photo later doesn't break the post and vice versa.
 */
export async function sharePhotoToSquad(input: { photoId: string; groupId: string; caption: string; confirmed: boolean }): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  if (input.confirmed !== true) return { ok: false, error: "Confirm before sharing. Progress photos are private." };
  if (!isId(input.photoId) || !isId(input.groupId)) return { ok: false, error: "Pick a photo and a squad" };
  const { data: photo } = await supabase.from("progress_photos").select("path").eq("id", input.photoId).eq("user_id", user.id).maybeSingle();
  if (!photo?.path) return { ok: false, error: "That photo is gone." };
  const admin = adminClient();
  const dl = await admin.storage.from("progress-photos").download(photo.path as string);
  if (dl.error || !dl.data) return { ok: false, error: "Couldn't read the photo." };
  const bytes = Buffer.from(await dl.data.arrayBuffer());
  const path = `${user.id}/${input.groupId}-${Date.now()}.jpg`;
  const up = await supabase.storage.from("group-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (up.error) return { ok: false, error: `Couldn't upload: ${up.error.message}` };
  const { error } = await supabase.from("group_posts").insert({ group_id: input.groupId, user_id: user.id, kind: "photo", body: input.caption.trim().slice(0, 300), photo_path: path });
  if (error) {
    await supabase.storage.from("group-photos").remove([path]);
    return { ok: false, error: `Couldn't post: ${error.message}` };
  }
  revalidatePath(`/squad/${input.groupId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- routines

export async function saveRoutine(input: { id?: string; name: string; days: RoutineDay[]; activate?: boolean }): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  const name = input.name.trim().slice(0, 40) || "My routine";
  const days = normalizeDays(input.days);
  if (!days.length) return { ok: false, error: "Add at least one day" };
  if (!days.some((d) => d.exercises.length)) return { ok: false, error: "Add at least one exercise" };
  const row = { name, days, updated_at: new Date().toISOString() };
  const res = input.id && isId(input.id)
    ? await supabase.from("routines").update(row).eq("id", input.id).eq("user_id", user.id).select("id").single()
    : await supabase.from("routines").insert({ ...row, user_id: user.id, active: false }).select("id").single();
  if (res.error) return fail(res.error, "save the routine");
  const id = res.data.id as string;
  if (input.activate) {
    const act = await setActiveRoutine(id);
    if (!act.ok) return act;
  }
  revalidatePath("/train", "layout");
  return { ok: true, id };
}

export async function createFromTemplate(key: string): Promise<PResult> {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) return { ok: false, error: "Unknown template" };
  return saveRoutine({ name: t.name, days: t.days, activate: true });
}

/** Makes `id` the one active routine (null = none). The unique index allows one active per user. */
export async function setActiveRoutine(id: string | null): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  const off = await supabase.from("routines").update({ active: false }).eq("user_id", user.id).eq("active", true);
  if (off.error) return fail(off.error, "change the active routine");
  if (id) {
    if (!isId(id)) return { ok: false, error: "Unknown routine" };
    const on = await supabase.from("routines").update({ active: true }).eq("id", id).eq("user_id", user.id);
    if (on.error) return fail(on.error, "change the active routine");
  }
  revalidatePath("/train", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteRoutine(id: string): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  if (!isId(id)) return { ok: false, error: "Unknown routine" };
  const { error } = await supabase.from("routines").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail(error, "delete the routine");
  revalidatePath("/train", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- Home entry points

export type HomeEntries = {
  today: string;
  pro: boolean;
  /** Unread inbox rows; null = no notifications table yet (bell hidden). */
  unread: number | null;
  session: { routineId: string; routineName: string; dayIndex: number; day: RoutineDay } | null;
  hasRoutine: boolean;
};

/** One round trip for the three Home components (bell, recap / push prompt, today's session). */
export async function loadHomeEntries(): Promise<HomeEntries> {
  const { supabase, user } = await me();
  const today = todayIso();
  if (!user) return { today, pro: true, unread: null, session: null, hasRoutine: false };
  const [pro, unread, routines] = await Promise.all([loadPro(supabase), loadUnread(supabase), loadRoutines(supabase)]);
  const active: Routine | undefined = routines.routines.find((r) => r.active);
  const hit = active ? todaysDay(active, today) : null;
  return {
    today,
    pro: pro.pro,
    unread,
    session: active && hit ? { routineId: active.id, routineName: active.name, dayIndex: hit.index, day: hit.day } : null,
    hasRoutine: routines.routines.length > 0,
  };
}

// ---------------------------------------------------------------- inbox

export async function fetchInbox(): Promise<{ available: boolean; items: InboxItem[]; at: number }> {
  const { supabase, user } = await me();
  if (!user) return { available: false, items: [], at: Date.now() };
  return loadInbox(supabase);
}

/** Marks rows read (all unread when `ids` is null). */
export async function markNotificationsRead(ids: string[] | null): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (ids) {
    const clean = ids.filter(isId).slice(0, 200);
    if (!clean.length) return { ok: true };
    q = q.in("id", clean);
  }
  const { error } = await q;
  if (error) return fail(error, "mark them read");
  return { ok: true };
}

export async function saveNotificationPrefs(patch: { protein_nudge?: boolean; protein_nudge_time?: string }): Promise<PResult> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "You're signed out." };
  const row: Record<string, unknown> = {};
  if (typeof patch.protein_nudge === "boolean") row.protein_nudge = patch.protein_nudge;
  if (patch.protein_nudge_time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.protein_nudge_time)) return { ok: false, error: "Pick a time" };
    row.protein_nudge_time = patch.protein_nudge_time;
  }
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) return fail(error, "save that");
  revalidatePath("/profile/preferences", "layout");
  return { ok: true };
}
