"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { ageYears, isTeen } from "./goals";
import { effectiveCoachStyle, type CoachStyle } from "./onboardingV2";
import { missingV37 } from "./coachSchema";
import { COMING_SOON } from "./v36";

/** v2.14 Coach → Style settings (profile columns from schema_v37). */
export type CoachSettings = { available: boolean; style: CoachStyle; noteTime: string; quietFrom: string; quietTo: string; roast: boolean; remember: boolean; teen: boolean };

const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : d);

export async function getCoachSettings(): Promise<CoachSettings> {
  const supabase = await createClient();
  const [{ data: base }, { data, error }] = await Promise.all([
    supabase.from("profiles").select("dob").maybeSingle(),
    supabase.from("profiles").select("coach_style, coach_note_time, coach_quiet_from, coach_quiet_to, coach_weekly_roast, coach_remember").maybeSingle(),
  ]);
  const teen = isTeen(ageYears((base as { dob?: string | null } | null)?.dob ?? null));
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    available: !error || !missingV37(error),
    style: effectiveCoachStyle(d.coach_style, teen ? 15 : 30),
    noteTime: hhmm(d.coach_note_time, "08:00"),
    quietFrom: hhmm(d.coach_quiet_from, "23:00"),
    quietTo: hhmm(d.coach_quiet_to, "07:00"),
    roast: d.coach_weekly_roast === true,
    remember: d.coach_remember !== false,
    teen,
  };
}

export async function saveCoachSettings(patch: Partial<Omit<CoachSettings, "available" | "teen">>): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const row: Record<string, unknown> = {};
  if (patch.style) row.coach_style = patch.style;
  for (const [k, col] of [["noteTime", "coach_note_time"], ["quietFrom", "coach_quiet_from"], ["quietTo", "coach_quiet_to"]] as const) {
    const v = patch[k];
    if (v != null) {
      if (!/^\d{2}:\d{2}$/.test(v)) return { ok: false, error: "Pick a valid time" };
      row[col] = v;
    }
  }
  if (typeof patch.roast === "boolean") row.coach_weekly_roast = patch.roast;
  if (typeof patch.remember === "boolean") row.coach_remember = patch.remember;
  if (!Object.keys(row).length) return { ok: true };
  // The schema_v37 trigger caps under-18s at Balanced and turns the roast off; mirror it here so
  // the screen doesn't flash a value the database will refuse.
  const { data: p } = await supabase.from("profiles").select("dob").eq("id", user.id).maybeSingle();
  if (isTeen(ageYears((p as { dob?: string | null } | null)?.dob ?? null))) {
    if (row.coach_style === "no_excuses") row.coach_style = "balanced";
    row.coach_weekly_roast = false;
  }
  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) return { ok: false, error: missingV37(error) ? COMING_SOON : error.message };
  revalidatePath("/coach", "layout");
  return { ok: true };
}
