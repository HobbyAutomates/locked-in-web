import { requireAdmin } from "@/lib/admin/auth";
import { loadOverview } from "@/lib/admin/data";
import { AdminNav, Bars, HBars, Section, Stat, TableWrap, num, usd } from "@/components/admin/AdminUi";

export const dynamic = "force-dynamic";

const TINTS = ["var(--orange)", "var(--orange)", "var(--green)", "var(--green)", "var(--blue)", "var(--ink)", "var(--purple)", "var(--red)", "var(--red)", "var(--flame)"];

export default async function AdminOverview() {
  const { db } = await requireAdmin();
  const o = await loadOverview(db);
  const new30 = o.newUsers.reduce((a, d) => a + d.value, 0);
  return (
    <>
      <AdminNav active="overview" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total users" value={num(o.totalUsers)} hint={`${num(new30)} new in 30 days`} />
        <Stat label="Active today" value={num(o.activeToday)} hint="logged or opened the app" />
        <Stat label="WAU" value={num(o.wau)} hint="last 7 days" />
        <Stat label="MAU" value={num(o.mau)} hint="last 30 days" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="New users per day" note="Sign-ups (auth.users.created_at), IST days.">
          <Bars data={o.newUsers} color="var(--purple)" />
        </Section>
        <Section
          title="Daily active users"
          note={o.eventsAvailable ? "Anyone who logged something or sent an app event that day." : "From logged rows only: app_events isn't there yet (run schema_v33.sql)."}
        >
          <Bars data={o.dau} color="var(--green)" />
        </Section>
      </div>

      <Section title="Activity per day" note="Rows created per day over the last 30 days, from the existing tables.">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {o.features.map((x, i) => (
            <div key={x.f.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-semibold">{x.f.label}</span>
                <span className="muted">
                  7d {num(x.last7)} · 30d {num(x.last30)} · all {num(x.total)}
                </span>
              </div>
              {x.error ? (
                <p className="text-xs" style={{ color: "var(--red)" }}>
                  {x.error}
                </p>
              ) : (
                <Bars data={x.series} color={TINTS[i % TINTS.length]} height={44} />
              )}
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Scans by kind" note="All time, from label_scans.report.kind.">
          <HBars rows={o.scanKinds.map((k) => ({ label: k.kind, value: k.count }))} />
        </Section>
        <Section title="App events" note={o.eventsAvailable ? "Last 30 days, by name." : "app_events table not found: run supabase/schema_v33.sql."}>
          <HBars rows={o.eventNames.map((e) => ({ label: e.name, value: e.count }))} color="var(--ink)" />
        </Section>
      </div>

      <Section
        title="AI usage and cost"
        note={
          <>
            Estimated from the <code>usage</code> saved on each scan report ({num(o.scansWithUsage)} scans have it). Meal text parsing, voice and exercise
            descriptions don&apos;t save usage, so they&apos;re not counted here (Railway logs have them). Prices live in src/lib/admin/pricing.ts.
            {o.unpricedCalls ? ` ${num(o.unpricedCalls)} calls used an unpriced model.` : ""}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Est. cost, 30 days" value={usd(o.cost30)} />
          <Stat label="Est. cost, all time" value={usd(o.costAll)} />
        </div>
        <Bars data={o.costSeries} color="var(--orange)" format={(v) => usd(v)} />
        <TableWrap>
          <thead>
            <tr>
              <th>Route</th>
              <th>Model</th>
              <th className="text-right">Calls</th>
              <th className="text-right">In tokens</th>
              <th className="text-right">Out tokens</th>
              <th className="text-right">Cache tokens</th>
              <th className="text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {o.usage.map((u) => (
              <tr key={`${u.route}|${u.model}`}>
                <td>{u.route}</td>
                <td className="muted">{u.model}</td>
                <td className="num text-right">{num(u.calls)}</td>
                <td className="num text-right">{num(u.in)}</td>
                <td className="num text-right">{num(u.out)}</td>
                <td className="num text-right">{num(u.cache)}</td>
                <td className="num text-right">{usd(u.cost)}</td>
              </tr>
            ))}
            {!o.usage.length ? (
              <tr>
                <td colSpan={7} className="muted">
                  No usage recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </TableWrap>
      </Section>
    </>
  );
}
