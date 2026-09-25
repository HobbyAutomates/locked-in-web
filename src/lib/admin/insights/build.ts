import type { ActiveDays, Dataset, ProfileRow, Use } from "./types";
import { buildUses, firstEventAt } from "./catalog";
import { activeDays, activeUsersIn, currentStreak, daysActiveIn, hourHistogram, lastActiveDay, peakWindow, sessionsPerDay, stickiness, type Stickiness } from "./engagement";
import { activationFunnel, type FunnelStep } from "./funnel";
import { generateInsights, type Insight } from "./insights";
import { profileSummary, userLabel, isOnboarded, type ProfileSummary } from "./profile";
import { weeklyRetention, type Retention } from "./retention";
import { logFrequency, mealTypeMix, methodMix, nutrition, topFoods, workoutsByKind, type Count, type FoodCount, type LogFrequency, type MethodMix, type Nutrition } from "./tracking";
import { computeFeatureUsage, featureWeekMatrix, topFeature, type FeatureUsageRow, type FeatureWeekRow } from "./usage";
import { daysAgo, istDay, lastNDays, within } from "./time";

/**
 * Pure view-model builders: Dataset in, JSON-serialisable objects out. The server loader
 * (load.ts) fetches the Dataset; the pages only render what these return.
 */

/** No activity for this many days = at risk. */
export const RISK_DAYS = 3;
const LOG_FEATURES = new Set(["food_any", "activity", "water", "weight"]);

type Ctx = { ds: Dataset; uses: Use[]; active: ActiveDays; profiles: Map<string, ProfileRow>; firstEvent: Map<string, string> };

export function context(ds: Dataset): Ctx {
  const uses = buildUses(ds);
  return { ds, uses, active: activeDays(uses, ds.events), profiles: new Map(ds.profiles.map((p) => [p.id, p])), firstEvent: firstEventAt(ds.events) };
}

function errorsIn(ds: Dataset, days: number, userId?: string) {
  const byMsg = new Map<string, { message: string; screen: string; count: number; last: string }>();
  const users = new Set<string>();
  let total = 0;
  for (const e of ds.events) {
    if (e.name !== "error_shown" || (userId && e.user_id !== userId) || !within(istDay(e.created_at), ds.today, days)) continue;
    total++;
    users.add(e.user_id);
    const message = typeof e.props?.message === "string" ? e.props.message : "(no message)";
    const screen = typeof e.props?.screen === "string" ? e.props.screen : "";
    const k = `${message}|${screen}`;
    const r = byMsg.get(k) ?? { message, screen, count: 0, last: "" };
    r.count++;
    if (e.created_at > r.last) r.last = e.created_at;
    byMsg.set(k, r);
  }
  const rows = [...byMsg.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
  return { total, users: users.size, rows };
}

/** Meals whose logging method was never recorded (table rows from before the user's first event). */
function untrackedMeals(uses: Use[], today: string, days: number, userId?: string): number {
  return uses.filter((u) => u.feature === "food_any" && u.source === "table" && within(u.day, today, days) && (!userId || u.user === userId)).length;
}

// ---------------------------------------------------------------------------------------------
// Overview + /admin/features
// ---------------------------------------------------------------------------------------------

export type OverviewInsights = {
  today: string;
  since: string;
  eventsAvailable: boolean;
  /** IST day of the earliest app event in the window, or null. */
  eventsSince: string | null;
  readErrors: { table: string; message: string }[];
  totalUsers: number;
  active7: number;
  active30: number;
  features: FeatureUsageRow[];
  funnel: FunnelStep[];
  retention: Retention;
  stickiness: Stickiness;
  methods: MethodMix;
  topFoods: FoodCount[];
  insights: Insight[];
};

export function buildOverview(ds: Dataset, c: Ctx = context(ds)): OverviewInsights {
  const { uses, active, profiles } = c;
  const features = computeFeatureUsage(uses, active, ds.today);
  const mealsBy = new Map<string, number>();
  for (const m of ds.meals) mealsBy.set(m.user_id, (mealsBy.get(m.user_id) ?? 0) + 1);
  const logDays = new Map<string, Set<string>>();
  for (const u of uses) {
    if (!LOG_FEATURES.has(u.feature)) continue;
    let s = logDays.get(u.user);
    if (!s) logDays.set(u.user, (s = new Set()));
    s.add(u.day);
  }
  const inSquad = new Set(ds.members.map((m) => m.user_id));
  const funnel = activationFunnel(
    ds.users.map((u) => ({
      id: u.id,
      onboarded: isOnboarded(profiles.get(u.id)),
      meals: mealsBy.get(u.id) ?? 0,
      logDays: logDays.get(u.id)?.size ?? 0,
      inSquad: inSquad.has(u.id),
      activeDays: active.get(u.id)?.size ?? 0,
    })),
  );
  const retention = weeklyRetention(ds.users.map((u) => ({ id: u.id, signupDay: istDay(u.created_at) })), active, ds.today, 8);
  const st = stickiness(active, ds.today, 30);
  const methods = methodMix(ds.events, ds.today, 30, untrackedMeals(uses, ds.today, 30));
  const err = errorsIn(ds, 30);
  const insights = generateInsights({
    features,
    funnel,
    stickiness: st,
    methods,
    users: ds.users.map((u) => {
      const last = lastActiveDay(active.get(u.id));
      return { label: userLabel(u.id, profiles.get(u.id)), daysSinceActive: last ? daysAgo(last, ds.today) : null, signedUpDaysAgo: daysAgo(istDay(u.created_at) || ds.today, ds.today) };
    }),
    errors: { total: err.total, users: err.users, top: err.rows[0] ? { message: err.rows[0].message, count: err.rows[0].count } : null },
    riskDays: RISK_DAYS,
  });
  let first = "";
  for (const e of ds.events) if (!first || e.created_at < first) first = e.created_at;
  return {
    today: ds.today,
    since: ds.since,
    eventsAvailable: ds.eventsAvailable,
    eventsSince: first ? istDay(first) : null,
    readErrors: ds.errors,
    totalUsers: ds.users.length,
    active7: activeUsersIn(active, ds.today, 7).length,
    active30: activeUsersIn(active, ds.today, 30).length,
    features,
    funnel,
    retention,
    stickiness: st,
    methods,
    topFoods: topFoods(ds.items, 15),
    insights,
  };
}

// ---------------------------------------------------------------------------------------------
// Users table
// ---------------------------------------------------------------------------------------------

export type UserUsage = {
  id: string;
  daysActive7: number;
  meals7: number;
  topFeature: string;
  lastEventName: string;
  lastActive: string | null;
  daysSinceActive: number | null;
  atRisk: boolean;
};

export function buildUserUsage(ds: Dataset, c: Ctx = context(ds)): UserUsage[] {
  const byUser = new Map<string, Use[]>();
  for (const u of c.uses) {
    let l = byUser.get(u.user);
    if (!l) byUser.set(u.user, (l = []));
    l.push(u);
  }
  const lastEvent = new Map<string, { name: string; at: string }>();
  for (const e of ds.events) {
    const cur = lastEvent.get(e.user_id);
    if (!cur || e.created_at > cur.at) lastEvent.set(e.user_id, { name: e.name, at: e.created_at });
  }
  const meals7 = new Map<string, number>();
  for (const m of ds.meals) if (within(m.date, ds.today, 7)) meals7.set(m.user_id, (meals7.get(m.user_id) ?? 0) + 1);
  return ds.users.map((u) => {
    const days = c.active.get(u.id);
    const last = lastActiveDay(days);
    const since = last ? daysAgo(last, ds.today) : null;
    return {
      id: u.id,
      daysActive7: daysActiveIn(days, ds.today, 7),
      meals7: meals7.get(u.id) ?? 0,
      topFeature: topFeature(byUser.get(u.id) ?? [], ds.today, 30) ?? "",
      lastEventName: lastEvent.get(u.id)?.name ?? "",
      lastActive: last,
      daysSinceActive: since,
      atRisk: since == null || since >= RISK_DAYS,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// One user
// ---------------------------------------------------------------------------------------------

export type UserInsights = {
  today: string;
  profile: ProfileSummary;
  platform: string;
  appVersion: string;
  engagement: {
    active14: number;
    active30: number;
    streak: number;
    lastActive: string | null;
    daysSinceActive: number | null;
    atRisk: boolean;
    sessions: { sessions: number; days: number; perDay: number | null };
    /** 24 IST-hour buckets over 30 days of app events and logged rows. */
    hours: number[];
    peak: string | null;
    daily: { day: string; value: number }[];
  };
  matrix: { weeks: string[]; rows: FeatureWeekRow[] };
  tracking: {
    meals30: number;
    mealsPerDay30: number;
    mealTypes: Count[];
    nutrition: Nutrition;
    topFoods: FoodCount[];
    methods: MethodMix;
    water: LogFrequency;
    weight: LogFrequency;
    workouts: Count[];
  };
  social: {
    squads: number;
    messages: number;
    feedShares: number;
    reactionsGiven: number;
    reactionsReceived: number;
    challengesCreated: number;
    battleWins: number;
    squadOpens: number;
  };
  errors: { message: string; screen: string; count: number; last: string }[];
  readErrors: { table: string; message: string }[];
};

export function buildUserInsights(ds: Dataset, id: string, c: Ctx = context(ds)): UserInsights {
  const t = ds.today;
  const mine = <T extends { user_id: string }>(rows: T[]) => rows.filter((r) => r.user_id === id);
  const uses = c.uses.filter((u) => u.user === id);
  const days = c.active.get(id);
  const last = lastActiveDay(days);
  const since = last ? daysAgo(last, t) : null;
  const events = mine(ds.events);
  const ev30 = events.filter((e) => within(istDay(e.created_at), t, 30));
  const latest = events.reduce<(typeof events)[number] | null>((a, e) => (!a || e.created_at > a.created_at ? e : a), null);

  const hours = hourHistogram([...ev30.map((e) => e.created_at), ...uses.filter((u) => u.source === "table" && within(u.day, t, 30)).map((u) => u.at)]);
  const meals30 = mine(ds.meals).filter((m) => within(m.date, t, 30));
  const mealIds = new Set(meals30.map((m) => m.id));
  const items30 = mine(ds.items).filter((i) => mealIds.has(i.meal_id));
  const p = c.profiles.get(id);
  const posts = mine(ds.posts);
  const dailyDays = lastNDays(t, 30);
  const perDay = new Map<string, number>();
  for (const u of uses) perDay.set(u.day, (perDay.get(u.day) ?? 0) + 1);

  return {
    today: t,
    profile: profileSummary(p, t),
    platform: [...new Set(events.map((e) => e.platform).filter(Boolean))].sort().join(" + "),
    appVersion: latest?.app_version ?? "",
    engagement: {
      active14: daysActiveIn(days, t, 14),
      active30: daysActiveIn(days, t, 30),
      streak: currentStreak(days, t),
      lastActive: last,
      daysSinceActive: since,
      atRisk: since == null || since >= RISK_DAYS,
      sessions: sessionsPerDay(ev30.filter((e) => e.name === "app_open").map((e) => e.created_at)),
      hours,
      peak: peakWindow(hours),
      daily: dailyDays.map((day) => ({ day, value: perDay.get(day) ?? 0 })),
    },
    matrix: featureWeekMatrix(uses, t, 8),
    tracking: {
      meals30: meals30.length,
      mealsPerDay30: Math.round((meals30.length / 30) * 10) / 10,
      mealTypes: mealTypeMix(meals30),
      nutrition: nutrition(meals30, items30, { kcal: p?.calorie_target ?? null, protein: p?.protein_target_g ?? null }),
      topFoods: topFoods(items30, 10),
      methods: methodMix(events, t, 30, untrackedMeals(c.uses, t, 30, id)),
      water: logFrequency(mine(ds.water).filter((r) => within(r.date, t, 30)), 30),
      weight: logFrequency(mine(ds.weight).filter((r) => within(r.date, t, 30)), 30),
      workouts: workoutsByKind(
        mine(ds.workouts).filter((r) => within(r.date, t, 30)),
        mine(ds.exercises).filter((r) => within(r.date, t, 30)),
      ),
    },
    social: {
      squads: new Set(mine(ds.members).map((m) => m.group_id)).size,
      messages: posts.filter((x) => x.kind === "message").length,
      feedShares: posts.filter((x) => ["meal", "workout", "pr", "photo"].includes(x.kind)).length,
      reactionsGiven: ds.reactions.filter((r) => r.user_id === id).length,
      reactionsReceived: ds.reactions.filter((r) => r.post_author === id && r.user_id !== id).length,
      challengesCreated: mine(ds.challenges).length,
      battleWins: mine(ds.battles).length,
      squadOpens: events.filter((e) => e.name === "squad_opened").length,
    },
    errors: errorsIn(ds, 90, id).rows,
    readErrors: ds.errors,
  };
}
