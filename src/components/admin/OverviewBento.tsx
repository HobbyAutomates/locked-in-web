import Link from "next/link";
import type { Overview } from "@/lib/admin/data";
import type { Dataset } from "@/lib/admin/insights/types";
import { buildOverview, context, RISK_DAYS } from "@/lib/admin/insights/build";
import { buildUserCards, type UserCard } from "@/lib/admin/insights/bento";
import type { Insight } from "@/lib/admin/insights/insights";
import { AdminNav, TableWrap, num, pct, usd } from "./AdminUi";
import { RetentionGrid } from "./InsightsUi";
import { Avatar, Donut, HRows, Head, Kpi, Label, Legend, Pill, RingMeter, Tile, VBars, bento as s, cx, delay } from "./Bento";

const TINTS = ["var(--orange)", "var(--orange)", "var(--green)", "var(--green)", "var(--blue)", "var(--ink)", "var(--purple)", "var(--red)", "var(--red)", "var(--flame)"];
const METHOD_COLOR: Record<string, string> = { search: "var(--blue)", voice: "var(--purple)", photo: "var(--orange)", text: "var(--muted)", barcode: "var(--green)", label: "var(--red)" };
const TONE_DOT: Record<Insight["tone"], string> = { good: "var(--green)", warn: "var(--orange)", info: "var(--muted)" };

/** "2026-09-10" → "Sep 10". */
function short(day: string | undefined): string {
  if (!day) return "";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The /admin overview ("Admin C · bento"): KPI tiles, charts, and one card per user. */
export function OverviewBento({ o, ds }: { o: Overview; ds: Dataset }) {
  const c = context(ds);
  const ins = buildOverview(ds, c);
  const cards = buildUserCards(ds, c);
  const st = ins.stickiness;

  const new7 = o.newUsers.slice(-7).reduce((a, d) => a + d.value, 0);
  const dauVals = o.dau.map((d) => d.value);
  const dauNow = avg(dauVals.slice(-7));
  const dauPrev = avg(dauVals.slice(-14, -7));
  const dauChange = dauPrev > 0 ? Math.round(((dauNow - dauPrev) / dauPrev) * 100) : null;
  const risky = cards.filter((u) => u.atRisk);
  const riskHead = [...risky].sort((a, b) => (a.daysSinceActive ?? 1e9) - (b.daysSinceActive ?? 1e9))[0];
  const cohorts = ins.retention.cohorts.filter((x) => x.size > 0).slice(0, 4).reverse();
  const methods = ins.methods.methods.filter((m) => m.count > 0);
  const methodTotal = methods.reduce((a, m) => a + m.count, 0);
  const foods = ins.topFoods.slice(0, 7);
  const adoption = ins.features.filter((f) => f.users30 > 0).slice(0, 8);

  return (
    <>
      <AdminNav active="overview" />
      <div className={s.root}>
        <div className={s.grid}>
          <Kpi label="Users" value={num(o.totalUsers)} sub={new7 ? `+${num(new7)} this week` : "none new this week"} tone={new7 ? "green" : "muted"} d={0} />
          <Kpi label="Active today" value={num(o.activeToday)} sub={o.totalUsers ? `${pct(o.activeToday / o.totalUsers)} of users` : "no users yet"} tone="green" d={60} />

          <Tile span={2} d={120}>
            <Head
              right={
                dauChange != null ? (
                  <Pill tone={dauChange >= 0 ? "green" : "red"}>
                    {dauChange >= 0 ? "Up" : "Down"} {Math.abs(dauChange)}% vs last week
                  </Pill>
                ) : undefined
              }
            >
              Daily active users
            </Head>
            <VBars
              values={dauVals}
              titles={o.dau.map((d) => `${d.day}: ${d.value}`)}
              height={126}
              color="var(--blue)"
              highlight={dauVals.length - 1}
              dimBefore={dauVals.length - 7}
              d={120}
              label={`Daily active users over ${dauVals.length} days, ${num(dauVals[dauVals.length - 1] ?? 0)} today, peak ${num(Math.max(0, ...dauVals))}`}
            />
            <div className={s.axis}>
              <span>{short(o.dau[0]?.day)}</span>
              <span>{short(o.dau[Math.floor(o.dau.length / 2)]?.day)}</span>
              <span>Today</span>
            </div>
            <div className={s.note}>{o.eventsAvailable ? "Logged something or opened the app. Last 7 days in full colour." : "From logged rows only: app_events isn't there yet."}</div>
          </Tile>

          <Tile span={2} d={180}>
            <Label>Retention by signup week</Label>
            {cohorts.length ? (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${cohorts.length}, minmax(0, 1fr))`, gap: 16 }}>
                {cohorts.map((co, ci) => (
                  <div key={co.week} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 4, height: 64, alignItems: "flex-end" }}>
                      {[0, 1, 2, 3].map((k) => {
                        const v = co.rates[k];
                        return v == null ? (
                          <div key={k} style={{ flex: 1 }} />
                        ) : (
                          <div
                            key={k}
                            className={cx(s.vbar, s.growY)}
                            title={`Week ${k}: ${pct(v)} (${co.counts[k]} of ${co.size})`}
                            style={{ height: Math.max(4, v * 64), background: v ? "var(--purple)" : "var(--track)", ...delay(180, ci * 4 + k) }}
                          />
                        );
                      })}
                    </div>
                    <div className={s.note}>
                      {short(co.week)} · {co.size}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={s.note}>No sign-ups in the last {ins.retention.weeks} weeks.</p>
            )}
            <div className={s.note}>Bars = weeks 0 to 3 after signing up · share still active. Full grid below.</div>
          </Tile>

          <Kpi label="Stickiness" value={pct(st.dauWau)} sub={`DAU ÷ WAU · WAU ${st.wau}`} d={240} />
          <Kpi
            label="At risk"
            value={num(risky.length)}
            sub={riskHead ? `${riskHead.label} · ${riskHead.daysSinceActive == null ? "never active" : `${riskHead.daysSinceActive} days`}` : `no one quiet for ${RISK_DAYS}+ days`}
            tone={risky.length ? "red" : "green"}
            d={300}
          />

          <Tile span={2} d={360}>
            <Label>How food gets logged · 30 days</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <Donut
                parts={methods.map((m) => ({ value: m.count, color: METHOD_COLOR[m.label] ?? "var(--muted)" }))}
                center={methodTotal ? num(methodTotal) : "—"}
                sub="meals"
                d={360}
                label={`How food is logged: ${methods.map((m) => `${m.label} ${m.count}`).join(", ") || "none recorded"}`}
              />
              <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                {methods.length ? methods.map((m) => <Legend key={m.label} color={METHOD_COLOR[m.label] ?? "var(--muted)"} label={cap(m.label)} value={pct(m.count / methodTotal)} />) : <p className={s.note}>No meal_logged events yet.</p>}
              </div>
            </div>
            {ins.methods.untracked || ins.methods.unknown ? (
              <div className={s.note}>
                {ins.methods.untracked ? `${num(ins.methods.untracked)} older meals have no method recorded (before app events).` : ""}
                {ins.methods.unknown ? ` ${num(ins.methods.unknown)} events had no method.` : ""}
              </div>
            ) : null}
          </Tile>

          <Tile span={2} d={420}>
            <Label>Most-logged foods · everyone, 90 days</Label>
            <HRows rows={foods.map((f) => ({ label: f.name, value: f.count, title: `${f.count} times by ${f.users} ${f.users === 1 ? "user" : "users"}` }))} color="var(--orange)" d={420} empty="Nothing logged yet." />
          </Tile>

          <Tile span={3} d={480}>
            <Head right={<Link href="/admin/features" className={s.link}>All features</Link>}>Top features · 30-day adoption</Head>
            <HRows
              rows={adoption.map((f) => ({ label: f.label, value: Math.round((f.adoption30 ?? 0) * 100), title: `${f.users30} of ${f.active30} active users · ${f.perUserWeek ?? 0} uses per active user per week` }))}
              color="var(--blue)"
              max={100}
              format={(v) => `${v}%`}
              d={480}
              empty="No feature use in 30 days."
            />
            <div className={s.note}>Share of users active in 30 days who used it. Hover a row for users and weekly frequency.</div>
          </Tile>

          <Tile span={3} d={540}>
            <Label>Activation funnel</Label>
            <HRows rows={ins.funnel.map((f) => ({ label: f.label, value: f.users, title: `${pct(f.ofStart)} of sign-ups · ${pct(f.ofPrev)} of the step before` }))} color="var(--purple)" d={540} />
            <div className={s.note}>
              Nested steps over every sign-up (meals, logging days and active days in the last 90 days).{" "}
              {ins.funnel
                .slice(1)
                .map((f) => `${f.label.toLowerCase()} ${pct(f.ofPrev)}`)
                .join(" · ")}
            </div>
          </Tile>

          <Tile span={3} d={600}>
            <Label>Insights · last 30 days</Label>
            {ins.insights.length ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, lineHeight: 1.45 }}>
                {ins.insights.map((i) => (
                  <li key={i.key} style={{ display: "flex", gap: 9 }}>
                    <span className={s.dot} style={{ background: TONE_DOT[i.tone], marginTop: 6 }} aria-hidden="true" />
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.note}>Nothing to report yet.</p>
            )}
          </Tile>

          <Tile span={3} d={660}>
            <Label>Stickiness · DAU ÷ WAU per day</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {[
                ["DAU ÷ WAU", pct(st.dauWau), `avg DAU ${st.dauAvg7}`],
                ["DAU ÷ MAU", pct(st.dauMau), `MAU ${st.mau}`],
                ["Active 7d / 30d", `${ins.active7} / ${ins.active30}`, "users"],
              ].map(([a, b, cc]) => (
                <div key={a} className={s.well}>
                  <div className={s.label} style={{ fontSize: 12 }}>
                    {a}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{b}</div>
                  <div className={s.note}>{cc}</div>
                </div>
              ))}
            </div>
            <VBars values={st.series.map((p) => Math.round((p.ratio ?? 0) * 100))} titles={st.series.map((p) => `${p.day}: ${p.ratio == null ? "—" : pct(p.ratio)} (DAU ${p.dau}, WAU ${p.wau})`)} height={70} color="var(--green)" d={660} label="Daily DAU to WAU ratio over 30 days" />
            <div className={s.note}>14% is about one day a week, 100% is every day.</div>
          </Tile>

          <Tile span={6} d={720}>
            <Head right={<span className={s.note}>rows created per day · 30 days</span>}>Activity</Head>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px 22px" }}>
              {o.features.map((x, i) => (
                <div key={x.f.key} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                    <b>{x.f.label}</b>
                    <span className={s.note}>
                      7d {num(x.last7)} · 30d {num(x.last30)} · all {num(x.total)}
                    </span>
                  </div>
                  {x.error ? (
                    <p className={s.note} style={{ color: "var(--red)" }}>
                      {x.error}
                    </p>
                  ) : (
                    <VBars values={x.series.map((p) => p.value)} titles={x.series.map((p) => `${p.day}: ${p.value}`)} height={40} gap={2} color={TINTS[i % TINTS.length]} d={720} label={`${x.f.label} per day, 30 days`} />
                  )}
                </div>
              ))}
            </div>
          </Tile>
        </div>

        <div className={s.sectionHead}>
          <h2 className={s.h2}>How each person uses Locked In</h2>
          <span className={s.note} style={{ fontSize: 13 }}>
            Sorted by activity · {num(risky.length)} at risk (no activity in {RISK_DAYS}+ days)
          </span>
        </div>
        <div className={s.cards}>
          {cards.map((u, i) => (
            <UserCardView key={u.id} u={u} d={Math.min(i, 12) * 60} />
          ))}
        </div>

        <div className={s.sectionHead}>
          <h2 className={s.h2}>More detail</h2>
        </div>
        <div className={s.grid}>
          <Tile span={6}>
            <Label>Weekly retention by signup week</Label>
            <div className={s.note}>Share of each signup-week cohort active in the Nth week after signing up (W0 = the signup week). Monday-start weeks, IST.</div>
            <RetentionGrid r={ins.retention} />
          </Tile>
          <Tile span={3}>
            <Label>New users per day · 30 days</Label>
            <VBars values={o.newUsers.map((p) => p.value)} titles={o.newUsers.map((p) => `${p.day}: ${p.value}`)} height={70} color="var(--purple)" label="Sign-ups per day" />
            <div className={s.axis}>
              <span>{short(o.newUsers[0]?.day)}</span>
              <span>Today</span>
            </div>
          </Tile>
          <Tile span={3}>
            <Label>Scans by kind · all time</Label>
            <HRows rows={o.scanKinds.map((k) => ({ label: k.kind, value: k.count }))} color="var(--blue)" />
          </Tile>
          <Tile span={6}>
            <Head right={<span className={s.note}>{o.eventsAvailable ? "last 30 days, by name" : "app_events table not found"}</span>}>App events</Head>
            <HRows rows={o.eventNames.map((e) => ({ label: e.name, value: e.count }))} color="var(--ink)" />
          </Tile>
          <Tile span={6}>
            <Label>AI usage and cost</Label>
            <div className={s.note}>
              Estimated from the <code>usage</code> saved on each scan report ({num(o.scansWithUsage)} scans have it). Meal text parsing, voice and exercise descriptions don&apos;t save usage, so they&apos;re not counted here (Railway logs
              have them). Prices live in src/lib/admin/pricing.ts.
              {o.unpricedCalls ? ` ${num(o.unpricedCalls)} calls used an unpriced model.` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div className={s.well}>
                <div className={s.label}>Est. cost, 30 days</div>
                <div className={s.mid} style={{ marginTop: 4 }}>
                  {usd(o.cost30)}
                </div>
              </div>
              <div className={s.well}>
                <div className={s.label}>Est. cost, all time</div>
                <div className={s.mid} style={{ marginTop: 4 }}>
                  {usd(o.costAll)}
                </div>
              </div>
            </div>
            <VBars values={o.costSeries.map((p) => p.value)} titles={o.costSeries.map((p) => `${p.day}: ${usd(p.value)}`)} height={60} color="var(--orange)" label="Estimated AI cost per day" />
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
          </Tile>
        </div>
        {ins.readErrors.length ? <p className={s.note}>Couldn&apos;t read: {ins.readErrors.map((e) => `${e.table} (${e.message})`).join("; ")}. Those numbers read as zero.</p> : null}
      </div>
    </>
  );
}

function UserCardView({ u, d }: { u: UserCard; d: number }) {
  const hit = u.proteinHit;
  return (
    <Tile as="div" d={d} risk={u.atRisk} style={{ borderRadius: 22, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar letter={u.initial} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name || u.label}</div>
          <div className={s.note} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[u.name ? u.label : "", u.platform, u.lastActive].filter(Boolean).join(" · ")}
          </div>
        </div>
        {u.atRisk ? <Pill tone="red">At risk</Pill> : <Pill tone="green">{u.days7}/7 days</Pill>}
      </div>
      <VBars
        values={u.spark}
        height={30}
        color={u.atRisk ? "var(--red)" : "var(--blue)"}
        zeroColor="var(--track)"
        d={d}
        label={`Feature uses per day, last 7 days: ${u.spark.join(", ")}`}
        titles={u.spark.map((v, i) => `${7 - i === 1 ? "today" : `${7 - i - 1} days ago`}: ${v}`)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <RingMeter value={hit} text={hit == null ? "—" : pct(hit)} d={d} label={hit == null ? "No protein target or no food logged" : `Protein target hit on ${pct(hit)} of logged days`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, minWidth: 0 }}>
          <span>
            <b>{u.mealsPerLoggedDay ?? "—"}</b> meals a day · <b>{u.avgKcal != null ? u.avgKcal.toLocaleString("en-IN") : "—"}</b> kcal
          </span>
          <span className={s.inkMuted}>Protein target hit · {num(u.meals7)} meals this week</span>
          <span className={s.inkMuted} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Top: {u.topFoods.length ? u.topFoods.join(", ") : "nothing logged"}
          </span>
        </div>
      </div>
      {u.topFeatures.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {u.topFeatures.map((f) => (
            <Pill key={f.key} tone="ink">
              {f.label} · {f.count}
            </Pill>
          ))}
        </div>
      ) : null}
      <Link href={`/admin/users/${u.id}`} className={s.link}>
        Open deep dive
      </Link>
    </Tile>
  );
}
