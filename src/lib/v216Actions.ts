"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { isCoverId } from "./covers";

/**
 * v2.16 server actions for schema_v40 (profiles.cover_preset, profiles.tour_seen_at). Both degrade
 * to "not stored" when the columns aren't there yet; the client keeps its local copy then.
 */

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Saves the profile cover. `stored: false` = schema_v40 not applied (the browser keeps it). */
export async function saveCoverPreset(id: string): Promise<{ ok: boolean; stored: boolean; error?: string }> {
  if (!isCoverId(id)) return { ok: false, stored: false, error: "Pick a cover from the list" };
  const { supabase, user } = await me();
  if (!user) return { ok: false, stored: false, error: "Not signed in" };
  const { error } = await supabase.from("profiles").update({ cover_preset: id }).eq("id", user.id);
  if (error) return /cover_preset|schema cache|does not exist/i.test(error.message) ? { ok: true, stored: false } : { ok: false, stored: false, error: error.message };
  revalidatePath("/profile");
  return { ok: true, stored: true };
}

/** Marks the first-run tour as seen on the account (no-op without schema_v40). */
export async function markTourSeen(): Promise<void> {
  const { supabase, user } = await me();
  if (!user) return;
  await supabase.from("profiles").update({ tour_seen_at: new Date().toISOString() }).eq("id", user.id);
}
