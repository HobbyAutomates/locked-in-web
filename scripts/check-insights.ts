/**
 * `npx tsx scripts/check-insights.ts` — offline checks for the v2.12 /admin insights layer
 * (src/lib/admin/insights). No DB access: a small fixture Dataset stands in for bandlog.
 *  - event → feature mapping and the events-vs-tables source merge (no double counting),
 *  - feature adoption, frequency, trend, status and ranking,
 *  - activation funnel, weekly retention, DAU/WAU stickiness,
 *  - generated insight sentences,
 *  - per-user view model (age band only, never the date of birth), users-table columns,
 *  - empty tables don't throw, and every view model survives JSON round-tripping.
 */
import type { Dataset, EventRow } from "../src/lib/admin/insights/types";
import { buildUses, eventFeatures, eventUses, firstEventAt, mergeUses, tableUses } from "../src/lib/admin/insights/catalog";
import { activeDays, currentStreak, hourHistogram, peakWindow, sessionsPerDay, stickiness } from "../src/lib/admin/insights/engagement";
import { computeFeatureUsage, featureWeekMatrix, statusOf, trendOf } from "../src/lib/admin/insights/usage";
import { activationFunnel, biggestDrop } from "../src/lib/admin/insights/funnel";
import { weeklyRetention } from "../src/lib/admin/insights/retention";
import { generateInsights, list } from "../src/lib/admin/insights/insights";
import { ageBand } from "../src/lib/admin/insights/profile";
import { foodKey, methodMix, nutrition, topFoods } from "../src/lib/admin/insights/tracking";
import { buildOverview, buildUserInsights, buildUserUsage } from "../src/lib/admin/insights/build";

let total = 0;
let failures = 0;
function check(why: string, got: unknown, expect: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why}${ok ? "" : ` -> ${JSON.stringify(got)} (expected ${JSON.stringify(expect)})`}`);
}
const near = (a: number | null | undefined, b: number, eps = 1e-3) => a != null && Math.abs(a - b) < eps;

const TODAY = "2026-09-26"; // a Saturday; its week starts Mon 2026-09-21
const ts = (day: string, hour = 12) => `${day}T${String(hour).padStart(2, "0")}:00:00+05:30`;
const ev = (user_id: string, name: string, day: string, props: Record<string, unknown> = {}, hour = 12): EventRow => ({ user_id, name, props, platform: "web", app_version: "2.11.0", created_at: ts(day, hour) });

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";
const D = "dddddddd-0000-0000-0000-000000000004";

const profile = (id: string, username: string, onboarded: boolean, dob: string | null = null) => ({
  id,
  username,
  name: "",
  dob: onboarded ? dob ?? "1990-01-01" : dob,
  weight_kg: onboarded ? 70 : null,
  height_cm: onboarded ? 175 : null,
  goal_type: "lose",
  goal_weight_kg: 65,
  goal_speed_kg_wk: 0.5,
  calorie_target: 2000,
  protein_target_g: 120,
  carb_target_g: null,
  fat_target_g: null,
  water_goal_ml: 2500,
  step_goal: 8000,
  weekly_workout_target: 3,
});

const week = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];

const empty: Dataset = {
  today: TODAY,
  since: "2026-06-29",
  users: [],
  profiles: [],
  events: [],
  eventsAvailable: true,
  meals: [],
  items: [],
  workouts: [],
  exercises: [],
  water: [],
  weight: [],
  scans: [],
  posts: [],
  reactions: [],
  reads: [],
  challenges: [],
  battles: [],
  members: [],
  errors: [],
};

const ds: Dataset = {
  ...empty,
  users: [
    { id: A, email: "a@example.com", created_at: ts("2026-09-01"), last_sign_in_at: null },
    { id: B, email: "b@example.com", created_at: ts("2026-09-10"), last_sign_in_at: null },
    { id: C, email: "c@example.com", created_at: ts("2026-09-21"), last_sign_in_at: null },
    { id: D, email: "d@example.com", created_at: ts("2026-09-24"), last_sign_in_at: null },
  ],
  profiles: [profile(A, "asha", true, "1998-03-15"), profile(B, "bala", true), profile(C, "carol", false), profile(D, "dev", false)],
  events: [
    // A: opens the app every day of the last week (at 08:00), logs by search/barcode, opens a squad, sees one error.
    ...week.map((d) => ev(A, "app_open", d, {}, 8)),
    ev(A, "meal_logged", "2026-09-26", { method: "search", items: 2 }, 20),
    ev(A, "meal_logged", "2026-09-25", { method: "search", items: 1 }, 20),
    ev(A, "meal_logged", "2026-09-24", { method: "barcode", items: 1 }, 20),
    ev(A, "squad_opened", "2026-09-22", { squad_id: "g1" }, 21),
    ev(A, "error_shown", "2026-09-23", { message: "Couldn't reach the server", screen: "Log" }, 21),
    // C: one voice meal on Monday, then nothing.
    ev(C, "app_open", "2026-09-21"),
    ev(C, "meal_logged", "2026-09-21", { method: "voice", items: 3 }),
  ],
  meals: [
    // A: one meal before A's first event (counts from the table) and one after (the event already counts it).
    { id: "m1", user_id: A, date: "2026-09-05", meal_type: "lunch", has_photo: false, created_at: ts("2026-09-05") },
    { id: "m2", user_id: A, date: "2026-09-26", meal_type: "dinner", has_photo: false, created_at: ts("2026-09-26", 20) },
    // B never sends events (an old app): everything comes from tables.
    { id: "m3", user_id: B, date: "2026-09-18", meal_type: "breakfast", has_photo: false, created_at: ts("2026-09-18") },
    { id: "m4", user_id: B, date: "2026-09-19", meal_type: null, has_photo: false, created_at: ts("2026-09-19") },
  ],
  items: [
    { user_id: A, meal_id: "m1", date: "2026-09-05", name: "Paneer  Tikka", calories: 2000, protein_g: 130 },
    { user_id: A, meal_id: "m2", date: "2026-09-26", name: "paneer tikka", calories: 1000, protein_g: 60 },
    { user_id: A, meal_id: "m2", date: "2026-09-26", name: "Roti", calories: 500, protein_g: 40 },
    { user_id: B, meal_id: "m3", date: "2026-09-18", name: "Roti", calories: 300, protein_g: 10 },
    { user_id: B, meal_id: "m4", date: "2026-09-19", name: "Dal", calories: 400, protein_g: 20 },
  ],
  water: [{ user_id: B, date: "2026-09-25", created_at: ts("2026-09-25") }],
  posts: [
    { id: "p1", user_id: B, group_id: "g1", kind: "message", created_at: ts("2026-09-23") },
    { id: "p2", user_id: B, group_id: "g1", kind: "message", created_at: ts("2026-09-23", 13) },
  ],
  reactions: [{ post_id: "p1", user_id: A, post_author: B, created_at: ts("2026-09-23", 14) }],
  members: [{ user_id: A, group_id: "g1", joined_at: ts("2026-09-02") }],
};

// ---- event → feature mapping ----
check("meal_logged search → food_any + food_search", eventFeatures({ name: "meal_logged", props: { method: "search" } }), ["food_any", "food_search"]);
check("battle photo meal also counts for battle", eventFeatures({ name: "meal_logged", props: { method: "photo", from: "battle" } }), ["food_any", "food_photo", "battle"]);
check("unknown method → food_any only", eventFeatures({ name: "meal_logged", props: { method: "telepathy" } }), ["food_any"]);
check("plate scan is the photo scan", eventFeatures({ name: "scan_done", props: { kind: "plate" } }), ["scan_photo"]);
check("Progress screen", eventFeatures({ name: "screen_view", props: { screen: "Progress" } }), ["progress"]);
check("Home screen isn't a feature", eventFeatures({ name: "screen_view", props: { screen: "Home" } }), []);
check("app_open isn't a feature", eventFeatures({ name: "app_open", props: {} }), []);

// ---- source merge ----
const merged = mergeUses(eventUses(ds.events), tableUses(ds), firstEventAt(ds.events));
const foodA = merged.filter((u) => u.user === A && u.feature === "food_any");
check("A's food: 3 events + the one meal before A's first event", foodA.map((u) => `${u.day}:${u.source}`).sort(), ["2026-09-05:table", "2026-09-24:event", "2026-09-25:event", "2026-09-26:event"]);
check("B (no events): both meals from the table", merged.filter((u) => u.user === B && u.feature === "food_any").length, 2);
check("chat is tables-only", merged.filter((u) => u.feature === "chat").length, 2);
check("buildUses = mergeUses(eventUses, tableUses)", buildUses(ds).length, merged.length);

// ---- feature usage ----
const act = activeDays(merged, ds.events);
const rows = computeFeatureUsage(merged, act, TODAY);
const row = (k: string) => rows.find((r) => r.key === k)!;
check("active users 7d / 30d", [row("food_any").active7, row("food_any").active30], [3, 3]);
check("food adoption 30d = 3 of 3", [row("food_any").users30, row("food_any").adoption30], [3, 1]);
check("food uses 30d", row("food_any").uses30, 7);
check("food frequency = 7 uses / 3 users / (30/7) weeks", row("food_any").perUserWeek, 0.54);
check("food this week vs last week", [row("food_any").thisWeek, row("food_any").lastWeek, row("food_any").trend, row("food_any").trendPct], [4, 2, "up", 1]);
check("food source label", row("food_any").source, "events + tables (before first event)");
check("food 30d uses by source", [row("food_any").fromEvents30, row("food_any").fromTables30], [4, 3]);
check("food is rank 1 (100% adoption)", row("food_any").rank, 1);
check("barcode: 1 of 3 = rare", [row("food_barcode").users30, row("food_barcode").status], [1, "rare"]);
check("label logging: never", row("food_label").status, "never");
check("goals/science: not measured", row("goals_science").status, "not-measured");
check("food status: core", row("food_any").status, "core");
check("ranks are 1..n", rows.map((r) => r.rank).join(","), rows.map((_, i) => i + 1).join(","));
check("trend: new when last week was empty", trendOf(3, 0), { trend: "new", trendPct: null });
check("trend: flat within ±20%", trendOf(11, 10).trend, "flat");
check("trend: down", trendOf(1, 4), { trend: "down", trendPct: -0.75 });
check("trend: none", trendOf(0, 0), { trend: "none", trendPct: null });
check("status: 2 of 4 is used", statusOf(true, 2, 4, 0.5), "used");
check("status: 1 of 2 isn't rare (too few users to tell)", statusOf(true, 1, 2, 0.5), "used");

// ---- engagement ----
check("A streak = 7 days", currentStreak(act.get(A), TODAY), 7);
check("C streak = 0 (last active 5 days ago)", currentStreak(act.get(C), TODAY), 0);
check("streak survives an empty today", currentStreak(new Set(["2026-09-24", "2026-09-25"]), TODAY), 2);
const st = stickiness(act, TODAY);
check("avg DAU over 7 days = 10/7", st.dauAvg7, 1.43);
check("WAU / MAU", [st.wau, st.mau], [3, 3]);
check("DAU/WAU", near(st.dauWau, 1.43 / 3), true);
check("stickiness series spans 30 days", st.series.length, 30);
check("stickiness with nobody active", stickiness(new Map(), TODAY).dauWau, null);
const hours = hourHistogram(["2026-09-26T08:10:00+05:30", "2026-09-26T02:40:00Z", "2026-09-26T20:00:00+05:30"]);
check("hour histogram buckets by IST (02:40Z = 08:10 IST)", [hours[8], hours[20], hours.reduce((a, b) => a + b, 0)], [2, 1, 3]);
check("peak window", peakWindow(hours), "06:00–09:00");
check("sessions per day", sessionsPerDay([ts("2026-09-25", 8), ts("2026-09-25", 20), ts("2026-09-26", 8)]), { sessions: 3, days: 2, perDay: 1.5 });

// ---- funnel ----
const funnel = activationFunnel([
  { id: "1", onboarded: true, meals: 5, logDays: 4, inSquad: true, activeDays: 9 },
  { id: "2", onboarded: true, meals: 2, logDays: 3, inSquad: false, activeDays: 7 },
  { id: "3", onboarded: true, meals: 0, logDays: 0, inSquad: true, activeDays: 8 },
  { id: "4", onboarded: false, meals: 1, logDays: 1, inSquad: false, activeDays: 1 },
]);
check("funnel counts are nested", funnel.map((s) => s.users), [4, 3, 2, 2, 1, 1]);
check("funnel % of previous", funnel.map((s) => s.ofPrev), [1, 0.75, 2 / 3, 1, 0.5, 1]);
check("biggest drop: 3+ days → squad", biggestDrop(funnel)?.to.key, "squad");
check("empty funnel", activationFunnel([]).map((s) => [s.users, s.ofStart]), Array.from({ length: 6 }, () => [0, null]));

// ---- retention ----
const ret = weeklyRetention(ds.users.map((u) => ({ id: u.id, signupDay: u.created_at.slice(0, 10) })), act, TODAY, 8);
const cohort = (w: string) => ret.cohorts.find((c) => c.week === w)!;
check("cohorts newest first", ret.cohorts[0].week, "2026-09-21");
check("A's cohort (w/c 31 Aug): W0 yes, W1 no, W2 yes, W3 yes, then not started", cohort("2026-08-31").counts.slice(0, 5), [1, 0, 1, 1, null]);
check("B's cohort (w/c 7 Sep)", cohort("2026-09-07").rates.slice(0, 4), [0, 1, 1, null]);
check("C+D cohort: half active in W0", [cohort("2026-09-21").size, cohort("2026-09-21").rates[0]], [2, 0.5]);
check("empty cohort has null rates", cohort("2026-08-03").rates[0], null);

// ---- tracking ----
check("food names normalise", foodKey("  Paneer   TIKKA "), "paneer tikka");
check("top foods merge case/spacing; ties broken by users", topFoods(ds.items, 3), [
  { name: "Roti", count: 2, users: 2 },
  { name: "Paneer Tikka", count: 2, users: 1 },
  { name: "Dal", count: 1, users: 1 },
]);
const nut = nutrition(ds.meals.filter((m) => m.user_id === A), ds.items.filter((i) => i.user_id === A), { kcal: 2000, protein: 120 });
check("nutrition averages over logged days", [nut.daysLogged, nut.avgKcal, nut.avgProtein], [2, 1750, 115]);
check("protein hit on 1 of 2 days", [nut.proteinHitDays, nut.proteinHitRate], [1, 0.5]);
check("no protein target → no hit rate", nutrition([], [], { kcal: null, protein: null }).proteinHitRate, null);
const mix = methodMix(ds.events, TODAY, 30, 3);
check("method mix", [mix.methods.find((m) => m.label === "search")?.count, mix.methods.find((m) => m.label === "voice")?.count, mix.untracked, mix.total], [2, 1, 3, 7]);

// ---- insights ----
const ov = buildOverview(ds);
const texts = ov.insights.map((i) => i.text);
if (process.env.SHOW) for (const t of texts) console.log(`  · ${t}`);
const has = (why: string, re: RegExp) => check(why, texts.some((t) => re.test(t)), true);
has("method insight names the leader with 'x of N'", /^Search logging used by 1 of 3 active users in 30 days; barcode by 1; voice by 1; label, photo and typed-text by 0\.$/);
has("most-used social feature", /^Squad chat is the most-used social feature \(2 uses by 1 user in 30 days\)\.$/);
has("quiet user is named with days", /^@carol hasn't been active in 5 days\.$/);
has("never-started user", /^1 user signed up but has no activity in the last 90 days: @dev\.$/);
has("never-used features listed", /^Never used in the last 30 days: .*Food: nutrition label/);
has("funnel drop", /^Biggest activation drop: /);
has("errors", /^Errors shown 1 time to 1 user in 30 days; most common: "Couldn't reach the server" \(1\)\.$/);
has("stickiness", /^DAU\/WAU is 48%/);
check("list() joins with 'and'", [list([]), list(["a"]), list(["a", "b"]), list(["a", "b", "c"])], ["", "a", "a and b", "a, b and c"]);
const quiet = generateInsights({
  features: [],
  funnel: [],
  stickiness: stickiness(new Map(), TODAY),
  methods: methodMix([], TODAY),
  users: [{ label: "@x", daysSinceActive: null, signedUpDaysAgo: 3 }],
  errors: { total: 0, users: 0, top: null },
});
check("no activity at all → one warning + never-started", quiet.map((i) => i.key), ["no-active", "never-started"]);

// ---- overview / users table / one user ----
check("overview funnel on the fixture", ov.funnel.map((s) => s.users), [4, 2, 2, 2, 1, 1]);
check("overview counts", [ov.totalUsers, ov.active7, ov.active30, ov.eventsSince], [4, 3, 3, "2026-09-20"]);
const usage = new Map(buildUserUsage(ds).map((u) => [u.id, u]));
check("A: 7 days active, 1 meal in 7d, top feature search, not at risk", [usage.get(A)?.daysActive7, usage.get(A)?.meals7, usage.get(A)?.topFeature, usage.get(A)?.atRisk], [7, 1, "Food: search", false]);
check("A's last event", usage.get(A)?.lastEventName, "meal_logged");
check("C at risk after 5 quiet days", [usage.get(C)?.daysSinceActive, usage.get(C)?.atRisk], [5, true]);
check("D never active → at risk", [usage.get(D)?.lastActive, usage.get(D)?.atRisk], [null, true]);
const ua = buildUserInsights(ds, A);
check("A: age band, never the DOB", ua.profile.ageBand, "25–34");
check("A: DOB appears nowhere in the view model", /1998/.test(JSON.stringify(ua)), false);
check("A: engagement", [ua.engagement.active14, ua.engagement.active30, ua.engagement.streak, ua.engagement.sessions.perDay], [7, 8, 7, 1]);
check("A: busiest hours (seven 08:00 app opens beat five evening events)", ua.engagement.peak, "06:00–09:00");
check("A: meal types", ua.tracking.mealTypes, [
  { label: "breakfast", count: 0 },
  { label: "lunch", count: 1 },
  { label: "dinner", count: 1 },
  { label: "snack", count: 0 },
  { label: "unset", count: 0 },
]);
check("A: social", [ua.social.squads, ua.social.reactionsGiven, ua.social.squadOpens], [1, 1, 1]);
check("B: reaction received", buildUserInsights(ds, B).social.reactionsReceived, 1);
check("A: errors with screen", ua.errors.map((e) => [e.message, e.screen, e.count]), [["Couldn't reach the server", "Log", 1]]);
const mx = featureWeekMatrix(merged.filter((u) => u.user === A), TODAY, 8);
check("A: matrix weeks end with this week", mx.weeks[7], "2026-09-21");
check("A: food_search in this week's column", mx.rows.find((r) => r.key === "food_search")?.weeks[7], 2);
check("A: the Sept 5 meal lands 3 weeks back", mx.rows.find((r) => r.key === "food_any")?.weeks[4], 1);

// ---- age bands ----
check("17 the day before an 18th birthday", ageBand("2008-09-27", TODAY), "under 18");
check("18 on the birthday", ageBand("2008-09-26", TODAY), "18–24");
check("65+", ageBand("1950-01-01", TODAY), "65+");
check("no dob", ageBand(null, TODAY), null);
check("garbage dob", ageBand("not a date", TODAY), null);

// ---- empty tables + serialisable ----
let threw = "";
try {
  const e = buildOverview(empty);
  check("empty: no features used", e.features.every((f) => f.users30 === 0), true);
  check("empty: overview is JSON-safe", JSON.parse(JSON.stringify(e)), e);
  check("empty: users table", buildUserUsage(empty), []);
  const u = buildUserInsights(empty, A);
  check("empty: one user is JSON-safe", JSON.parse(JSON.stringify(u)), u);
} catch (err) {
  threw = String(err);
}
check("empty tables don't throw", threw, "");
check("fixture overview is JSON-safe", JSON.parse(JSON.stringify(ov)), ov);

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
