import { requireAdmin } from "@/lib/admin/auth";
import { loadOverview } from "@/lib/admin/data";
import { loadDataset } from "@/lib/admin/insights/load";
import { loadCorrections } from "@/lib/admin/corrections";
import { OverviewBento } from "@/components/admin/OverviewBento";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const { db } = await requireAdmin();
  const [o, ds, corr] = await Promise.all([loadOverview(db), loadDataset(db), loadCorrections(db).catch(() => ({ available: false, latest: [], byKind: [], total30: 0, skips30: null }))]);
  return <OverviewBento o={o} ds={ds} corrections={corr} />;
}
