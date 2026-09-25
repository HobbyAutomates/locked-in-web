import { requireAdmin } from "@/lib/admin/auth";
import { loadOverview } from "@/lib/admin/data";
import { loadDataset } from "@/lib/admin/insights/load";
import { OverviewBento } from "@/components/admin/OverviewBento";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const { db } = await requireAdmin();
  const [o, ds] = await Promise.all([loadOverview(db), loadDataset(db)]);
  return <OverviewBento o={o} ds={ds} />;
}
