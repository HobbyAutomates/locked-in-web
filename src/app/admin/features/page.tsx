import { requireAdmin } from "@/lib/admin/auth";
import { loadDataset } from "@/lib/admin/insights/load";
import { buildOverview } from "@/lib/admin/insights/build";
import { AdminNav, HBars, Section, Stat, num } from "@/components/admin/AdminUi";
import { FeatureTable, InsightList } from "@/components/admin/InsightsUi";

export const dynamic = "force-dynamic";

export default async function AdminFeatures() {
  const { db } = await requireAdmin();
  const o = buildOverview(await loadDataset(db));
  const rare = o.features.filter((f) => f.status === "rare");
  const never = o.features.filter((f) => f.status === "never");
  const unmeasured = o.features.filter((f) => f.status === "not-measured");
  const featureInsights = o.insights.filter((i) => ["methods", "top-feature", "social", "never", "rare", "unmeasured"].includes(i.key) || i.key.startsWith("trend-"));
  return (
    <>
      <AdminNav active="features" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active users, 7 days" value={num(o.active7)} hint="adoption 7d denominator" />
        <Stat label="Active users, 30 days" value={num(o.active30)} hint="adoption 30d denominator" />
        <Stat label="Rarely used" value={num(rare.length)} hint="features" />
        <Stat label="Never used (30d)" value={num(never.length)} hint="features" />
      </div>

      <Section title="What stands out">
        <InsightList items={featureInsights} />
      </Section>

      <Section
        title="Feature usage, ranked by adoption"
        note={
          <>
            Adoption = users who used the feature ÷ users active at all in the same 7 or 30 days. Frequency = uses in 30 days ÷ active users ÷ 4.3 weeks. This
            week / last week are rolling 7-day windows. Source: app_events where they exist; for each user, domain-table rows from before their first event fill in
            the earlier history (so nothing is counted twice). {o.eventsSince ? `Events start ${o.eventsSince}.` : "No app events in the window yet."}
          </>
        }
      >
        <FeatureTable rows={o.features} />
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Adoption, 30 days" note="Share of active users, %.">
          <HBars rows={o.features.filter((f) => f.instrumented).map((f) => ({ label: f.label, value: Math.round((f.adoption30 ?? 0) * 100) }))} color="var(--green)" />
        </Section>
        <Section title="Rarely or never used">
          <div className="flex flex-col gap-2 text-[13px]">
            <p>
              <span className="font-semibold">Never (30 days): </span>
              {never.length ? never.map((f) => f.label).join(", ") : "none"}
            </p>
            <p>
              <span className="font-semibold">Rare: </span>
              {rare.length ? rare.map((f) => `${f.label} (${f.users30} of ${f.active30})`).join(", ") : "none"}
            </p>
            <p className="muted">
              <span className="font-semibold">Not measured: </span>
              {unmeasured.length ? `${unmeasured.map((f) => f.label).join(", ")} — no event reports these screens yet, so 0 means unknown.` : "none"}
            </p>
          </div>
        </Section>
      </div>

      {o.readErrors.length ? (
        <p className="text-xs muted">Couldn&apos;t read: {o.readErrors.map((e) => `${e.table} (${e.message})`).join("; ")}. Those numbers read as zero.</p>
      ) : null}
    </>
  );
}
