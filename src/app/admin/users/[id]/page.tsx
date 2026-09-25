import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { loadUserDetail, profileName } from "@/lib/admin/data";
import { loadUserDataset } from "@/lib/admin/insights/load";
import { buildUserInsights } from "@/lib/admin/insights/build";
import { Bars, HBars, HeatCell, HourBars, Section, Stat, TableWrap, num, pct, usd, when } from "@/components/admin/AdminUi";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [d, ds] = await Promise.all([loadUserDetail(db, id), loadUserDataset(db, id)]);
  if (!d) notFound();
  const ui = buildUserInsights(ds, id);
  const { engagement: en, tracking: tr, social: so, profile: pr } = ui;
  const n = tr.nutrition;
  const matrixRows = ui.matrix.rows.filter((r) => r.total > 0);
  const matrixMax = Math.max(1, ...matrixRows.flatMap((r) => r.weeks));
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

      <Section title="Profile" note="Age is shown as a band only; the date of birth is never displayed.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Age band" value={pr.ageBand ?? "—"} />
          <Stat label="Goal" value={pr.goal} />
          <Stat label="Platform" value={ui.platform || "—"} />
          <Stat label="App version" value={ui.appVersion || "—"} hint="latest app event" />
        </div>
        {pr.targets.length ? (
          <p className="text-[13px]">
            <span className="font-semibold">Targets: </span>
            {pr.targets.map((t) => `${t.label} ${t.value}`).join(" · ")}
          </p>
        ) : null}
      </Section>

      <Section title="Engagement" note="Active = any app event or logged row that IST day. Sessions come from app_open events (web sends one per browser session).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Days active, 14d" value={`${en.active14} / 14`} />
          <Stat label="Days active, 30d" value={`${en.active30} / 30`} />
          <Stat label="Current streak" value={`${en.streak} d`} hint={en.lastActive ? `last active ${en.lastActive}${en.atRisk ? " · at risk" : ""}` : "never active in 90 days"} />
          <Stat label="Sessions / day" value={en.sessions.perDay ?? "—"} hint={`${num(en.sessions.sessions)} app opens on ${num(en.sessions.days)} days (30d)`} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold muted">Feature uses per day, 30 days</p>
            <Bars data={en.daily} color="var(--green)" height={56} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold muted">Time of day (IST), 30 days{en.peak ? ` · busiest ${en.peak}` : ""}</p>
            <HourBars hours={en.hours} />
          </div>
        </div>
      </Section>

      <Section title="Feature use by week" note="Uses per feature per Monday-start week (events, plus table rows from before this user's first event). Features unused in all 8 weeks are hidden.">
        {matrixRows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>Feature</th>
                {ui.matrix.weeks.map((w) => (
                  <th key={w} className="text-center">
                    {w.slice(5)}
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap">{r.label}</td>
                  {r.weeks.map((v, i) => (
                    <HeatCell key={i} value={v ? v / matrixMax : null} label={v ? String(v) : ""} color="var(--blue)" />
                  ))}
                  <td className="num text-right font-semibold">{num(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm muted">No feature use in the last 8 weeks.</p>
        )}
      </Section>

      <Section title="What they track, last 30 days" note="From the meals, meal_items, water_log, weight_log, workouts and exercise_log tables; logging methods from meal_logged events.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Meals / day" value={tr.mealsPerDay30} hint={`${num(tr.meals30)} meals · ${n.mealsPerLoggedDay ?? "—"} per logged day`} />
          <Stat label="Avg kcal" value={n.avgKcal ?? "—"} hint={n.kcalTarget ? `target ${n.kcalTarget} · ${pct(n.kcalOfTarget)}` : "no target"} />
          <Stat label="Avg protein" value={n.avgProtein != null ? `${n.avgProtein} g` : "—"} hint={n.proteinTarget ? `target ${n.proteinTarget} g · ${pct(n.proteinOfTarget)}` : "no target"} />
          <Stat label="Protein target hit" value={pct(n.proteinHitRate)} hint={`${n.proteinHitDays} of ${n.daysLogged} logged days`} />
          <Stat label="Water" value={`${tr.water.perWeek} / wk`} hint={`${tr.water.entries} entries on ${tr.water.days} days`} />
          <Stat label="Weight" value={`${tr.weight.perWeek} / wk`} hint={`${tr.weight.entries} weigh-ins on ${tr.weight.days} days`} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-semibold muted">Meal types</p>
            <HBars rows={tr.mealTypes.map((c) => ({ label: c.label, value: c.count }))} color="var(--orange)" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold muted">Logging method{tr.methods.untracked ? ` (+${tr.methods.untracked} meals before events)` : ""}</p>
            <HBars rows={tr.methods.methods.map((c) => ({ label: c.label, value: c.count }))} color="var(--purple)" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold muted">Workouts by kind</p>
            <HBars rows={tr.workouts.map((c) => ({ label: c.label, value: c.count }))} color="var(--green)" />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold muted">Top 10 foods</p>
          <HBars rows={tr.topFoods.map((f) => ({ label: f.name, value: f.count }))} color="var(--ink)" />
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Social, last 90 days" note="Squads = current memberships. Messages = Chat posts; shares = feed posts. Squad opens from squad_opened events.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Squads" value={num(so.squads)} />
            <Stat label="Messages" value={num(so.messages)} />
            <Stat label="Feed shares" value={num(so.feedShares)} />
            <Stat label="Squad opens" value={num(so.squadOpens)} />
            <Stat label="Reactions given" value={num(so.reactionsGiven)} />
            <Stat label="Reactions received" value={num(so.reactionsReceived)} />
            <Stat label="Challenges created" value={num(so.challengesCreated)} />
            <Stat label="Battle wins" value={num(so.battleWins)} />
          </div>
        </Section>
        <Section title="Errors seen, last 90 days" note="error_shown events, grouped by message and screen.">
          {ui.errors.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Screen</th>
                  <th className="text-right">Times</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {ui.errors.map((e) => (
                  <tr key={`${e.message}|${e.screen}`}>
                    <td className="min-w-[200px]">{e.message}</td>
                    <td>{e.screen || "—"}</td>
                    <td className="num text-right">{num(e.count)}</td>
                    <td className="whitespace-nowrap">{when(e.last)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm muted">No errors shown.</p>
          )}
        </Section>
      </div>
      {ui.readErrors.length ? <p className="text-xs muted">Couldn&apos;t read: {ui.readErrors.map((e) => `${e.table} (${e.message})`).join("; ")}.</p> : null}

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
