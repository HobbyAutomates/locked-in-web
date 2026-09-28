import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import SocialModeration from "@/components/social/SocialModeration";

export const dynamic = "force-dynamic";

/** v2.18 /admin/social: squad verification requests (D3) and squad reports (E5). */
export default async function AdminSocial() {
  const { db } = await requireAdmin();
  const [ver, reps, verified] = await Promise.all([
    db.from("squad_verifications").select("id, group_id, org_name, org_kind, proof, status, created_at, groups(name)").eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    db.from("content_reports").select("id, reason, note, snapshot, post_id, group_id, reported_user, created_at, status").eq("status", "open").order("created_at", { ascending: true }).limit(200),
    db.from("groups").select("id, name, org_name, org_kind").eq("verified", true).order("name").limit(200),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm font-semibold underline">
        ← Overview
      </Link>
      <SocialModeration
        verificationsAvailable={!ver.error}
        reportsAvailable={!reps.error}
        pending={((ver.data ?? []) as unknown as { id: string; group_id: string; org_name: string; org_kind: string; proof: string; created_at: string; groups: { name: string } | null }[]).map((v) => ({ ...v, squad: v.groups?.name ?? "Squad" }))}
        reports={(reps.data ?? []) as { id: string; reason: string; note: string; snapshot: string; post_id: string | null; group_id: string | null; reported_user: string | null; created_at: string }[]}
        verified={(verified.error ? [] : (verified.data ?? [])) as { id: string; name: string; org_name: string | null; org_kind: string | null }[]}
      />
    </div>
  );
}
