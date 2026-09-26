import type { AdminClient } from "./apiAuth";
import { ageYears } from "./goals";
import { dispatchPending, type DispatchResult } from "./push";
import { coachStep } from "./coachServer";
import { checkinDue, fastingReached, fastingUrl, isMissingSchema, localNow, nudgeTimeReached, parseDietMode, proteinNudgeText, proteinPicksFor, shouldProteinNudge, timeToMinutes, type LocalNow } from "./notify";

/**
 * v2.13 /api/cron/tick (spec §2): every 15 minutes, with the service-role client —
 *   (a) protein nudges for people whose nudge time just passed (spec §3),
 *   (b) "fast complete" notices,
 *   (c) Monday check-in notices (adaptive targets on),
 *   (d) v2.14 coach notes (morning, Sunday roast, 8 pm nudge),
 *   (e) push everything pending.
 * Each step is independent: a missing v36 table skips that step, nothing throws.
 */

export type TickResult = { now: LocalNow; protein: number; fasting: number; checkin: number; coach: number; dispatch: DispatchResult | null; skipped: string[] };

const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** Midnight of an IST date as an ISO instant. */
const istMidnight = (date: string) => new Date(`${date}T00:00:00+05:30`).toISOString();

async function proteinStep(db: AdminClient, now: LocalNow, skipped: string[]): Promise<number> {
  const { data, error } = await db.from("profiles").select("id, dob, goal_type, protein_target_g, protein_nudge, protein_nudge_time, diet_mode").eq("protein_nudge", true);
  if (error) {
    skipped.push(isMissingSchema(error) ? "protein: v36 not applied" : `protein: ${error.message}`);
    return 0;
  }
  type P = { id: string; dob: string | null; goal_type: string | null; protein_target_g: number | null; protein_nudge: boolean; protein_nudge_time: string | null; diet_mode: string | null };
  const due = ((data ?? []) as P[]).filter((p) => nudgeTimeReached(now.minutes, timeToMinutes(p.protein_nudge_time)));
  if (!due.length) return 0;
  const since = istMidnight(now.date);
  const already = new Set<string>();
  const protein = new Map<string, number>();
  const logged = new Set<string>();
  for (const ids of chunk(due.map((p) => p.id), 200)) {
    const [sent, meals] = await Promise.all([
      db.from("notifications").select("user_id").eq("kind", "protein").gte("created_at", since).in("user_id", ids),
      db.from("meals").select("user_id, meal_items(protein_g)").eq("date", now.date).in("user_id", ids),
    ]);
    for (const r of (sent.data ?? []) as { user_id: string }[]) already.add(r.user_id);
    for (const m of (meals.data ?? []) as { user_id: string; meal_items: { protein_g: number | null }[] | null }[]) {
      logged.add(m.user_id);
      const g = (m.meal_items ?? []).reduce((a, i) => a + (Number(i.protein_g) || 0), 0);
      protein.set(m.user_id, (protein.get(m.user_id) ?? 0) + g);
    }
  }
  const rows = [];
  for (const p of due) {
    const target = Number(p.protein_target_g) || 0;
    const today = protein.get(p.id) ?? 0;
    const ok = shouldProteinNudge({
      enabled: p.protein_nudge,
      age: ageYears(p.dob, now.date),
      goalType: p.goal_type === "lose" || p.goal_type === "gain" ? p.goal_type : "maintain",
      proteinToday: today,
      target,
      loggedToday: logged.has(p.id),
      alreadyToday: already.has(p.id),
    });
    if (!ok) continue;
    const text = proteinNudgeText(target - today, proteinPicksFor(parseDietMode(p.diet_mode)));
    rows.push({ user_id: p.id, kind: "protein", title: text.title, body: text.body, url: "/log?mode=meal" });
  }
  if (rows.length) {
    const { error: insErr } = await db.from("notifications").insert(rows);
    if (insErr) {
      skipped.push(`protein insert: ${insErr.message}`);
      return 0;
    }
  }
  return rows.length;
}

async function fastingStep(db: AdminClient, now: LocalNow, skipped: string[]): Promise<number> {
  const since = new Date(Date.now() - 73 * 3600_000).toISOString();
  const { data, error } = await db.from("fasting_sessions").select("id, user_id, started_at, ended_at, target_hours").is("ended_at", null).gte("started_at", since);
  if (error) {
    skipped.push(isMissingSchema(error) ? "fasting: v36 not applied" : `fasting: ${error.message}`);
    return 0;
  }
  const reached = ((data ?? []) as { id: string; user_id: string; started_at: string; ended_at: string | null; target_hours: number }[]).filter((s) => fastingReached(s));
  if (!reached.length) return 0;
  const urls = reached.map((s) => fastingUrl(s.id));
  const [{ data: sent }, { data: profs }] = await Promise.all([
    db.from("notifications").select("url").eq("kind", "fasting").in("url", urls),
    db.from("profiles").select("id, dob").in("id", [...new Set(reached.map((s) => s.user_id))]),
  ]);
  const done = new Set(((sent ?? []) as { url: string }[]).map((r) => r.url));
  const dob = new Map(((profs ?? []) as { id: string; dob: string | null }[]).map((p) => [p.id, p.dob]));
  const rows = reached
    .filter((s) => !done.has(fastingUrl(s.id)))
    // Fasting is hidden under 18 (spec §7); never notify a minor about one.
    .filter((s) => {
      const age = ageYears(dob.get(s.user_id) ?? null, now.date);
      return age == null || age >= 18;
    })
    .map((s) => ({
      user_id: s.user_id,
      kind: "fasting",
      title: `${Number(s.target_hours)} h fast complete`,
      body: "You reached your goal. Break it gently, with some protein and water.",
      url: fastingUrl(s.id),
    }));
  if (rows.length) {
    const { error: insErr } = await db.from("notifications").insert(rows);
    if (insErr) {
      skipped.push(`fasting insert: ${insErr.message}`);
      return 0;
    }
  }
  return rows.length;
}

async function checkinStep(db: AdminClient, now: LocalNow, skipped: string[]): Promise<number> {
  if (now.weekday !== 1) return 0;
  const { data, error } = await db.from("profiles").select("id").eq("adaptive_targets", true);
  if (error) {
    skipped.push(isMissingSchema(error) ? "checkin: v36 not applied" : `checkin: ${error.message}`);
    return 0;
  }
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return 0;
  const weekStart = istMidnight(now.date);
  const already = new Set<string>();
  for (const part of chunk(ids, 200)) {
    const { data: sent } = await db.from("notifications").select("user_id").eq("kind", "checkin").gte("created_at", weekStart).in("user_id", part);
    for (const r of (sent ?? []) as { user_id: string }[]) already.add(r.user_id);
  }
  const rows = ids
    .filter((id) => checkinDue(now, true, already.has(id)))
    .map((id) => ({ user_id: id, kind: "checkin", title: "Your weekly check-in is ready", body: "See how last week went and whether your calorie target should move.", url: "/" }));
  if (rows.length) {
    const { error: insErr } = await db.from("notifications").insert(rows);
    if (insErr) {
      skipped.push(`checkin insert: ${insErr.message}`);
      return 0;
    }
  }
  return rows.length;
}

export async function runTick(db: AdminClient, when: Date = new Date()): Promise<TickResult> {
  const now = localNow(when);
  const skipped: string[] = [];
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch (e) {
      skipped.push(`${name}: ${e instanceof Error ? e.message : "failed"}`);
      return 0;
    }
  };
  const protein = await step("protein", () => proteinStep(db, now, skipped));
  const fasting = await step("fasting", () => fastingStep(db, now, skipped));
  const checkin = await step("checkin", () => checkinStep(db, now, skipped));
  // v2.14: the coach's morning note / Sunday roast / 8 pm nudge (schema_v37; skipped without it).
  const coach = await step("coach", () => coachStep(db, now, skipped));
  let dispatch: DispatchResult | null = null;
  try {
    dispatch = await dispatchPending(db, null);
  } catch (e) {
    skipped.push(`dispatch: ${e instanceof Error ? e.message : "failed"}`);
  }
  return { now, protein, fasting, checkin, coach, dispatch, skipped };
}
