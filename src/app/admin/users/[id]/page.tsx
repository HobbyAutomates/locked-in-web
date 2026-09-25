import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadUserDetail, profileName } from "@/lib/admin/data";
import { Bars, Section, Stat, TableWrap, num, usd, when } from "@/components/admin/AdminUi";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const d = await loadUserDetail(db, id);
  if (!d) notFound();
  const p = profileName(d.profile);
  const platforms = [...new Set(d.events.map((e) => e.platform).filter(Boolean))].join(" + ");
  const version = d.events.find((e) => e.app_version)?.app_version;
  return (
    <>
      <nav className="flex items-center gap-2 text-[13px]">
        <Link href="/admin/users" className="chip press" style={{ height: 32 }}>
          ← Users
        </Link>
      </nav>

      <Section title={p.username ? `@${p.username}` : "(no username)"} note={`${p.name || "No name"} · ${d.user.email ?? "no email"} · ${d.user.id}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Signed up" value={when(d.user.created_at, false)} />
          <Stat label="Last sign-in" value={when(d.user.last_sign_in_at, false)} />
          <Stat label="Platform" value={platforms || "—"} hint={version ? `v${version}` : "no app events"} />
          <Stat label="Onboarding" value={p.onboarded ? "Done" : "Not done"} hint={`scan AI est. ${usd(d.scanCost)} (last 60 scans)`} />
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Activity, last 30 days" note="Rows logged per day (meal items not double-counted).">
          <Bars data={d.activity} color="var(--green)" />
        </Section>
        <Section title="Counts per feature">
          <TableWrap>
            <thead>
              <tr>
                <th>Feature</th>
                <th className="text-right">30 days</th>
                <th className="text-right">All time</th>
              </tr>
            </thead>
            <tbody>
              {d.counts.map((c) => (
                <tr key={c.f.key}>
                  <td>{c.f.label}</td>
                  <td className="num text-right">{num(c.last30)}</td>
                  <td className="num text-right">{num(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Section>
      </div>

      <Section title={`Squads (${d.squads.length})`}>
        {d.squads.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>Squad</th>
                <th>Code</th>
                <th>Role</th>
                <th className="text-right">Members</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {d.squads.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name || "—"}</td>
                  <td className="num">{s.code}</td>
                  <td>{s.role}</td>
                  <td className="num text-right">{num(s.members)}</td>
                  <td className="whitespace-nowrap">{when(s.joined_at, false)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm muted">Not in any squad.</p>
        )}
      </Section>

      <Section title="Timeline" note="Newest first: up to 60 of each kind, 120 shown.">
        <TableWrap>
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {d.timeline.map((t, i) => (
              <tr key={`${t.at}-${i}`}>
                <td className="whitespace-nowrap">{when(t.at)}</td>
                <td className="whitespace-nowrap font-semibold">{t.kind}</td>
                <td className="min-w-[240px]">{t.text}</td>
              </tr>
            ))}
            {!d.timeline.length ? (
              <tr>
                <td colSpan={3} className="muted">
                  Nothing logged yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </TableWrap>
      </Section>

      <Section title="Recent app events" note={d.eventsAvailable ? "Last 100." : "app_events table not found: run supabase/schema_v33.sql."}>
        <TableWrap>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Props</th>
              <th>Platform</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {d.events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{when(e.created_at)}</td>
                <td className="whitespace-nowrap font-semibold">{e.name}</td>
                <td className="min-w-[200px] break-all text-xs muted">{Object.keys(e.props ?? {}).length ? JSON.stringify(e.props) : ""}</td>
                <td>{e.platform ?? "—"}</td>
                <td>{e.app_version ?? "—"}</td>
              </tr>
            ))}
            {!d.events.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  No events.
                </td>
              </tr>
            ) : null}
          </tbody>
        </TableWrap>
      </Section>
    </>
  );
}
