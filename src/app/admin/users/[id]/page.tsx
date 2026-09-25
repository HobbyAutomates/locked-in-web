import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadUserDetail } from "@/lib/admin/data";
import { loadUserDataset } from "@/lib/admin/insights/load";
import { UserBento } from "@/components/admin/UserBento";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [d, ds] = await Promise.all([loadUserDetail(db, id), loadUserDataset(db, id)]);
  if (!d) notFound();
  return <UserBento id={id} d={d} ds={ds} />;
}
