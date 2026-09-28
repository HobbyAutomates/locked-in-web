"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../admin/auth";

/**
 * v2.18 admin moderation (D3 verified squads, E5 reports). Every action re-runs the admin gate and
 * uses the service client, which is what lets it set groups.verified (the v44 guard trigger
 * blocks everyone else).
 */

export async function decideVerification(id: string, approve: boolean, note: string): Promise<{ ok: boolean; error?: string }> {
  const { db } = await requireAdmin();
  const { data: req, error } = await db.from("squad_verifications").select("id, group_id, org_name, org_kind, status").eq("id", id).maybeSingle();
  if (error || !req) return { ok: false, error: error?.message ?? "Request not found" };
  const r = req as { group_id: string; org_name: string; org_kind: string };
  if (approve) {
    const { error: e1 } = await db.from("groups").update({ verified: true, org_name: r.org_name, org_kind: r.org_kind }).eq("id", r.group_id);
    if (e1) return { ok: false, error: e1.message };
  }
  const { error: e2 } = await db.from("squad_verifications").update({ status: approve ? "approved" : "rejected", note: note.trim() || null, decided_at: new Date().toISOString() }).eq("id", id);
  if (e2) return { ok: false, error: e2.message };
  revalidatePath("/admin/social");
  return { ok: true };
}

export async function unverifySquad(groupId: string): Promise<{ ok: boolean; error?: string }> {
  const { db } = await requireAdmin();
  const { error } = await db.from("groups").update({ verified: false }).eq("id", groupId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/social");
  return { ok: true };
}

export async function resolveReport(id: string, status: "actioned" | "dismissed", deletePost: boolean): Promise<{ ok: boolean; error?: string }> {
  const { db } = await requireAdmin();
  if (deletePost) {
    const { data } = await db.from("content_reports").select("post_id").eq("id", id).maybeSingle();
    const postId = (data as { post_id?: string | null } | null)?.post_id;
    if (postId) await db.from("group_posts").delete().eq("id", postId);
  }
  const { error } = await db.from("content_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/social");
  return { ok: true };
}
