import Link from "next/link";
import { profileName, type UserDetail } from "@/lib/admin/data";
import type { Dataset } from "@/lib/admin/insights/types";
import { buildUserInsights, context } from "@/lib/admin/insights/build";
import { lastFourteen, readWeeks, trackCompare, weekHourGrid, type MatrixRead, type TrackCompare } from "@/lib/admin/insights/bento";
import { FEATURE_BY_KEY } from "@/lib/admin/insights/catalog";
import { istDay, within } from "@/lib/admin/insights/time";
import { TableWrap, num, pct, usd, when } from "./AdminUi";
import { Avatar, BackIcon, Donut, DumbbellIcon, Head, HitStrip, HRows, Label, Legend, Pill, StackBar, Tile, VBars, bento as s, cx, delay, inkClass, type Tone } from "./Bento";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const METHOD_COLOR: Record<string, string> = { search: "var(--blue)", voice: "var(--purple)", photo: "var(--orange)", text: "var(--muted)", barcode: "var(--green)", label: "var(--red)" };
const MEAL_COLOR: Record<string, string> = { breakfast: "var(--orange)", lunch: "var(--green)", snack: "var(--purple)", dinner: "var(--blue)", unset: "var(--muted)" };
const READ_TONE: Record<MatrixRead, Tone> = { "New this week": "blue", "Growing fast": "green", Growing: "green", Dropping: "red", Steady: "muted", Quiet: "muted" };

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
function short(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
/** "android + web" → "Android + Web". */
function platformName(p: string): string {
  return p
    .split(" + ")
    .map((x) => (x === "ios" ? "iOS" : cap(x)))
    .join(" + ");
}
function listOf(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** One user ("One user · bento"): last-14-days calendar + tiles, then the deep dive. `ds` is that user's Dataset. */
export function UserBento({ id, d, ds }: { id: string; d: UserDetail; ds: Dataset }) {
  const c = context(ds);
  const ui = buildUserInsights(ds, id, c);
  const { engagement: en, tracking: tr, social: so, profile: pr } = ui;
  const n = tr.nutrition;
  const p = profileName(d.profile);
  const days = lastFourteen(ds, id);
  const cmp = trackCompare(ds, id);
  const heat = weekHourGrid(ds, id, c);
  const heatMax = Math.max(1, ...heat.flat());
  const scans30 = ds.scans.filter((x) => x.user_id === id && within(istDay(x.created_at), ds.today, 30)).length;

  const title = p.name || (p.username ? `@${p.username}` : "(no name)");
  const methods = tr.methods.methods.filter((m) => m.count > 0);
  const methodTotal = methods.reduce((a, m) => a + m.count, 0);
  const topMethod = methods[0];
  const mealTypes = tr.mealTypes.filter((m) => m.count > 0);
  const mealTotal = mealTypes.reduce((a, m) => a + m.count, 0);

  // Feature × week: last 8 weeks, features used at least once; plain-English notes underneath.
  const weeks = ui.matrix.weeks;
  const used = ui.matrix.rows.filter((r) => r.total > 0);
  const mMax = Math.max(1, ...used.flatMap((r) => r.weeks));
  const reads = used.map((r) => ({ r, read: readWeeks(r.weeks) }));
  const pickedUp = reads.filter((x) => x.read === "New this week" || (x.r.weeks.slice(0, -2).every((v) => !v) && x.r.weeks.slice(-2).some(Boolean))).map((x) => x.r.label.toLowerCase());
  const core = used.filter((r) => r.weeks.slice(-4).every((v) => v > 0))[0];
  const never = ui.matrix.rows.filter((r) => r.total === 0 && FEATURE_BY_KEY.get(r.key)?.instrumented && r.key !== "food_any").map((r) => r.label.toLowerCase());
  const cols = `minmax(120px, 1.4fr) repeat(${weeks.length}, minmax(30px, 1fr)) 48px 104px`;

  const status: { tone: Tone; text: string }[] = [];
  status.push(en.atRisk ? { tone: "red", text: en.daysSinceActive == null ? "Never active" : `At risk · ${en.daysSinceActive} days quiet` } : { tone: "green", text: en.active14 >= 10 ? "Engaged" : "Active" });
  if (en.streak >= 2) status.push({ tone: "orange", text: `${en.streak}-day streak` });
  if (topMethod && methodTotal >= 5 && topMethod.count / methodTotal >= 0.4) status.push({ tone: "blue", text: `${cap(topMethod.label)} power user` });

  const sub = [p.username ? `@${p.username}` : "", pr.ageBand ?? "", pr.goal !== "—" ? pr.goal : "", ui.platform ? `${platformName(ui.platform)}${ui.appVersion ? ` ${ui.appVersion}` : ""}` : "", `joined ${when(d.user.created_at, false)}`].filter(Boolean).join(" · ");

  return (
    <div className={s.root}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }} className={s.rise}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <Link href="/admin" aria-label="Back to overview" className={s.back}>
            <BackIcon />
          </Link>
          <Avatar letter={(p.name || p.username || d.user.email || "?").charAt(0).toUpperCase()} size={56} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.1 }}>{title}</h2>
            <div className={s.note} style={{ fontSize: 13, marginTop: 3 }}>
              {sub}
            </div>
            <div className={s.note} style={{ marginTop: 2 }}>
              {d.user.email ?? "no email"} · {d.user.id}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {status.map((x) => (
            <Pill key={x.text} tone={x.tone}>
              {x.text}
            </Pill>
          ))}
        </div>
      </header>

      <div className={s.grid}>
        {/* ---- last 14 days: summary tiles + calendar ---- */}
        <Tile span={3} d={60}>
          <Head right={<span className={s.note}>bars = each day</span>}>Last 14 days · at a glance</Head>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {[
              { name: "Days logged", value: `${days.logged}/14`, color: "var(--green)", series: days.days.map((x) => (x.meals ? 1 : 0)) },
              { name: "Meals", value: num(days.meals), color: "var(--blue)", series: days.days.map((x) => x.meals) },
              { name: "Workouts", value: num(days.workouts), color: "var(--orange)", series: days.days.map((x) => x.workouts) },
              { name: "Missed", value: `${days.missed.length} ${days.missed.length === 1 ? "day" : "days"}`, color: "var(--red)", series: days.days.map((x) => (!x.meals && !x.today ? 1 : 0)) },
            ].map((k, ki) => (
              <div key={k.name} className={s.well} style={{ borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <span className={s.label} style={{ fontSize: 12 }}>
                  {k.name}
                </span>
                <span className={s.mid}>{k.value}</span>
                <VBars values={k.series} height={30} gap={2} color={k.color} zeroColor="var(--track)" d={60 + ki * 40} label={`${k.name} per day, last 14 days: ${k.series.join(", ")}`} titles={days.days.map((x, i) => `${x.day}: ${k.series[i]}`)} />
              </div>
            ))}
          </div>
        </Tile>

        <Tile span={3} d={120}>
          <div className={s.head}>
            <Label>Last 14 days</Label>
            <span style={{ fontSize: 13 }}>
              <b>{days.logged}</b> of 14 days logged · <b>{days.workouts}</b> {days.workouts === 1 ? "workout" : "workouts"}
            </span>
          </div>
          <div className={s.cal}>
            {days.days.slice(0, 7).map((x) => (
              <div key={x.day} className={s.calHead}>
                {WD[x.weekday]}
              </div>
            ))}
            {days.days.map((x, i) => {
              const full = x.meals > 0 && x.workouts > 0;
              const bg = full ? "var(--green)" : x.meals > 0 ? "var(--b-soft-green)" : "var(--card2)";
              const fg = full ? "var(--b-on-accent)" : x.meals > 0 ? "var(--ink)" : "var(--muted)";
              const what = `${short(x.day)}: ${x.meals} ${x.meals === 1 ? "meal" : "meals"}${x.workouts ? `, trained (${x.workouts})` : ""}${x.today ? ", today" : ""}`;
              return (
                <div key={x.day} className={cx(s.calCell, s.fade, x.today && s.calToday)} style={{ background: bg, color: fg, ...delay(120, i * 3) }} title={what} aria-label={what}>
                  <div className={s.calDate}>
                    {Number(x.day.slice(8))}
                    {x.workouts ? <DumbbellIcon color={fg} /> : null}
                  </div>
                  <div className={s.calDots} aria-hidden="true">
                    {Array.from({ length: Math.min(x.meals, 6) }, (_, k) => (
                      <span key={k} style={{ background: fg }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
            <span>Dots = meals logged</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <DumbbellIcon color="var(--muted)" /> = trained
            </span>
            <span>{days.missed.length ? `Missed: ${days.missed.slice(-4).map((x) => `${WD[new Date(`${x}T00:00:00Z`).getUTCDay()]} ${short(x)}`).join(", ")}${days.missed.length > 4 ? ` and ${days.missed.length - 4} more` : ""}` : "No missed days"}</span>
          </div>
        </Tile>

        {/* ---- engagement + profile ---- */}
        <Tile span={3} d={180}>
          <Head right={<span className={s.note}>any app event or logged row, IST days</span>}>Engagement</Head>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {[
              ["Active 14d", `${en.active14}/14`, ""],
              ["Active 30d", `${en.active30}/30`, ""],
              ["Streak", `${en.streak} d`, en.lastActive ? `last ${short(en.lastActive)}` : "never"],
              ["Sessions/day", String(en.sessions.perDay ?? "—"), `${num(en.sessions.sessions)} opens`],
            ].map(([a, b, cc]) => (
              <div key={a} className={s.well} style={{ padding: 10 }}>
                <div className={s.label} style={{ fontSize: 11.5 }}>
                  {a}
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>{b}</div>
                {cc ? <div className={s.note}>{cc}</div> : null}
              </div>
            ))}
          </div>
          <VBars values={en.daily.map((x) => x.value)} titles={en.daily.map((x) => `${x.day}: ${x.value}`)} height={64} color="var(--green)" highlight={en.daily.length - 1} hiColor="var(--ink)" d={180} label="Feature uses per day, last 30 days" />
          <div className={s.axis}>
            <span>{en.daily[0] ? short(en.daily[0].day) : ""}</span>
            <span>feature uses per day</span>
            <span>Today</span>
          </div>
        </Tile>

        <Tile span={3} d={240}>
          <Head right={<span className={s.note}>age as a band only</span>}>Profile</Head>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontSize: 13 }}>
            {[
              ["Age band", pr.ageBand ?? "—"],
              ["Goal", pr.goal],
              ["Platform", ui.platform ? platformName(ui.platform) : "—"],
              ["App version", ui.appVersion || "—"],
              ["Signed up", when(d.user.created_at, false)],
              ["Last sign-in", when(d.user.last_sign_in_at, false)],
              ["Onboarding", p.onboarded ? "Done" : "Not done"],
              ["Scan AI est.", `${usd(d.scanCost)} · last 60 scans`],
            ].map(([a, b]) => (
              <div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--hair)", paddingTop: 7, minWidth: 0 }}>
                <span className={s.inkMuted}>{a}</span>
                <b style={{ textAlign: "right", overflowWrap: "anywhere" }}>{b}</b>
              </div>
            ))}
          </div>
          {pr.targets.length ? (
            <div className={s.note} style={{ fontSize: 13 }}>
              <b style={{ color: "var(--ink)" }}>Targets:</b> {pr.targets.map((t) => `${t.label} ${t.value}`).join(" · ")}
            </div>
          ) : null}
        </Tile>

        {/* ---- food ---- */}
        <Tile span={2} d={300}>
          <Label>Meal types · 30 days</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Donut size={140} stroke={18} parts={mealTypes.map((m) => ({ value: m.count, color: MEAL_COLOR[m.label] ?? "var(--muted)" }))} center={tr.mealsPerDay30} sub="meals a day" d={300} label={`Meal types: ${mealTypes.map((m) => `${m.label} ${m.count}`).join(", ") || "none"}`} />
            <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
              {mealTypes.length ? mealTypes.map((m) => <Legend key={m.label} color={MEAL_COLOR[m.label] ?? "var(--muted)"} label={m.label === "unset" ? "No type" : cap(m.label)} value={pct(m.count / mealTotal)} />) : <p className={s.note}>No meals in 30 days.</p>}
            </div>
          </div>
        </Tile>

        <Tile span={2} d={360}>
          <Label>Against their targets · daily average</Label>
          <Bullet name="Calories" value={n.avgKcal} target={n.kcalTarget} unit="kcal" color="var(--ink)" d={360} />
          <Bullet name="Protein" value={n.avgProtein} target={n.proteinTarget} unit="g" color="var(--blue)" d={400} />
          <div style={{ fontSize: 13 }}>
            {n.daysLogged ? (
              <>
                Hit protein on{" "}
                <b>
                  {cmp.cur.proteinHitDays} of {n.daysLogged} logged days
                </b>
                {cmp.kcalTarget ? (
                  <>
                    {" "}
                    · calories (±10%) on <b>{cmp.cur.kcalHitDays}</b>
                  </>
                ) : null}
              </>
            ) : (
              <span className={s.inkMuted}>No food logged in 30 days.</span>
            )}
          </div>
          <div className={s.note}>Averages over days with food logged ({n.mealsPerLoggedDay ?? "—"} meals per logged day).</div>
        </Tile>

        <Tile span={2} d={420}>
          <Label>Most logged · 30 days</Label>
          <HRows rows={tr.topFoods.slice(0, 7).map((f) => ({ label: f.name, value: f.count }))} color="var(--orange)" d={420} empty="Nothing logged in 30 days." />
        </Tile>

        <Tile span={2} d={480}>
          <Label>How they log food</Label>
          <StackBar parts={methods.map((m) => ({ value: m.count, color: METHOD_COLOR[m.label] ?? "var(--muted)" }))} d={480} label={`Logging methods: ${methods.map((m) => `${m.label} ${m.count}`).join(", ") || "none recorded"}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 18px" }}>
            {methods.length ? methods.map((m) => <Legend key={m.label} color={METHOD_COLOR[m.label] ?? "var(--muted)"} label={cap(m.label)} value={pct(m.count / methodTotal)} />) : <p className={s.note}>No meal_logged events in 30 days.</p>}
          </div>
          {tr.methods.untracked ? <div className={s.note}>+{num(tr.methods.untracked)} meals from before app events (method not recorded).</div> : null}
        </Tile>

        <Tile span={2} d={540}>
          <Label>Social + scans · 90 days</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {[
              ["Squads", num(so.squads)],
              ["Messages", num(so.messages)],
              ["Feed shares", num(so.feedShares)],
              ["Reactions given", num(so.reactionsGiven)],
              ["Reactions got", num(so.reactionsReceived)],
              ["Squad opens", num(so.squadOpens)],
              ["Challenges", num(so.challengesCreated)],
              ["Battle wins", num(so.battleWins)],
              ["Scans, 30d", num(scans30)],
            ].map(([a, b]) => (
              <div key={a} className={s.well} style={{ padding: 10 }}>
                <div className={s.label} style={{ fontSize: 11.5 }}>
                  {a}
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>{b}</div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile span={2} d={600}>
          <Head right={ui.errors.length ? <Pill tone="red">{num(ui.errors.reduce((a, e) => a + e.count, 0))} shown</Pill> : <Pill tone="green">None</Pill>}>Errors they saw · 90 days</Head>
          {ui.errors.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              {ui.errors.slice(0, 8).map((e) => (
                <div key={`${e.message}|${e.screen}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    &ldquo;{e.message}&rdquo;{e.screen ? ` · ${e.screen}` : ""}
                    {e.count > 1 ? <b> ×{e.count}</b> : null}
                  </span>
                  <span className={s.inkMuted} style={{ whiteSpace: "nowrap" }}>
                    {short(e.last.slice(0, 10))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={s.note}>No error_shown events.</p>
          )}
        </Tile>

        {/* ---- when + feature matrix ---- */}
        <Tile span={3} d={660}>
          <Head right={en.peak ? <span className={s.note}>busiest {en.peak}</span> : undefined}>When they use the app · 30 days, IST</Head>
          <div className={s.heat} role="img" aria-label={`Activity by weekday and hour${en.peak ? `, busiest ${en.peak}` : ""}`}>
            {heat.map((row, r) => [
              <em key={`l${r}`} className={s.heatLab}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][r]}
              </em>,
              ...row.map((v, h) => (
                <i
                  key={`${r}-${h}`}
                  className={s.fade}
                  title={`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][r]} ${String(h).padStart(2, "0")}:00 · ${v}`}
                  style={{ background: v ? `color-mix(in srgb, var(--blue) ${Math.round(22 + (v / heatMax) * 78)}%, var(--card2))` : "var(--card2)", ...delay(660, h) }}
                />
              )),
            ])}
            <em />
            {Array.from({ length: 24 }, (_, h) => (
              <em key={`h${h}`} className={s.heatLab} style={{ textAlign: "center" }}>
                {h % 6 === 0 ? `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "a" : "p"}` : ""}
              </em>
            ))}
          </div>
          <div className={s.note}>App events plus logged rows from before their first event.</div>
        </Tile>

        <Tile span={3} d={720}>
          <Head right={<span className={s.note}>times used · last {weeks.length} weeks</span>}>Feature use by week</Head>
          {used.length ? (
            <div className={s.matrixWrap}>
              <div className={s.matrix} style={{ gridTemplateColumns: cols }}>
                <div />
                {weeks.map((w) => (
                  <div key={w} className={s.note} style={{ fontSize: 11, fontWeight: 600, textAlign: "center" }}>
                    {short(w)}
                  </div>
                ))}
                <div className={s.note} style={{ fontSize: 11, fontWeight: 600, textAlign: "right" }}>
                  Total
                </div>
                <div className={s.note} style={{ fontSize: 11, fontWeight: 600, paddingLeft: 8 }}>
                  Trend
                </div>
                {reads.map(({ r, read }, ri) => [
                  <div key={`n${r.key}`} style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>
                    {r.label}
                  </div>,
                  ...r.weeks.map((v, wi) => (
                    <div
                      key={`${r.key}-${wi}`}
                      className={cx(s.mcell, s.fade)}
                      title={`${r.label}, week of ${short(weeks[wi])}: ${v}`}
                      style={{ background: v ? `color-mix(in srgb, var(--purple) ${Math.round(18 + (v / mMax) * 52)}%, var(--card2))` : "var(--card2)", color: v ? "var(--ink)" : "var(--muted)", ...delay(720, ri * 2 + wi) }}
                    >
                      {v || "·"}
                    </div>
                  )),
                  <div key={`t${r.key}`} style={{ fontSize: 13, fontWeight: 800, textAlign: "right" }}>
                    {num(r.total)}
                  </div>,
                  <div key={`r${r.key}`} className={inkClass(READ_TONE[read])} style={{ fontSize: 12, fontWeight: 700, paddingLeft: 8 }}>
                    {read}
                  </div>,
                ])}
              </div>
            </div>
          ) : (
            <p className={s.note}>No feature use in the last {weeks.length} weeks.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, paddingTop: 6, borderTop: "1px solid var(--hair)" }}>
            {pickedUp.length ? (
              <span>
                <b>Picked up:</b> <span className={s.inkMuted}>{listOf(pickedUp)} (none before the last two weeks).</span>
              </span>
            ) : null}
            {core ? (
              <span>
                <b>Core habit:</b>{" "}
                <span className={s.inkMuted}>
                  {core.label.toLowerCase()}, {num(core.total)} times, every one of the last 4 weeks.
                </span>
              </span>
            ) : null}
            {never.length ? (
              <span>
                <b>Not used in {weeks.length} weeks:</b> <span className={s.inkMuted}>{listOf(never)}.</span>
              </span>
            ) : null}
            <span className={s.note}>Events, plus table rows from before this user&apos;s first event. Trend compares the latest week with 3 weeks earlier.</span>
          </div>
        </Tile>

        {/* ---- what they track ---- */}
        <Tile span={3} d={780}>
          <Head right={<span className={s.note}>vs previous 30 days</span>}>What they track · 30 days</Head>
          <Tracks cmp={cmp} mealTypes={mealTypes.map((m) => m.label)} />
          <div style={{ fontSize: 13 }}>
            <b>Top foods:</b> <span className={s.inkMuted}>{tr.topFoods.length ? tr.topFoods.slice(0, 5).map((f) => `${f.name.toLowerCase()} ×${f.count}`).join(", ") : "none"}</span>
          </div>
          <div className={s.well} style={{ fontSize: 13, padding: "10px 12px" }}>
            <b>Read:</b> <span className={s.inkMuted}>{readTracking(cmp)}</span>
          </div>
          <div className={s.note}>Water and weight rows record entries, not amounts. Workouts = workouts plus standalone activities.</div>
        </Tile>

        <Tile span={3} d={840}>
          <Label>Activity · last 30 days</Label>
          <VBars values={d.activity.map((x) => x.value)} titles={d.activity.map((x) => `${x.day}: ${x.value}`)} height={70} color="var(--green)" d={840} label="Rows logged per day" />
          <div className={s.note}>Rows logged per day (meal items not double-counted).</div>
          <div className={s.tableWrap}>
            <TableWrap>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="text-right">30 days</th>
                  <th className="text-right">All time</th>
                </tr>
              </thead>
              <tbody>
                {d.counts.map((x) => (
                  <tr key={x.f.key}>
                    <td>{x.f.label}</td>
                    <td className="num text-right">{num(x.last30)}</td>
                    <td className="num text-right">{num(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tr.workouts.length ? tr.workouts.map((w) => <Pill key={w.label} tone="ink">{`${w.label} · ${w.count}`}</Pill>) : <span className={s.note}>No workouts in 30 days.</span>}
          </div>
        </Tile>

        {/* ---- raw lists ---- */}
        <Tile span={6}>
          <Label>Squads ({d.squads.length})</Label>
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
                {d.squads.map((q) => (
                  <tr key={q.id}>
                    <td className="font-semibold">{q.name || "—"}</td>
                    <td className="num">{q.code}</td>
                    <td>{q.role}</td>
                    <td className="num text-right">{num(q.members)}</td>
                    <td className="whitespace-nowrap">{when(q.joined_at, false)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className={s.note}>Not in any squad.</p>
          )}
        </Tile>

        <Tile span={6}>
          <Head right={<span className={s.note}>newest first: up to 60 of each kind, 120 shown</span>}>Timeline</Head>
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
        </Tile>

        <Tile span={6}>
          <Head right={<span className={s.note}>{d.eventsAvailable ? "last 100" : "app_events table not found"}</span>}>Recent app events</Head>
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
        </Tile>
      </div>
      {ui.readErrors.length ? <p className={s.note}>Couldn&apos;t read: {ui.readErrors.map((e) => `${e.table} (${e.message})`).join("; ")}.</p> : null}
    </div>
  );
}

/** Bullet bar: average vs target (the ink tick), scaled to 1.35 × target. */
function Bullet({ name, value, target, unit, color, d }: { name: string; value: number | null; target: number | null; unit: string; color: string; d: number }) {
  const max = Math.max(target ? target * 1.35 : 0, value ?? 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{name}</span>
        <span>
          <b>{value != null ? Math.round(value).toLocaleString("en-IN") : "—"}</b> <span className={s.inkMuted}>{target ? `of ${target.toLocaleString("en-IN")} ${unit}` : `${unit} · no target`}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 18 }} role="img" aria-label={`${name}: ${value ?? "no data"} ${unit}${target ? ` of ${target}` : ""}`}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 4, height: 10, borderRadius: 5, background: "var(--card2)" }} />
        <div className={cx(s.growX)} style={{ position: "absolute", left: 0, top: 4, height: 10, borderRadius: 5, width: `${((value ?? 0) / max) * 100}%`, background: color, ...delay(d) }} />
        {target ? <div style={{ position: "absolute", top: 0, height: 18, width: 3, borderRadius: 2, left: `calc(${(target / max) * 100}% - 1.5px)`, background: "var(--ink)" }} /> : null}
      </div>
    </div>
  );
}

type Delta = { text: string; tone: Tone };

function delta(cur: number | null, prev: number | null, hasPrev: boolean, unit = "", goodUp = true, dp = 0): Delta {
  if (!hasPrev || prev == null) return { text: hasPrev ? "—" : "new", tone: "muted" };
  if (cur == null) return { text: "none now", tone: "red" };
  const k = 10 ** dp;
  const diff = Math.round((cur - prev) * k) / k;
  if (!diff) return { text: "same", tone: "muted" };
  const up = diff > 0;
  return { text: `${up ? "↑" : "↓"} ${Math.abs(diff).toLocaleString("en-IN")}${unit}`, tone: up === goodUp ? "green" : "red" };
}

function Metric({ name, value, sub, d, children }: { name: string; value: string; sub: string; d: Delta; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "11px 0", borderTop: "1px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
        <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <span className={s.inkMuted}>{sub}</span>
        <span className={inkClass(d.tone)} style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          {d.text}
        </span>
      </div>
      {children}
    </div>
  );
}

function Tracks({ cmp, mealTypes }: { cmp: TrackCompare; mealTypes: string[] }) {
  const { cur, prev, hasPrev } = cmp;
  const kt = cmp.kcalTarget;
  // Calories: moving toward the target is good, away from it is not; without a target it's neutral.
  const kcalD = (() => {
    const x = delta(cur.avgKcal, prev.avgKcal, hasPrev, " kcal");
    if (x.tone === "muted" || !kt || cur.avgKcal == null || prev.avgKcal == null) return { ...x, tone: x.tone === "red" ? x.tone : ("muted" as Tone) };
    return { ...x, tone: (Math.abs(cur.avgKcal - kt) <= Math.abs(prev.avgKcal - kt) ? "green" : "red") as Tone };
  })();
  const perWeek = (v: number) => Math.round((v / (30 / 7)) * 10) / 10;
  const top2 = mealTypes.filter((m) => m !== "unset").slice(0, 2);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Metric name="Meals a day" value={String(cur.mealsPerDay)} sub={`${num(cur.meals)} meals${top2.length ? ` · mostly ${top2.join(" and ")}` : ""}`} d={delta(cur.mealsPerDay, prev.mealsPerDay, hasPrev, "", true, 1)} />
      <Metric name="Calories" value={cur.avgKcal != null ? cur.avgKcal.toLocaleString("en-IN") : "—"} sub={kt && cur.avgKcal != null ? `${pct(cur.avgKcal / kt)} of ${kt.toLocaleString("en-IN")} target` : "avg on logged days"} d={kcalD} />
      <Metric name="Protein target hit" value={cmp.proteinTarget ? `${cur.proteinHitDays} / ${cur.daysLogged} days` : "no target"} sub={cur.avgProtein != null ? `avg ${cur.avgProtein} g${cmp.proteinTarget ? ` of ${cmp.proteinTarget} g` : ""}` : "no food logged"} d={cmp.proteinTarget ? delta(cur.proteinHitDays, prev.proteinHitDays, hasPrev, " days") : { text: "—", tone: "muted" }}>
        {cmp.proteinTarget ? <HitStrip days={cmp.proteinStrip} color="var(--blue)" d={780} label={`Protein target hit on ${cur.proteinHitDays} of the last 30 days`} /> : null}
      </Metric>
      <Metric name="Calorie target hit" value={kt ? `${cur.kcalHitDays} / ${cur.daysLogged} days` : "no target"} sub="within ±10% of target" d={kt ? delta(cur.kcalHitDays, prev.kcalHitDays, hasPrev, " days") : { text: "—", tone: "muted" }}>
        {kt ? <HitStrip days={cmp.kcalStrip} color="var(--green)" d={820} label={`Calorie target hit on ${cur.kcalHitDays} of the last 30 days`} /> : null}
      </Metric>
      <Metric name="Water" value={`${perWeek(cur.waterEntries)} / wk`} sub={`${num(cur.waterEntries)} entries on ${cur.waterDays} days`} d={delta(cur.waterEntries, prev.waterEntries, hasPrev, "")} />
      <Metric name="Weight" value={`${num(cur.weighIns)} weigh-ins`} sub={`${perWeek(cur.weighIns)} a week`} d={delta(cur.weighIns, prev.weighIns, hasPrev, "")} />
      <Metric name="Workouts" value={num(cur.workouts)} sub={`${perWeek(cur.workouts)} a week${cmp.workoutTarget ? `, goal ${cmp.workoutTarget}` : ""}`} d={delta(cur.workouts, prev.workouts, hasPrev, "")} />
    </div>
  );
}

/** One plain sentence from the 30-vs-30 numbers. */
function readTracking(cmp: TrackCompare): string {
  const { cur, prev, hasPrev } = cmp;
  if (!cur.meals && !cur.workouts && !cur.waterEntries) return "Nothing tracked in the last 30 days.";
  if (!hasPrev) return "New in the last 30 days: no earlier month to compare with yet.";
  const dir = (a: number, b: number) => (a > b ? "more" : a < b ? "less" : "the same");
  const parts: string[] = [];
  parts.push(`logging ${dir(cur.meals, prev.meals)} food (${cur.meals} vs ${prev.meals} meals)`);
  parts.push(`training ${dir(cur.workouts, prev.workouts)} (${cur.workouts} vs ${prev.workouts})`);
  let tail = "";
  if (cmp.proteinTarget && cur.daysLogged) {
    const rate = cur.proteinHitDays / cur.daysLogged;
    tail = rate < 0.5 ? ` Protein falls short on most logged days (${cur.proteinHitDays} of ${cur.daysLogged} hit); that's the biggest gap.` : ` Protein is on target on ${cur.proteinHitDays} of ${cur.daysLogged} logged days.`;
  }
  return `Compared with the previous 30 days: ${parts.join(", ")}.${tail}`;
}

