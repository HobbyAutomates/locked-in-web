import type { User } from "@supabase/supabase-js";
import { addDays, today } from "@/lib/dates";
import { isMissingTable } from "@/lib/analytics";
import { needsOnboarding } from "@/lib/onboarding";
import type { Profile } from "@/lib/types";
import type { UsageEntry } from "@/lib/usage";
import type { AdminDb } from "./auth";
import { costOf } from "./pricing";

/**
 * Server-only reads for /admin, all through the service-role client from requireAdmin(). Sized for
 * a closed beta (tens of users): rows are pulled in 1000-row pages up to a cap and aggregated here.
 * Every read tolerates a missing table/column (e.g. schema_v33 not applied yet) and reports it.
 */

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null };

const PAGE = 1000;

async function pages(make: (from: number, to: number) => PromiseLike<Res>, cap = 20000): Promise<{ rows: Row[]; error: Res["error"] }> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) return { rows, error };
    const got = (data as Row[] | null) ?? [];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}

/** The app's day (IST) for a timestamp. */
export function istDay(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}

export function lastDays(n: number): string[] {
  const t = today();
  return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

// ---------------------------------------------------------------------------------------------
// Activity tables
// ---------------------------------------------------------------------------------------------

export type Feature = { key: string; label: string; table: string; user: string; day?: string; ts?: string };

/** The logged-activity tables the panel counts. `day` is a date column, `ts` a timestamp (bucketed by IST day). */
export const FEATURES: Feature[] = [
  { key: "meals", label: "Meals", table: "meals", user: "user_id", day: "date" },
  { key: "meal_items", label: "Meal items", table: "meal_items", user: "user_id" },
  { key: "workouts", label: "Workouts", table: "workouts", user: "user_id", day: "date" },
  { key: "exercise_log", label: "Exercise", table: "exercise_log", user: "user_id", day: "date" },
  { key: "water_log", label: "Water", table: "water_log", user: "user_id", day: "date" },
  { key: "weight_log", label: "Weigh-ins", table: "weight_log", user: "user_id", day: "date" },
  { key: "label_scans", label: "Scans", table: "label_scans", user: "user_id", ts: "created_at" },
  { key: "group_posts", label: "Squad posts", table: "group_posts", user: "user_id", ts: "created_at" },
  { key: "group_challenges", label: "Challenges", table: "group_challenges", user: "created_by", ts: "created_at" },
  { key: "battle_wins", label: "Battle wins", table: "battle_wins", user: "user_id", day: "date" },
];

type DayRow = { user: string; day: string };

/** (user, day) rows for one feature since `since` (IST date), optionally for one user. */
async function featureDays(db: AdminDb, f: Feature, since: string, userId?: string): Promise<{ rows: DayRow[]; error: string | null }> {
  if (f.key === "meal_items") {
    // meal_items has no date of its own: take the parent meal's.
    const r = await pages((a, b) => {
      let q = db.from("meal_items").select("user_id, meals!inner(date)").gte("meals.date", since);
      if (userId) q = q.eq("user_id", userId);
      return q.range(a, b);
    });
    return {
      rows: r.rows.map((x) => ({ user: str(x.user_id), day: str((x.meals as Row | null)?.date) })),
      error: r.error?.message ?? null,
    };
  }
  const col = f.day ?? f.ts!;
  const r = await pages((a, b) => {
    let q = db.from(f.table).select(`${f.user}, ${col}`).gte(col, f.day ? since : `${since}T00:00:00+05:30`);
    if (userId) q = q.eq(f.user, userId);
    return q.range(a, b);
  });
  return {
    rows: r.rows.map((x) => ({ user: str(x[f.user]), day: f.day ? str(x[col]) : istDay(str(x[col])) })),
    error: r.error?.message ?? null,
  };
}

async function featureTotal(db: AdminDb, f: Feature, userId?: string): Promise<number | null> {
  let q = db.from(f.table).select("*", { count: "exact", head: true });
  if (userId) q = q.eq(f.user, userId);
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

// ---------------------------------------------------------------------------------------------
// App events (schema_v33)
// ---------------------------------------------------------------------------------------------

export type AppEvent = { id: number; user_id: string; name: string; props: Row; platform: string | null; app_version: string | null; created_at: string };

async function events(db: AdminDb, opts: { since?: string; userId?: string; limit?: number; cols?: string }): Promise<{ rows: AppEvent[]; available: boolean }> {
  const cols = opts.cols ?? "id, user_id, name, props, platform, app_version, created_at";
  if (opts.limit) {
    let q = db.from("app_events").select(cols).order("created_at", { ascending: false }).limit(opts.limit);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data, error } = await q;
    return { rows: (data as unknown as AppEvent[] | null) ?? [], available: !isMissingTable(error) && !error };
  }
  const r = await pages((a, b) => {
    let q = db.from("app_events").select(cols).order("created_at", { ascending: false });
    if (opts.since) q = q.gte("created_at", `${opts.since}T00:00:00+05:30`);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    return q.range(a, b);
  }, 50000);
  return { rows: r.rows as unknown as AppEvent[], available: !r.error };
}

// ---------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  created_at: string;
  last_sign_in_at: string | null;
  onboarded: boolean;
  platform: string;
  app_version: string;
  last_seen: string | null;
  events: number;
};

async function allAuthUsers(db: AdminDb): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}

function platformLabel(set: Set<string>): string {
  const p = [...set].filter(Boolean).sort();
  if (!p.length) return "";
  return p.map((x) => (x === "android" ? "Android" : x === "web" ? "Web" : x)).join(" + ");
}

export function profileName(p: Row | undefined): { username: string; name: string; onboarded: boolean } {
  if (!p) return { username: "", name: "", onboarded: false };
  return { username: str(p.username), name: str(p.name), onboarded: !needsOnboarding(p as unknown as Profile) };
}

export async function loadUsers(db: AdminDb): Promise<{ users: AdminUser[]; eventsAvailable: boolean }> {
  const [auth, prof, ev] = await Promise.all([
    allAuthUsers(db),
    pages((a, b) => db.from("profiles").select("*").range(a, b)),
    events(db, { since: addDays(today(), -90), cols: "user_id, platform, app_version, created_at" }),
  ]);
  const profiles = new Map(prof.rows.map((p) => [str(p.id), p]));
  const per = new Map<string, { platforms: Set<string>; version: string; versionAt: string; last: string; n: number }>();
  for (const e of ev.rows) {
    const s = per.get(e.user_id) ?? { platforms: new Set<string>(), version: "", versionAt: "", last: "", n: 0 };
    if (e.platform) s.platforms.add(e.platform);
    if (e.app_version && e.created_at > s.versionAt) {
      s.version = `${e.app_version}${e.platform ? ` (${e.platform})` : ""}`;
      s.versionAt = e.created_at;
    }
    if (e.created_at > s.last) s.last = e.created_at;
    s.n++;
    per.set(e.user_id, s);
  }
  const users = auth.map((u) => {
    const p = profileName(profiles.get(u.id));
    const s = per.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      ...p,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      platform: s ? platformLabel(s.platforms) : "",
      app_version: s?.version ?? "",
      last_seen: s?.last || null,
      events: s?.n ?? 0,
    };
  });
  return { users, eventsAvailable: ev.available };
}

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

export type Series = { day: string; value: number }[];

export type UsageRow = { route: string; model: string; calls: number; in: number; out: number; cache: number; cost: number | null };

export type Overview = {
  totalUsers: number;
  newUsers: Series;
  dau: Series;
  wau: number;
  mau: number;
  activeToday: number;
  features: { f: Feature; series: Series; last7: number; last30: number; total: number | null; error: string | null }[];
  scanKinds: { kind: string; count: number }[];
  usage: UsageRow[];
  costSeries: Series;
  cost30: number;
  costAll: number;
  unpricedCalls: number;
  scansWithUsage: number;
  eventsAvailable: boolean;
  eventNames: { name: string; count: number }[];
};

function series(days: string[], counts: Map<string, number>): Series {
  return days.map((day) => ({ day, value: counts.get(day) ?? 0 }));
}

function bump(m: Map<string, number>, k: string, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by);
}

export async function loadOverview(db: AdminDb, days = 30): Promise<Overview> {
  const span = lastDays(days);
  const since = span[0];
  const week = new Set(span.slice(-7));
  const [auth, featureRows, totals, ev, scans] = await Promise.all([
    allAuthUsers(db),
    Promise.all(FEATURES.map((f) => featureDays(db, f, since))),
    Promise.all(FEATURES.map((f) => featureTotal(db, f))),
    events(db, { since, cols: "user_id, name, created_at" }),
    pages((a, b) => db.from("label_scans").select("created_at, kind:report->>kind, usage:report->usage").order("created_at", { ascending: false }).range(a, b)),
  ]);

  const newUsers = new Map<string, number>();
  for (const u of auth) bump(newUsers, istDay(u.created_at));

  // Active = logged anything or sent any app event that day.
  const activeByDay = new Map<string, Set<string>>();
  const touch = (day: string, user: string) => {
    if (!day || !user) return;
    const s = activeByDay.get(day) ?? new Set<string>();
    s.add(user);
    activeByDay.set(day, s);
  };
  const features = FEATURES.map((f, i) => {
    const counts = new Map<string, number>();
    for (const r of featureRows[i].rows) {
      bump(counts, r.day);
      touch(r.day, r.user);
    }
    const s = series(span, counts);
    return {
      f,
      series: s,
      last7: s.slice(-7).reduce((a, x) => a + x.value, 0),
      last30: s.reduce((a, x) => a + x.value, 0),
      total: totals[i],
      error: featureRows[i].error,
    };
  });
  const names = new Map<string, number>();
  for (const e of ev.rows) {
    touch(istDay(e.created_at), e.user_id);
    bump(names, e.name);
  }
  const dau = span.map((day) => ({ day, value: activeByDay.get(day)?.size ?? 0 }));
  const wauSet = new Set<string>();
  const mauSet = new Set<string>();
  for (const [day, users] of activeByDay) {
    if (day < since) continue;
    users.forEach((u) => mauSet.add(u));
    if (week.has(day)) users.forEach((u) => wauSet.add(u));
  }

  const kinds = new Map<string, number>();
  const usage = new Map<string, UsageRow>();
  const costByDay = new Map<string, number>();
  let costAll = 0;
  let unpriced = 0;
  let withUsage = 0;
  for (const s of scans.rows) {
    bump(kinds, str(s.kind) || "label");
    const list = Array.isArray(s.usage) ? (s.usage as UsageEntry[]) : [];
    if (list.length) withUsage++;
    const day = istDay(str(s.created_at));
    for (const u of list) {
      const key = `${u.route}|${u.model}`;
      const row = usage.get(key) ?? { route: u.route ?? "?", model: u.model ?? "?", calls: 0, in: 0, out: 0, cache: 0, cost: 0 };
      const c = costOf(u);
      row.calls++;
      row.in += u.in ?? 0;
      row.out += u.out ?? 0;
      row.cache += (u.cache_read ?? 0) + (u.cache_write ?? 0);
      if (c == null) {
        row.cost = null;
        unpriced++;
      } else {
        if (row.cost != null) row.cost += c;
        costAll += c;
        if (day >= since) costByDay.set(day, (costByDay.get(day) ?? 0) + c);
      }
      usage.set(key, row);
    }
  }
  const costSeries = span.map((day) => ({ day, value: Math.round((costByDay.get(day) ?? 0) * 10000) / 10000 }));

  return {
    totalUsers: auth.length,
    newUsers: series(span, newUsers),
    dau,
    wau: wauSet.size,
    mau: mauSet.size,
    activeToday: dau[dau.length - 1]?.value ?? 0,
    features,
    scanKinds: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    usage: [...usage.values()].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.calls - a.calls),
    costSeries,
    cost30: costSeries.reduce((a, x) => a + x.value, 0),
    costAll,
    unpricedCalls: unpriced,
    scansWithUsage: withUsage,
    eventsAvailable: ev.available,
    eventNames: [...names].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------------------------
// One user
// ---------------------------------------------------------------------------------------------

export type TimelineItem = { at: string; day: string; kind: string; text: string };

export type UserDetail = {
  user: User;
  profile: Row | undefined;
  counts: { f: Feature; total: number | null; last30: number }[];
  activity: Series;
  timeline: TimelineItem[];
  squads: { id: string; name: string; code: string; role: string; members: number; joined_at: string }[];
  events: AppEvent[];
  eventsAvailable: boolean;
  scanCost: number;
};

const n1 = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export async function loadUserDetail(db: AdminDb, id: string): Promise<UserDetail | null> {
  const { data: got, error } = await db.auth.admin.getUserById(id);
  if (error || !got?.user) return null;
  const span = lastDays(30);
  const since = span[0];
  const recent = (table: string, cols: string, userCol = "user_id") =>
    db.from(table).select(cols).eq(userCol, id).order("created_at", { ascending: false }).limit(60).then((r) => (r.error ? [] : ((r.data as unknown as Row[]) ?? [])));

  const [profile, totals, dayRows, meals, workouts, exercises, water, weights, scans, posts, challenges, battles, members, ev] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle().then((r) => (r.data as Row | null) ?? undefined),
    Promise.all(FEATURES.map((f) => featureTotal(db, f, id))),
    Promise.all(FEATURES.map((f) => featureDays(db, f, since, id))),
    recent("meals", "id, date, raw_text, meal_type, created_at, meal_items(calories, protein_g)"),
    recent("workouts", "id, date, kind, minutes, muscles, created_at"),
    recent("exercise_log", "id, date, name, minutes, kcal, source, created_at"),
    recent("water_log", "id, date, ml, vessel, created_at"),
    recent("weight_log", "id, date, weight_kg, created_at"),
    recent("label_scans", "id, product, created_at, kind:report->>kind, usage:report->usage"),
    recent("group_posts", "id, kind, body, created_at, groups(name)"),
    recent("group_challenges", "id, title, kind, created_at, groups(name)", "created_by"),
    db.from("battle_wins").select("date, score, created_at, groups(name)").eq("user_id", id).order("date", { ascending: false }).limit(30).then((r) => (r.error ? [] : ((r.data as unknown as Row[]) ?? []))),
    db.from("group_members").select("group_id, joined_at, groups(id, name, code, owner_id)").eq("user_id", id).then((r) => (r.error ? [] : ((r.data as unknown as Row[]) ?? []))),
    events(db, { userId: id, limit: 100 }),
  ]);

  const perDay = new Map<string, number>();
  const counts = FEATURES.map((f, i) => {
    const rows = dayRows[i].rows;
    // meal_items would double-count meals in the daily activity bar; keep it in the counts only.
    if (f.key !== "meal_items") rows.forEach((r) => bump(perDay, r.day));
    return { f, total: totals[i], last30: rows.length };
  });

  const gname = (r: Row) => str((r.groups as Row | null)?.name);
  const tl: TimelineItem[] = [];
  const add = (at: unknown, kind: string, text: string, day?: unknown) => {
    const t = str(at);
    if (t) tl.push({ at: t, day: str(day) || istDay(t), kind, text });
  };
  for (const m of meals) {
    const items = (m.meal_items as Row[] | null) ?? [];
    const kcal = Math.round(items.reduce((a, x) => a + n1(x.calories), 0));
    const prot = Math.round(items.reduce((a, x) => a + n1(x.protein_g), 0));
    add(m.created_at, "Meal", `${str(m.meal_type) ? `${str(m.meal_type)}: ` : ""}${str(m.raw_text) || "Meal"} · ${items.length} items · ${kcal} kcal · ${prot} g protein`, m.date);
  }
  for (const w of workouts) add(w.created_at, "Workout", `${str(w.kind) || "bands"}${w.minutes ? ` · ${n1(w.minutes)} min` : ""}${Array.isArray(w.muscles) && w.muscles.length ? ` · ${(w.muscles as string[]).join(", ")}` : ""}`, w.date);
  for (const e of exercises) add(e.created_at, "Exercise", `${str(e.name)} · ${n1(e.minutes)} min · ${Math.round(n1(e.kcal))} kcal${str(e.source) && e.source !== "manual" ? ` (${str(e.source)})` : ""}`, e.date);
  for (const w of water) add(w.created_at, "Water", `${n1(w.ml)} mL${str(w.vessel) ? ` · ${str(w.vessel)}` : ""}`, w.date);
  for (const w of weights) add(w.created_at, "Weight", `${n1(w.weight_kg)} kg`, w.date);
  let scanCost = 0;
  for (const s of scans) {
    const list = Array.isArray(s.usage) ? (s.usage as UsageEntry[]) : [];
    list.forEach((u) => (scanCost += costOf(u) ?? 0));
    add(s.created_at, "Scan", `${str(s.kind) || "label"} · ${str(s.product) || "unnamed"}`);
  }
  for (const p of posts) add(p.created_at, "Squad post", `${str(p.kind)} in ${gname(p) || "a squad"}${str(p.body) ? `: ${str(p.body).slice(0, 90)}` : ""}`);
  for (const c of challenges) add(c.created_at, "Challenge", `${str(c.title)} (${str(c.kind)}) in ${gname(c) || "a squad"}`);
  for (const b of battles) add(b.created_at, "Battle win", `${gname(b) || "a squad"} · score ${n1(b.score)}`, b.date);
  tl.sort((a, b) => (a.at < b.at ? 1 : -1));

  const groupIds = members.map((m) => str(m.group_id)).filter(Boolean);
  const sizes = new Map<string, number>();
  if (groupIds.length) {
    const { data } = await db.from("group_members").select("group_id").in("group_id", groupIds);
    for (const r of (data as Row[] | null) ?? []) bump(sizes, str(r.group_id));
  }
  const squads = members.map((m) => {
    const g = (m.groups as Row | null) ?? {};
    return { id: str(m.group_id), name: str(g.name), code: str(g.code), role: g.owner_id === id ? "Owner" : "Member", members: sizes.get(str(m.group_id)) ?? 0, joined_at: str(m.joined_at) };
  });

  return {
    user: got.user,
    profile,
    counts,
    activity: series(span, perDay),
    timeline: tl.slice(0, 120),
    squads,
    events: ev.rows,
    eventsAvailable: ev.available,
    scanCost,
  };
}
