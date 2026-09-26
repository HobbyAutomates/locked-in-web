"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { missingV37 } from "./coachSchema";
import { COMING_SOON } from "./v36";

/**
 * v2.14 server actions: milestones seen, and buddy streaks (RPCs from schema_v37). Every one
 * degrades to "not available" when the schema isn't applied yet.
 */

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Appends milestone keys to profiles.milestones_seen (no-op without schema_v37). */
export async function markMilestonesSeen(keys: string[]): Promise<void> {
  const clean = [...new Set(keys.map((k) => String(k).slice(0, 80)).filter(Boolean))].slice(0, 20);
  if (!clean.length) return;
  const { supabase, user } = await me();
  if (!user) return;
  const { data, error } = await supabase.from("profiles").select("milestones_seen").eq("id", user.id).maybeSingle();
  if (error) return;
  const have = ((data as { milestones_seen?: string[] | null } | null)?.milestones_seen ?? []) as string[];
  const next = [...new Set([...have, ...clean])].slice(-200);
  if (next.length === have.length) return;
  await supabase.from("profiles").update({ milestones_seen: next }).eq("id", user.id);
}

export type Buddy = { id: string; partner_id: string; partner_name: string; partner_avatar: string | null; streak: number; best: number; me_today: boolean; partner_today: boolean; last_both_logged_on: string | null; created_at: string };
type R<T> = ({ ok: true } & T) | { ok: false; error: string; unavailable?: boolean };

const fail = (error: { message?: string; code?: string } | null, fallback: string) =>
  missingV37(error) ? { ok: false as const, error: COMING_SOON, unavailable: true } : { ok: false as const, error: error?.message?.replace(/^.*?:\s/, "") || fallback };

export async function loadBuddies(): Promise<R<{ buddies: Buddy[] }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.rpc("my_buddies");
  if (error) return fail(error, "Couldn't load buddies");
  return { ok: true, buddies: ((data ?? []) as Buddy[]).map((b) => ({ ...b, streak: Number(b.streak) || 0, best: Number(b.best) || 0 })) };
}

export async function buddyInvite(): Promise<R<{ code: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.rpc("buddy_invite");
  if (error || typeof data !== "string") return fail(error, "Couldn't make a code");
  return { ok: true, code: data };
}

export async function buddyInviteInfo(code: string): Promise<R<{ name: string | null }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.rpc("buddy_invite_info", { invite: code });
  if (error) return fail(error, "Couldn't check that code");
  const row = (Array.isArray(data) ? data[0] : data) as { name?: string } | undefined;
  return { ok: true, name: row?.name ?? null };
}

export async function buddyAccept(code: string): Promise<R<{ id: string }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.rpc("buddy_accept", { invite: code.trim().toUpperCase() });
  if (error || typeof data !== "string") return fail(error, "Couldn't use that code");
  revalidatePath("/", "layout");
  return { ok: true, id: data };
}

export async function buddyNudge(buddyId: string): Promise<R<{ sent: boolean }>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { data, error } = await supabase.rpc("buddy_nudge", { buddy: buddyId });
  if (error) return fail(error, "Couldn't nudge");
  // Push it now (no-op without VAPID keys), like squad nudges.
  if (data === true) {
    const { adminClient } = await import("./apiAuth");
    const { dispatchQuietly } = await import("./push");
    const { data: b } = await supabase.from("buddies").select("user_a, user_b").eq("id", buddyId).maybeSingle();
    const other = b ? ((b as { user_a: string }).user_a === user.id ? (b as { user_b: string }).user_b : (b as { user_a: string }).user_a) : null;
    if (other) await dispatchQuietly(adminClient, other);
  }
  return { ok: true, sent: data === true };
}

export async function removeBuddy(buddyId: string): Promise<R<object>> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.from("buddies").delete().eq("id", buddyId);
  if (error) return fail(error, "Couldn't remove");
  revalidatePath("/", "layout");
  return { ok: true };
}
