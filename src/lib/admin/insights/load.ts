import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { addDays, today } from "@/lib/dates";
import { isMissingTable } from "@/lib/analytics";
import type { AdminDb } from "../auth";
import { allAuthUsers, pages } from "../data";
import type { AuthUserRow, Dataset, ProfileRow } from "./types";

/**
 * Server-only loader for the insights layer. Reads with the service-role client from
 * requireAdmin(), bounded to the last 90 days, one paged query per table (plus one per table for a
 * single user: never a query per user). A missing table/column is recorded in `errors` and read as
 * empty so every page still renders. The result never leaves the server: pages pass it through
 * the pure builders in build.ts and render their view models.
 */

export const WINDOW_DAYS = 90;

type Row = Record<string, unknown>;
type Err = { message: string; code?: string } | null;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const num0 = (v: unknown) => Number(v) || 0;

function toProfile(p: Row): ProfileRow {
  return {
    id: str(p.id),
    username: str(p.username),
    name: str(p.name),
    dob: str(p.dob) || null,
    weight_kg: numOrNull(p.weight_kg),
    height_cm: numOrNull(p.height_cm),
    goal_type: str(p.goal_type) || null,
    goal_weight_kg: numOrNull(p.goal_weight_kg),
    goal_speed_kg_wk: numOrNull(p.goal_speed_kg_wk),
    calorie_target: numOrNull(p.calorie_target),
    protein_target_g: numOrNull(p.protein_target_g),
    carb_target_g: numOrNull(p.carb_target_g),
    fat_target_g: numOrNull(p.fat_target_g),
    water_goal_ml: numOrNull(p.water_goal_ml),
    step_goal: numOrNull(p.step_goal),
    weekly_workout_target: numOrNull(p.weekly_workout_target),
  };
}

async function loadDatasetImpl(db: AdminDb, userId?: string): Promise<Dataset> {
  const t = today();
  const since = addDays(t, -(WINDOW_DAYS - 1));
  const sinceTs = `${since}T00:00:00+05:30`;
  const errors: Dataset["errors"] = [];

  /** Paged read; on error retries once with `fallback` columns (an older schema), else records it and returns []. */
  const read = async (table: string, cols: string, build: (cols: string) => (from: number, to: number) => PromiseLike<{ data: unknown; error: Err }>, fallback?: string, cap = 50000): Promise<Row[]> => {
    let r = await pages(build(cols), cap);
    if (r.error && fallback) r = await pages(build(fallback), cap);
    if (r.error) {
      errors.push({ table, message: isMissingTable(r.error) ? "table not found" : r.error.message });
      return [];
    }
    return r.rows;
  };
  /** A `select` on `table`, since the window start on `col`, for one user when given. */
  const q = (table: string, col: string, isDate: boolean, userCol = "user_id") => (cols: string) => (from: number, to: number) => {
    let x = db.from(table).select(cols).gte(col, isDate ? since : sinceTs);
    if (userId) x = x.eq(userCol, userId);
    return x.order(col, { ascending: false }).range(from, to);
  };

  const usersP: Promise<User[]> = userId
    ? db.auth.admin.getUserById(userId).then(({ data }) => (data?.user ? [data.user] : []))
    : allAuthUsers(db);

  const [users, profiles, events, meals, items, workouts, exercises, water, weight, scans, posts, reactionsGiven, reactionsReceived, reads, challenges, battles, members] = await Promise.all([
    usersP.then((us): AuthUserRow[] => us.map((u) => ({ id: u.id, email: u.email ?? "", created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null }))),
    read("profiles", "*", (cols) => (from, to) => {
      let x = db.from("profiles").select(cols);
      if (userId) x = x.eq("id", userId);
      return x.range(from, to);
    }),
    read("app_events", "user_id, name, props, platform, app_version, created_at", q("app_events", "created_at", false)),
    read("meals", "id, user_id, date, meal_type, photo_path, created_at", q("meals", "date", true), "id, user_id, date, created_at"),
    read("meal_items", "user_id, meal_id, name, calories, protein_g, meals!inner(date)", (cols) => (from, to) => {
      let x = db.from("meal_items").select(cols).gte("meals.date", since);
      if (userId) x = x.eq("user_id", userId);
      return x.range(from, to);
    }),
    read("workouts", "user_id, date, kind, created_at", q("workouts", "date", true), "user_id, date, created_at"),
    read("exercise_log", "user_id, date, name, source, created_at", q("exercise_log", "date", true)),
    read("water_log", "user_id, date, created_at", q("water_log", "date", true)),
    read("weight_log", "user_id, date, created_at", q("weight_log", "date", true)),
    read("label_scans", "user_id, created_at, kind, rkind:report->>kind", q("label_scans", "created_at", false), "user_id, created_at, rkind:report->>kind"),
    read("group_posts", "id, user_id, group_id, kind, created_at", q("group_posts", "created_at", false)),
    read("post_reactions", "post_id, user_id, created_at, group_posts(user_id)", q("post_reactions", "created_at", false)),
    userId
      ? read("post_reactions", "post_id, user_id, created_at, group_posts!inner(user_id)", (cols) => (from, to) =>
          db.from("post_reactions").select(cols).gte("created_at", sinceTs).eq("group_posts.user_id", userId).range(from, to),
        )
      : Promise.resolve([] as Row[]),
    read("group_reads", "user_id, group_id, last_read_at", q("group_reads", "last_read_at", false)),
    read("group_challenges", "created_by, created_at", q("group_challenges", "created_at", false, "created_by")),
    read("battle_wins", "user_id, date, created_at", q("battle_wins", "date", true)),
    read("group_members", "user_id, group_id, joined_at", (cols) => (from, to) => {
      let x = db.from("group_members").select(cols);
      if (userId) x = x.eq("user_id", userId);
      return x.range(from, to);
    }),
  ]);

  const dated = (r: Row) => ({ user_id: str(r.user_id), date: str(r.date), created_at: str(r.created_at) });
  const seen = new Set<string>();
  const reactions = [...reactionsGiven, ...reactionsReceived]
    .filter((r) => {
      const k = `${str(r.post_id)}|${str(r.user_id)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((r) => ({ post_id: str(r.post_id), user_id: str(r.user_id), post_author: str((r.group_posts as Row | null)?.user_id), created_at: str(r.created_at) }));

  return {
    today: t,
    since,
    users,
    profiles: profiles.map(toProfile),
    events: events.map((e) => ({
      user_id: str(e.user_id),
      name: str(e.name),
      props: e.props && typeof e.props === "object" ? (e.props as Row) : {},
      platform: str(e.platform) || null,
      app_version: str(e.app_version) || null,
      created_at: str(e.created_at),
    })),
    eventsAvailable: !errors.some((e) => e.table === "app_events"),
    meals: meals.map((m) => ({ id: str(m.id), user_id: str(m.user_id), date: str(m.date), meal_type: str(m.meal_type) || null, has_photo: !!str(m.photo_path), created_at: str(m.created_at) })),
    items: items.map((i) => ({ user_id: str(i.user_id), meal_id: str(i.meal_id), date: str((i.meals as Row | null)?.date), name: str(i.name), calories: num0(i.calories), protein_g: num0(i.protein_g) })),
    workouts: workouts.map((w) => ({ ...dated(w), kind: str(w.kind) })),
    exercises: exercises.map((x) => ({ ...dated(x), source: str(x.source), name: str(x.name) })),
    water: water.map(dated),
    weight: weight.map(dated),
    scans: scans.map((s) => ({ user_id: str(s.user_id), kind: str(s.rkind) || str(s.kind) || "label", created_at: str(s.created_at) })),
    posts: posts.map((p) => ({ id: str(p.id), user_id: str(p.user_id), group_id: str(p.group_id), kind: str(p.kind), created_at: str(p.created_at) })),
    reactions,
    reads: reads.map((r) => ({ user_id: str(r.user_id), group_id: str(r.group_id), last_read_at: str(r.last_read_at) })),
    challenges: challenges.map((c) => ({ user_id: str(c.created_by), created_at: str(c.created_at) })),
    battles: battles.map(dated),
    members: members.map((m) => ({ user_id: str(m.user_id), group_id: str(m.group_id), joined_at: str(m.joined_at) })),
    errors,
  };
}

/** Everyone's last 90 days (cached per request, so the overview's two sections share one read). */
export const loadDataset = cache((db: AdminDb) => loadDatasetImpl(db));

/** One user's last 90 days (plus reactions others gave to their posts). */
export const loadUserDataset = cache((db: AdminDb, userId: string) => loadDatasetImpl(db, userId));
