import type { AdminClient } from "../apiAuth";
import { run } from "../ai/router";
import { ageYears, isTeen, plan } from "../goals";
import { goalRateFor } from "../adaptive";
import { guardReply, systemPrompt } from "../coach";
import { effectiveCoachStyle } from "../onboardingV2";
import { localNow, type LocalNow } from "../notify";
import { DEFAULT_PROFILE, type Profile } from "../types";
import { missingV43, plusDays } from "./schema";
import { checkinAdjust, cleanCheckin, recoveryScore, toneLine, trainedInRow, type Checkin, type DayAdjust, type Recovery } from "./checkin";
import { allTakenStreak, cleanSupplement, dueNow, streak, type Supplement, type SupplementLog } from "./supplements";
import { consistencyScore, type Consistency, type DayFacts } from "./consistency";
import { detectPlateau, type Plateau, type PlateauDay } from "./plateau";
import { activeMode, cleanMode, festivalLine, maintenanceBump, protectedDates, upcomingMode, type FestivalMode } from "./festival";
import { cleanCycle, cycleDay, cycleLine, DEFAULT_CYCLE, type CycleDay, type CycleSettings } from "./cycle";
import { factsLine, fallbackReview, reviewWeek, weekPlan, type WeekFacts, type WeekPlan } from "./weekly";
import { targetsWhy, type Why } from "./targetsWhy";

/**
 * v2.18 coach stream, server side (docs/schema_v43.sql). Service-role client + the caller's id,
 * like coachServer.ts, so the same routes serve the web (cookie) and Android (bearer). Every v43
 * read tolerates the table being missing: `available: false` for that feature, never a 500.
 */

type P = Profile & { id?: string };

export async function loadProfile(admin: AdminClient, uid: string): Promise<P> {
  const { data } = await admin
    .from("profiles")
    .select("name, dob, gender, height_cm, weight_kg, goal_weight_kg, goal_type, goal_speed_kg_wk, calorie_target, protein_target_g, carb_target_g, fat_target_g, weekly_workout_target, water_goal_ml")
    .eq("id", uid)
    .maybeSingle();
  const d = (data ?? {}) as Partial<Profile>;
  const num = (v: unknown, dflt: number) => (v == null || !Number.isFinite(Number(v)) ? dflt : Number(v));
  return {
    ...DEFAULT_PROFILE,
    ...d,
    calorie_target: num(d.calorie_target, DEFAULT_PROFILE.calorie_target),
    protein_target_g: num(d.protein_target_g, DEFAULT_PROFILE.protein_target_g),
    weekly_workout_target: num(d.weekly_workout_target, 3),
    weight_kg: d.weight_kg == null ? null : Number(d.weight_kg),
    height_cm: d.height_cm == null ? null : Number(d.height_cm),
    goal_speed_kg_wk: num(d.goal_speed_kg_wk, 0.5),
    water_goal_ml: num(d.water_goal_ml, 2500),
  };
}

/** Maintenance kcal from the profile (null when details are missing). */
export function maintenanceOf(p: Profile, today: string): number | null {
  const pl = plan(p, today);
  return pl ? Math.round(pl.maintenance / 10) * 10 : null;
}

// ---------------------------------------------------------------- check-in

export async function getCheckin(admin: AdminClient, uid: string, date: string): Promise<{ available: boolean; checkin: Checkin | null; hcSleepMin: number | null }> {
  const { data, error } = await admin.from("daily_checkins").select("date, sleep_hours, sleep_quality, stress, mood, resting_hr, hc_sleep_min").eq("user_id", uid).eq("date", date).maybeSingle();
  if (error) return { available: !missingV43(error), checkin: null, hcSleepMin: null };
  if (!data) return { available: true, checkin: null, hcSleepMin: null };
  const row = data as Record<string, unknown>;
  return { available: true, checkin: cleanCheckin(row, date), hcSleepMin: row.hc_sleep_min == null ? null : Number(row.hc_sleep_min) };
}

export async function saveCheckin(admin: AdminClient, uid: string, date: string, raw: Record<string, unknown>): Promise<{ ok: true; checkin: Checkin } | { ok: false; error: string; unavailable?: boolean }> {
  const c = cleanCheckin(raw, date);
  if (!c) return { ok: false, error: "Tap at least one answer" };
  const hc = raw.hc_sleep_min == null ? null : Math.max(0, Math.min(1200, Math.round(Number(raw.hc_sleep_min)) || 0));
  const row: Record<string, unknown> = { user_id: uid, date, sleep_hours: c.sleep_hours, sleep_quality: c.sleep_quality, stress: c.stress, mood: c.mood, updated_at: new Date().toISOString() };
  if (c.resting_hr != null) row.resting_hr = c.resting_hr;
  if (hc != null) row.hc_sleep_min = hc;
  const { error } = await admin.from("daily_checkins").upsert(row, { onConflict: "user_id,date" });
  if (error) return missingV43(error) ? { ok: false, error: "Coming with the next update", unavailable: true } : { ok: false, error: error.message };
  return { ok: true, checkin: c };
}

async function trainedDates(admin: AdminClient, uid: string, from: string, to: string): Promise<string[]> {
  const [w, e] = await Promise.all([
    admin.from("workouts").select("date").eq("user_id", uid).gte("date", from).lte("date", to),
    admin.from("exercise_log").select("date, minutes").eq("user_id", uid).gte("date", from).lte("date", to),
  ]);
  const set = new Set<string>();
  for (const r of (w.data ?? []) as { date: string }[]) set.add(r.date);
  for (const r of (e.data ?? []) as { date: string; minutes: number | null }[]) if ((Number(r.minutes) || 0) >= 15) set.add(r.date);
  return [...set];
}

/** Resting-HR baseline: the median of the last 14 check-ins that carry one (Android Health Connect). */
async function hrBaseline(admin: AdminClient, uid: string, today: string): Promise<number | null> {
  const { data, error } = await admin.from("daily_checkins").select("resting_hr").eq("user_id", uid).gte("date", plusDays(today, -14)).lt("date", today).not("resting_hr", "is", null);
  if (error || !data?.length) return null;
  const xs = (data as { resting_hr: number }[]).map((r) => Number(r.resting_hr)).sort((a, b) => a - b);
  return xs.length >= 3 ? xs[Math.floor(xs.length / 2)] : null;
}

// ---------------------------------------------------------------- festival / cycle

export async function listModes(admin: AdminClient, uid: string, today: string): Promise<{ available: boolean; modes: FestivalMode[] }> {
  const { data, error } = await admin.from("festival_modes").select("id, kind, name, start_date, end_date").eq("user_id", uid).gte("end_date", plusDays(today, -60)).order("start_date", { ascending: true });
  if (error) return { available: !missingV43(error), modes: [] };
  return { available: true, modes: (data ?? []) as FestivalMode[] };
}

export async function addMode(admin: AdminClient, uid: string, raw: Record<string, unknown>, today: string) {
  const c = cleanMode(raw, today);
  if (!c.ok) return c;
  const { data, error } = await admin.from("festival_modes").insert({ ...c.value, user_id: uid }).select("id, kind, name, start_date, end_date").single();
  if (error) return { ok: false as const, error: missingV43(error) ? "Coming with the next update" : error.message };
  return { ok: true as const, mode: data as FestivalMode };
}

export async function removeMode(admin: AdminClient, uid: string, id: string) {
  const { error } = await admin.from("festival_modes").delete().eq("id", id).eq("user_id", uid);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function getCycle(admin: AdminClient, uid: string): Promise<{ available: boolean; settings: CycleSettings }> {
  const { data, error } = await admin.from("cycle_settings").select("enabled, last_period_start, cycle_length, period_length").eq("user_id", uid).maybeSingle();
  if (error) return { available: !missingV43(error), settings: DEFAULT_CYCLE };
  return { available: true, settings: data ? cleanCycle(data as Record<string, unknown>) : DEFAULT_CYCLE };
}

export async function saveCycle(admin: AdminClient, uid: string, raw: Record<string, unknown>) {
  const s = cleanCycle(raw);
  const { error } = await admin.from("cycle_settings").upsert({ user_id: uid, ...s, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false as const, error: missingV43(error) ? "Coming with the next update" : error.message };
  return { ok: true as const, settings: s };
}

/** Turning cycle tracking off deletes the row (private data isn't kept around). */
export async function deleteCycle(admin: AdminClient, uid: string) {
  const { error } = await admin.from("cycle_settings").delete().eq("user_id", uid);
  return error && !missingV43(error) ? { ok: false as const, error: error.message } : { ok: true as const };
}

// ---------------------------------------------------------------- supplements

export type SupplementRow = Supplement & { takenToday: boolean; current: number; best: number; due: boolean };

export async function listSupplements(admin: AdminClient, uid: string, now: LocalNow): Promise<{ available: boolean; items: SupplementRow[]; allStreak: number }> {
  const [s, l] = await Promise.all([
    admin.from("supplements").select("id, name, kind, dose, unit, remind_at, active, created_at").eq("user_id", uid).order("created_at", { ascending: true }),
    admin.from("supplement_logs").select("supplement_id, date").eq("user_id", uid).gte("date", plusDays(now.date, -120)),
  ]);
  if (s.error) return { available: !missingV43(s.error), items: [], allStreak: 0 };
  const logs = (l.data ?? []) as SupplementLog[];
  const list = ((s.data ?? []) as Supplement[]).map((x) => ({ ...x, dose: x.dose == null ? null : Number(x.dose), remind_at: x.remind_at ? String(x.remind_at).slice(0, 5) : null }));
  const items = list.map((x) => {
    const st = streak(logs.filter((g) => g.supplement_id === x.id).map((g) => g.date), now.date);
    return { ...x, takenToday: st.takenToday, current: st.current, best: st.best, due: dueNow(x, st.takenToday, now.minutes) };
  });
  return { available: true, items, allStreak: allTakenStreak(list.filter((x) => x.active), logs, now.date) };
}

export async function addSupplement(admin: AdminClient, uid: string, raw: Record<string, unknown>) {
  const c = cleanSupplement(raw);
  if (!c.ok) return c;
  const { count } = await admin.from("supplements").select("id", { count: "exact", head: true }).eq("user_id", uid);
  if ((count ?? 0) >= 20) return { ok: false as const, error: "That's 20 already. Remove one first." };
  const { data, error } = await admin.from("supplements").insert({ ...c.value, user_id: uid }).select("id").single();
  if (error) return { ok: false as const, error: missingV43(error) ? "Coming with the next update" : error.message };
  return { ok: true as const, id: (data as { id: string }).id };
}

export async function updateSupplement(admin: AdminClient, uid: string, id: string, raw: Record<string, unknown>) {
  const c = cleanSupplement(raw);
  if (!c.ok) return c;
  const { error } = await admin.from("supplements").update(c.value).eq("id", id).eq("user_id", uid);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function removeSupplement(admin: AdminClient, uid: string, id: string) {
  const { error } = await admin.from("supplements").delete().eq("id", id).eq("user_id", uid);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function markTaken(admin: AdminClient, uid: string, id: string, date: string, taken: boolean) {
  const own = await admin.from("supplements").select("id").eq("id", id).eq("user_id", uid).maybeSingle();
  if (own.error) return { ok: false as const, error: missingV43(own.error) ? "Coming with the next update" : own.error.message };
  if (!own.data) return { ok: false as const, error: "Unknown supplement" };
  const { error } = taken
    ? await admin.from("supplement_logs").upsert({ supplement_id: id, user_id: uid, date, taken_at: new Date().toISOString() }, { onConflict: "supplement_id,date" })
    : await admin.from("supplement_logs").delete().eq("supplement_id", id).eq("user_id", uid).eq("date", date);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

// ---------------------------------------------------------------- the daily bundle (Home card)

export type Daily = {
  date: string;
  /** False until schema_v43 (the check-in card hides). Not called `available`: Android reads that as "whole route missing". */
  checkinAvailable: boolean;
  checkin: Checkin | null;
  adjust: DayAdjust;
  recovery: Recovery | null;
  /** Today's calorie target: base + check-in bump + festival bump (festival wins when bigger). */
  targets: { base: number; kcal: number; bump: number; reasons: string[] };
  festival: { available: boolean; active: FestivalMode | null; upcoming: { mode: FestivalMode; inDays: number } | null; line: string | null; modes: FestivalMode[] };
  cycle: { available: boolean; enabled: boolean; today: CycleDay | null };
  supplements: { available: boolean; items: SupplementRow[]; allStreak: number };
  teen: boolean;
};

export async function loadDaily(admin: AdminClient, uid: string, now: LocalNow = localNow()): Promise<Daily> {
  const today = now.date;
  const p = await loadProfile(admin, uid);
  const teen = isTeen(ageYears(p.dob, today));
  const [ci, modes, cyc, supps, trained, baseline] = await Promise.all([
    getCheckin(admin, uid, today),
    listModes(admin, uid, today),
    getCycle(admin, uid),
    listSupplements(admin, uid, now),
    trainedDates(admin, uid, plusDays(today, -7), today),
    hrBaseline(admin, uid, today),
  ]);
  const adjust = checkinAdjust(ci.checkin, p.goal_type, teen);
  const recovery = ci.checkin
    ? recoveryScore({
        sleepHours: ci.checkin.sleep_hours ?? (ci.hcSleepMin != null ? ci.hcSleepMin / 60 : null),
        sleepQuality: ci.checkin.sleep_quality,
        stress: ci.checkin.stress,
        mood: ci.checkin.mood,
        restingHr: ci.checkin.resting_hr,
        baselineHr: baseline,
        trainedDaysInRow: trainedInRow(trained, today),
        hcSleep: ci.checkin.sleep_hours == null && ci.hcSleepMin != null,
      })
    : null;
  const active = activeMode(modes.modes, today);
  const festBump = active ? maintenanceBump(p.calorie_target, maintenanceOf(p, today)) : 0;
  const bump = Math.max(adjust.kcal, festBump);
  const reasons = [...(festBump >= adjust.kcal && festBump > 0 && active ? [`${active.name} mode: maintenance`] : []), ...(adjust.kcal > festBump ? adjust.reasons : [])];
  return {
    date: today,
    checkinAvailable: ci.available,
    checkin: ci.checkin,
    adjust,
    recovery,
    targets: { base: p.calorie_target, kcal: p.calorie_target + bump, bump, reasons },
    festival: { available: modes.available, active, upcoming: upcomingMode(modes.modes, today), line: festivalLine(modes.modes, today), modes: modes.modes },
    cycle: { available: cyc.available, enabled: cyc.settings.enabled, today: cycleDay(cyc.settings, today) },
    supplements: supps,
    teen,
  };
}

/** Today's calorie bump for Home's ring (0 when nothing applies or v43 isn't there). */
export async function dayBump(admin: AdminClient, uid: string): Promise<{ kcal: number; reasons: string[] }> {
  try {
    const d = await loadDaily(admin, uid);
    return { kcal: d.targets.bump, reasons: d.targets.reasons };
  } catch {
    return { kcal: 0, reasons: [] };
  }
}

/** Streak-protected dates (festival modes up to today). */
export async function streakProtected(admin: AdminClient, uid: string, today: string): Promise<string[]> {
  const m = await listModes(admin, uid, today).catch(() => ({ available: false, modes: [] as FestivalMode[] }));
  return protectedDates(m.modes, today);
}

// ---------------------------------------------------------------- coach context (chat / notes)

/**
 * Extra CONTEXT lines for the coach (check-in, recovery, festival, cycle, supplements) and today's
 * tone. Never throws: any missing table just drops its line.
 */
export async function coachPlusContext(admin: AdminClient, uid: string, now: LocalNow = localNow()): Promise<{ lines: string[]; tone: string; bump: number }> {
  try {
    const d = await loadDaily(admin, uid, now);
    const lines: string[] = [];
    if (d.checkin) {
      const c = d.checkin;
      lines.push(`Today's check-in: ${[c.sleep_hours != null ? `slept ${c.sleep_hours} h` : null, c.sleep_quality != null ? `sleep quality ${c.sleep_quality}/5` : null, c.stress != null ? `stress ${c.stress}/5` : null, c.mood != null ? `mood ${c.mood}/5` : null].filter(Boolean).join(", ")}.`);
    }
    if (d.recovery) lines.push(`Recovery score ${d.recovery.score}/100 (${d.recovery.label}): ${d.recovery.advice}`);
    if (d.targets.bump > 0) lines.push(`Today's calorie target is ${d.targets.kcal} kcal (base ${d.targets.base} + ${d.targets.bump}: ${d.targets.reasons.join(", ")}). Use ${d.targets.kcal} for "left today".`);
    if (d.festival.line) lines.push(d.festival.line);
    const cl = cycleLine(d.cycle.today);
    if (cl) lines.push(cl);
    const act = d.supplements.items.filter((s) => s.active);
    if (act.length) lines.push(`Supplements: ${act.map((s) => `${s.name}${s.takenToday ? " (taken today)" : " (not yet today)"}${s.current > 1 ? `, ${s.current}-day streak` : ""}`).join("; ")}. Never suggest doses.`);
    return { lines, tone: toneLine(d.adjust), bump: d.targets.bump };
  } catch {
    return { lines: [], tone: "", bump: 0 };
  }
}

// ---------------------------------------------------------------- insights (weekly, plateau, consistency, why)

async function dayRows(admin: AdminClient, uid: string, from: string, to: string) {
  const [meals, water, weights, checkins, trained] = await Promise.all([
    admin.from("meals").select("date, meal_items(calories, protein_g, micros)").eq("user_id", uid).gte("date", from).lte("date", to),
    admin.from("water_log").select("date, ml").eq("user_id", uid).gte("date", from).lte("date", to),
    admin.from("weight_log").select("date, weight_kg").eq("user_id", uid).gte("date", plusDays(to, -35)).lte("date", to),
    admin.from("daily_checkins").select("date, sleep_hours, sleep_quality").eq("user_id", uid).gte("date", from).lte("date", to),
    trainedDates(admin, uid, from, to),
  ]);
  type M = { date: string; meal_items: { calories: number; protein_g: number; micros: Record<string, number> | null }[] | null };
  const byDay = new Map<string, { kcal: number; protein: number; sodium: number; meals: number; water: number }>();
  const get = (d: string) => byDay.get(d) ?? (byDay.set(d, { kcal: 0, protein: 0, sodium: 0, meals: 0, water: 0 }), byDay.get(d)!);
  for (const m of (meals.data ?? []) as M[]) {
    const t = get(m.date);
    t.meals++;
    for (const i of m.meal_items ?? []) {
      t.kcal += Number(i.calories) || 0;
      t.protein += Number(i.protein_g) || 0;
      t.sodium += Number(i.micros?.sodium_mg) || 0;
    }
  }
  for (const w of (water.data ?? []) as { date: string; ml: number }[]) get(w.date).water += Number(w.ml) || 0;
  const sleep = new Map(((checkins.data ?? []) as { date: string; sleep_hours: number | null; sleep_quality: number | null }[]).map((c) => [c.date, c]));
  return {
    byDay,
    weighIns: ((weights.data ?? []) as { date: string; weight_kg: number }[]).map((w) => ({ date: w.date, kg: Number(w.weight_kg) })),
    sleep,
    trained: new Set(trained),
    checkinsAvailable: !checkins.error || !missingV43(checkins.error),
  };
}

const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => plusDays(from, i));

export type Insights = {
  consistency: Consistency;
  plateau: Plateau;
  weekly: { weekStart: string; text: string; plan: WeekPlan; facts: WeekFacts; stored: boolean } | null;
  why: (Why & { oldTarget: number; newTarget: number; weekStart: string }) | null;
};

export async function loadInsights(admin: AdminClient, uid: string, now: LocalNow = localNow(), opts: { generate?: boolean } = {}): Promise<Insights> {
  const today = now.date;
  const p = await loadProfile(admin, uid);
  const from = plusDays(today, -27);
  const rows = await dayRows(admin, uid, from, today);

  // B11: last 14 days.
  const last14 = range(plusDays(today, -13), 14);
  const facts: DayFacts[] = last14.map((d) => {
    const t = rows.byDay.get(d);
    const s = rows.sleep.get(d);
    return { date: d, logged: (t?.meals ?? 0) > 0, protein: t?.protein ?? 0, trained: rows.trained.has(d), sleepHours: s?.sleep_hours == null ? null : Number(s.sleep_hours), sleepQuality: s?.sleep_quality == null ? null : Number(s.sleep_quality) };
  });
  const consistency = consistencyScore(facts, { protein: p.protein_target_g, workoutsPerWeek: p.weekly_workout_target });

  // B5: plateau over the last 14 days.
  const pdays: PlateauDay[] = last14.map((d) => {
    const t = rows.byDay.get(d);
    return { date: d, kcal: t && t.meals ? Math.round(t.kcal) : null, water: t?.water || null, sodiumMg: t && t.meals && t.sodium ? Math.round(t.sodium) : null };
  });
  const plateau = detectPlateau({ goal: isTeen(ageYears(p.dob, today)) ? "maintain" : p.goal_type, weighIns: rows.weighIns, days: pdays, target: p.calorie_target, asOf: today });

  // B2: the weekly review.
  const weekStart = reviewWeek(today, now.minutes);
  const week = range(weekStart, 7).filter((d) => d <= today);
  const logged = week.filter((d) => (rows.byDay.get(d)?.meals ?? 0) > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sleeps = week.map((d) => rows.sleep.get(d)?.sleep_hours).filter((x): x is number => x != null).map(Number);
  const wIn = rows.weighIns.filter((w) => w.date >= weekStart && w.date <= plusDays(weekStart, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const wf: WeekFacts = {
    weekStart,
    loggedDays: logged.length,
    avgKcal: avg(logged.map((d) => rows.byDay.get(d)!.kcal)),
    kcalTarget: p.calorie_target,
    avgProtein: avg(logged.map((d) => rows.byDay.get(d)!.protein)),
    proteinTarget: p.protein_target_g,
    proteinDays: logged.filter((d) => rows.byDay.get(d)!.protein >= p.protein_target_g * 0.9).length,
    workouts: week.filter((d) => rows.trained.has(d)).length,
    workoutTarget: p.weekly_workout_target,
    avgSleep: avg(sleeps),
    checkins: sleeps.length,
    weightChange: wIn.length >= 2 ? Math.round((wIn[wIn.length - 1].kg - wIn[0].kg) * 10) / 10 : null,
    goal: p.goal_type,
  };
  const wp = weekPlan(wf);
  let weekly: Insights["weekly"] = null;
  const stored = await admin.from("coach_reviews").select("text, focus, facts").eq("user_id", uid).eq("week_start", weekStart).eq("kind", "weekly").maybeSingle();
  if (!stored.error && stored.data) {
    weekly = { weekStart, text: (stored.data as { text: string }).text, plan: wp, facts: wf, stored: true };
  } else {
    let text = fallbackReview(wf, wp);
    if (opts.generate && !stored.error && process.env.ANTHROPIC_API_KEY) {
      try {
        const style = await admin.from("profiles").select("coach_style").eq("id", uid).maybeSingle();
        const s = effectiveCoachStyle((style.data as { coach_style?: unknown } | null)?.coach_style, isTeen(ageYears(p.dob, today)) ? 15 : 30);
        const sys = `${systemPrompt(s, { teen: isTeen(ageYears(p.dob, today)), name: p.name, kind: "chat" })}\nTASK: the weekly check-in. In 3 to 4 sentences (max 80 words): one honest line on how the week went using the numbers, one thing that went well, then state THIS plan for next week in your own words (don't change it): "${wp.plan}"`;
        const res = await run<string>("coach_note", { kind: "text", system: sys, text: factsLine(wf), maxTokens: 300 });
        const out = String(res.data ?? "").trim();
        if (out) text = guardReply(out, s);
      } catch {
        // keep the fallback
      }
    }
    if (!stored.error && opts.generate) {
      await admin.from("coach_reviews").upsert({ user_id: uid, week_start: weekStart, kind: "weekly", text: text.slice(0, 2000), focus: wp.focus, facts: wf }, { onConflict: "user_id,week_start,kind", ignoreDuplicates: true });
    }
    weekly = { weekStart, text, plan: wp, facts: wf, stored: !stored.error && !!opts.generate };
  }

  // B3: the latest adaptive check-in that changed (or would change) the target.
  let why: Insights["why"] = null;
  const ci = await admin.from("weekly_checkins").select("week_start, trend_kg_per_week, avg_kcal, old_target, new_target").eq("user_id", uid).order("week_start", { ascending: false }).limit(1).maybeSingle();
  if (!ci.error && ci.data) {
    const r = ci.data as { week_start: string; trend_kg_per_week: number | null; avg_kcal: number | null; old_target: number | null; new_target: number | null };
    if (r.old_target != null && r.new_target != null && r.avg_kcal != null && r.trend_kg_per_week != null) {
      const w = targetsWhy({ oldTarget: r.old_target, newTarget: r.new_target, trendKgPerWeek: Number(r.trend_kg_per_week), goalRateKgPerWeek: goalRateFor(p, today), avgKcal: r.avg_kcal });
      why = { ...w, oldTarget: r.old_target, newTarget: r.new_target, weekStart: r.week_start };
    }
  }
  return { consistency, plateau, weekly, why };
}

// ---------------------------------------------------------------- form checks

export async function saveFormCheck(admin: AdminClient, uid: string, raw: Record<string, unknown>) {
  const ex = raw.exercise;
  if (ex !== "squat" && ex !== "pushup" && ex !== "lunge") return { ok: false as const, error: "Unknown exercise" };
  const reps = Math.max(0, Math.min(500, Math.round(Number(raw.reps) || 0)));
  const clean = raw.clean_pct == null ? null : Math.max(0, Math.min(100, Math.round(Number(raw.clean_pct) || 0)));
  const tips = Array.isArray(raw.tips) ? raw.tips.filter((t): t is string => typeof t === "string").slice(0, 3).map((t) => t.slice(0, 140)) : [];
  const platform = raw.platform === "android" ? "android" : "web";
  const { error } = await admin.from("form_checks").insert({ user_id: uid, exercise: ex, reps, clean_pct: clean, tips, platform });
  if (error) return { ok: false as const, error: missingV43(error) ? "Coming with the next update" : error.message, unavailable: missingV43(error) };
  return { ok: true as const };
}

export async function listFormChecks(admin: AdminClient, uid: string) {
  const { data, error } = await admin.from("form_checks").select("id, exercise, reps, clean_pct, tips, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(20);
  if (error) return { available: !missingV43(error), items: [] as { id: string; exercise: string; reps: number; clean_pct: number | null; tips: string[]; created_at: string }[] };
  return { available: true, items: (data ?? []) as { id: string; exercise: string; reps: number; clean_pct: number | null; tips: string[]; created_at: string }[] };
}

// ---------------------------------------------------------------- cron: supplement reminders (web push)

/**
 * Cron step: a 'coach' notification for each active supplement whose reminder time passed in the
 * last 3 hours and isn't taken yet. De-duped per supplement per day. Android also schedules its own
 * local alarms, so it may get both (the inbox row is harmless).
 */
export async function supplementStep(db: AdminClient, now: LocalNow, skipped: string[]): Promise<number> {
  const { data, error } = await db.from("supplements").select("id, user_id, name, remind_at").eq("active", true).not("remind_at", "is", null).limit(5000);
  if (error) {
    skipped.push(missingV43(error) ? "supplements: v43 not applied" : `supplements: ${error.message}`);
    return 0;
  }
  const due = ((data ?? []) as { id: string; user_id: string; name: string; remind_at: string }[]).filter((s) => {
    const [h, m] = String(s.remind_at).split(":").map(Number);
    const t = h * 60 + m;
    return now.minutes >= t && now.minutes < t + 180;
  });
  if (!due.length) return 0;
  const ids = due.map((s) => s.id);
  const [taken, sent] = await Promise.all([
    db.from("supplement_logs").select("supplement_id").eq("date", now.date).in("supplement_id", ids),
    db.from("supplement_reminders_sent").select("supplement_id").eq("date", now.date).in("supplement_id", ids),
  ]);
  const skip = new Set([...((taken.data ?? []) as { supplement_id: string }[]), ...((sent.data ?? []) as { supplement_id: string }[])].map((r) => r.supplement_id));
  let made = 0;
  for (const s of due) {
    if (skip.has(s.id) || made >= 300) continue;
    const mark = await db.from("supplement_reminders_sent").insert({ supplement_id: s.id, date: now.date });
    if (mark.error) continue;
    await db.from("notifications").insert({ user_id: s.user_id, kind: "coach", title: `${s.name} time`, body: "Tap to tick it off and keep your streak.", url: "/coach/supplements" });
    made++;
  }
  return made;
}
