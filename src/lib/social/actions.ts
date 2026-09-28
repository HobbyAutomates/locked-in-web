"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { isMissingSchema } from "../notify";
import { normalizeCode } from "./referrals";
import { parseStampRows, type Stamp, type StampState } from "./stamps";
import { parseLiveRows, type LiveRow } from "./live";
import { endsOn, goalText, validatePledge, type PledgeDraft } from "./pledges";
import { eventById } from "./seasonal";
import { isGoldCover, packById, parseSkin, type BadgeSkin } from "./packs";
import { normalizeUsername } from "./coachView";
import { parseReason, reportSnapshot } from "./safety";
import { parseLang, type Lang } from "./i18n";

/**
 * v2.18 social server actions (schema_v44 / v45). Every action degrades: when the table or RPC is
 * missing it returns `{ ok: false, missing: true }` (the UI says "Coming with the next update")
 * instead of throwing, and it never throws for a database error (Next hides thrown messages in
 * production), so the screen can show the text.
 */

export type Res<T = undefined> = { ok: true; data: T } | { ok: false; error: string; missing?: boolean };

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type PgErr = { code?: string; message?: string } | null | undefined;

/** Missing table / column / function (incl. 42883 for a missing RPC signature). */
function missing(e: PgErr): boolean {
  return !!e && (isMissingSchema(e) || e.code === "42883" || /could not find the function/i.test(e.message ?? ""));
}

function fail<T>(e: PgErr, fallback = "Something went wrong"): Res<T> {
  if (missing(e)) return { ok: false, error: "Coming with the next update", missing: true };
  const msg = (e?.message ?? fallback).replace(/^.*?exception:\s*/i, "");
  return { ok: false, error: msg || fallback };
}

const signedOut = <T,>(): Res<T> => ({ ok: false, error: "You're signed out. Sign in again." });

/* ---------------- D5 streak freezes ---------------- */

export type FreezeSync = { tokens: number; earned_now: number; used_now: number; used_days: string[] };

export async function syncFreezes(): Promise<Res<FreezeSync>> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.rpc("freeze_sync");
  if (error) return fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const out: FreezeSync = {
    tokens: Number(row?.tokens ?? 0) || 0,
    earned_now: Number(row?.earned_now ?? 0) || 0,
    used_now: Number(row?.used_now ?? 0) || 0,
    used_days: Array.isArray(row?.used_days) ? (row!.used_days as string[]) : [],
  };
  if (out.used_now > 0 || out.earned_now > 0) revalidatePath("/", "layout");
  return { ok: true, data: out };
}

export async function giftFreeze(to: string): Promise<Res<{ tokens: number }>> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.rpc("freeze_gift", { p_to: to });
  if (error) return fail(error);
  revalidatePath("/streak");
  return { ok: true, data: { tokens: Number(data ?? 0) || 0 } };
}

/* ---------------- D2 referrals ---------------- */

export async function claimReferral(code: string): Promise<Res<{ ok: boolean; reason: string | null; referrer_name: string | null }>> {
  const c = normalizeCode(code);
  if (!c) return { ok: true, data: { ok: false, reason: "unknown", referrer_name: null } };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.rpc("referral_claim", { p_code: c });
  if (error) return fail(error);
  const d = (data ?? {}) as { ok?: boolean; reason?: string | null; referrer_name?: string | null };
  if (d.ok) revalidatePath("/invite");
  return { ok: true, data: { ok: d.ok === true, reason: d.reason ?? null, referrer_name: d.referrer_name ?? null } };
}

/* ---------------- D3 verified squads ---------------- */

export async function requestVerification(groupId: string, org: string, kind: string, proof: string): Promise<Res> {
  if (org.trim().length < 2) return { ok: false, error: "Add the gym or college name" };
  if (!["gym", "college", "office", "club"].includes(kind)) return { ok: false, error: "Pick what kind of place it is" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.rpc("request_squad_verification", { g: groupId, p_org: org.trim().slice(0, 80), p_kind: kind, p_proof: proof.trim().slice(0, 500) });
  if (error) return fail(error);
  revalidatePath(`/squad/${groupId}`);
  return { ok: true, data: undefined };
}

/* ---------------- D4 coach access ---------------- */

export async function grantCoach(username: string): Promise<Res> {
  const u = normalizeUsername(username);
  if (!u) return { ok: false, error: "That isn't a username (3 to 20 letters, numbers or _)" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.rpc("coach_grant", { p_username: u });
  if (error) return fail(error);
  revalidatePath("/coach-access");
  return { ok: true, data: undefined };
}

export async function revokeCoach(other: string): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.rpc("coach_revoke", { p_other: other });
  if (error) return fail(error);
  revalidatePath("/coach-access");
  revalidatePath("/clients");
  return { ok: true, data: undefined };
}

export async function addCoachComment(clientId: string, body: string, day: string | null): Promise<Res> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a note first" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("coach_comments").insert({ client_id: clientId, coach_id: user.id, body: text.slice(0, 1000), day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null });
  if (error) return fail(error);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: undefined };
}

/* ---------------- D6 stamps ---------------- */

export async function loadStamps(postIds: string[]): Promise<Res<Record<string, StampState>>> {
  const ids = postIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
  if (!ids.length) return { ok: true, data: {} };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.rpc("post_stamp_counts", { p_posts: ids });
  if (error) return fail(error);
  return { ok: true, data: parseStampRows((data ?? []) as Record<string, unknown>[]) };
}

export async function setStamp(postId: string, stamp: Stamp | null): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = stamp
    ? await supabase.from("post_stamps").upsert({ post_id: postId, user_id: user.id, stamp }, { onConflict: "post_id,user_id" })
    : await supabase.from("post_stamps").delete().eq("post_id", postId).eq("user_id", user.id);
  if (error) return fail(error);
  return { ok: true, data: undefined };
}

/* ---------------- D7 live sessions ---------------- */

export async function setLiveShare(on: boolean): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("profiles").update({ live_share: on }).eq("id", user.id);
  if (error) return fail(error);
  if (!on) await supabase.from("live_sessions").delete().eq("user_id", user.id);
  return { ok: true, data: undefined };
}

export async function liveBeat(label: string, startedAt: string | null): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { user_id: user.id, label: (label || "Training").slice(0, 60), seen_at: now };
  if (startedAt) row.started_at = startedAt;
  const { error } = await supabase.from("live_sessions").upsert(row, { onConflict: "user_id" });
  if (error) return fail(error);
  return { ok: true, data: undefined };
}

export async function liveEnd(): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("live_sessions").delete().eq("user_id", user.id);
  if (error) return fail(error);
  return { ok: true, data: undefined };
}

export async function loadLive(groupId: string): Promise<Res<LiveRow[]>> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.rpc("squad_live", { g: groupId });
  if (error) return fail(error);
  return { ok: true, data: parseLiveRows((data ?? []) as Record<string, unknown>[], user.id) };
}

export async function cheer(userId: string): Promise<Res<boolean>> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.rpc("live_cheer", { p_user: userId });
  if (error) return fail(error);
  return { ok: true, data: data === true };
}

/* ---------------- D8 pledges ---------------- */

export async function createPledge(d: PledgeDraft & { group_id: string | null }, today: string): Promise<Res<{ id: string }>> {
  const problem = validatePledge(d, today);
  if (problem) return { ok: false, error: problem };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const row = {
    user_id: user.id,
    group_id: d.group_id,
    goal: goalText(d.kind, d.target, d.days, d.goal).slice(0, 120),
    kind: d.kind,
    target: d.kind === "custom" ? null : d.target,
    stake: d.stake.trim().slice(0, 120),
    stake_inr: Math.round(d.stake_inr),
    starts_on: d.starts_on,
    ends_on: endsOn(d.starts_on, d.days),
  };
  const { data, error } = await supabase.from("pledges").insert(row).select("id").single();
  if (error) return fail(error);
  revalidatePath("/pledges");
  return { ok: true, data: { id: data.id as string } };
}

export async function closePledge(id: string, status: "kept" | "broken" | "cancelled"): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("pledges").update({ status, closed_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return fail(error);
  revalidatePath("/pledges");
  return { ok: true, data: undefined };
}

/* ---------------- D9 seasonal events ---------------- */

export async function awardEventBadge(eventId: string): Promise<Res> {
  if (!eventById(eventId)) return { ok: false, error: "Unknown event" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("event_badges").upsert({ user_id: user.id, event_id: eventId }, { onConflict: "user_id,event_id", ignoreDuplicates: true });
  if (error) return fail(error);
  revalidatePath("/events");
  return { ok: true, data: undefined };
}

/* ---------------- D11 packs ---------------- */

export async function unlockPack(packId: string): Promise<Res> {
  const pack = packById(packId);
  if (!pack) return { ok: false, error: "Unknown pack" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("pack_unlocks").upsert({ user_id: user.id, pack_id: pack.id, price_inr: pack.price_inr, via: "beta_free" }, { onConflict: "user_id,pack_id", ignoreDuplicates: true });
  if (error) return fail(error);
  revalidatePath("/packs");
  return { ok: true, data: undefined };
}

export async function saveBadgeSkin(skin: BadgeSkin): Promise<Res> {
  const s = parseSkin(skin);
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("profiles").update({ badge_skin: s === "classic" ? null : s }).eq("id", user.id);
  if (error) return fail(error);
  return { ok: true, data: undefined };
}

/** A gold cover (needs the covers-gold pack, checked by the page; the DB check needs v44). */
export async function saveGoldCover(id: string): Promise<Res> {
  if (!isGoldCover(id)) return { ok: false, error: "Pick a gold cover" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("profiles").update({ cover_preset: id }).eq("id", user.id);
  if (error) return fail(error.code === "23514" ? { code: "42703", message: "column does not exist" } : error);
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}

/* ---------------- E2 language ---------------- */

export async function saveUiLang(lang: Lang): Promise<Res> {
  const l = parseLang(lang);
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("profiles").update({ ui_lang: l }).eq("id", user.id);
  if (error) return fail(error);
  return { ok: true, data: undefined };
}

/* ---------------- E5 report + block ---------------- */

export async function reportContent(input: { reason: string; note: string; postId?: string | null; groupId?: string | null; userId?: string | null; post?: { kind?: string; body?: string | null; author_name?: string | null; created_at?: string } }): Promise<Res> {
  const reason = parseReason(input.reason);
  if (!reason) return { ok: false, error: "Pick a reason" };
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { error } = await supabase.from("content_reports").insert({
    reporter_id: user.id,
    reported_user: input.userId ?? null,
    group_id: input.groupId ?? null,
    post_id: input.postId ?? null,
    reason,
    note: (input.note ?? "").trim().slice(0, 500),
    snapshot: input.post ? reportSnapshot(input.post) : "",
  });
  if (error) return fail(error);
  return { ok: true, data: undefined };
}

export async function loadBlocks(): Promise<Res<string[]>> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  const { data, error } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id);
  if (error) return fail(error);
  return { ok: true, data: ((data ?? []) as { blocked_id: string }[]).map((r) => r.blocked_id) };
}

export async function setBlocked(userId: string, blocked: boolean): Promise<Res> {
  const { supabase, user } = await me();
  if (!user) return signedOut();
  if (userId === user.id) return { ok: false, error: "That's you" };
  const { error } = blocked
    ? await supabase.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: userId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true })
    : await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
  if (error) return fail(error);
  return { ok: true, data: undefined };
}
