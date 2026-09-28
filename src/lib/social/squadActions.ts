"use server";

import { createClient } from "../supabase/server";

/**
 * v2.18 squad extras read by the squad room in one call: the verified tick (D3), a pending
 * verification request and how many pledges are running (D8). Each part is independent and just
 * comes back empty when its schema_v44 table is missing.
 */
export type SquadExtras = { verified: boolean; org_name: string | null; org_kind: string | null; verifiedColumns: boolean; pending: boolean; activePledges: number };

export async function loadSquadExtras(groupId: string): Promise<SquadExtras> {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [g, v, p] = await Promise.all([
    supabase.from("groups").select("verified, org_name, org_kind").eq("id", groupId).maybeSingle(),
    supabase.from("squad_verifications").select("id").eq("group_id", groupId).eq("status", "pending").limit(1),
    supabase.from("pledges").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "active").gte("ends_on", today),
  ]);
  const row = (g.error ? null : g.data) as { verified?: boolean; org_name?: string | null; org_kind?: string | null } | null;
  return {
    verified: row?.verified === true,
    org_name: row?.org_name ?? null,
    org_kind: row?.org_kind ?? null,
    verifiedColumns: !g.error,
    pending: !v.error && (v.data ?? []).length > 0,
    activePledges: p.error ? 0 : (p.count ?? 0),
  };
}
