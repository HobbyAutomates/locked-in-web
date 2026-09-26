import type Anthropic from "@anthropic-ai/sdk";
import type { AdminClient } from "./apiAuth";
import { run } from "./ai/router";
import { TASKS } from "./ai/tasks";
import type { JsonSchema } from "./ai/types";
import { addDays } from "./dates";
import { ageYears, isTeen } from "./goals";
import { isDietMode, type DietMode } from "./dietModes";
import { defaultMealType, isMealType, missingMealTypeColumn, type MealType } from "./mealType";
import { rollupQuietly } from "./rollup";
import { parseMealText } from "./parseMeal";
import { suggestFoods, remainingFrom } from "./whatToEat";
import { clampHours } from "./fasting";
import { localNow, type LocalNow } from "./notify";
import { missingV37 } from "./coachSchema";
import { effectiveCoachStyle } from "./onboardingV2";
import type { FoodPreset, MealItem } from "./types";
import {
  cleanMemory,
  detectSafety,
  eveningDue,
  fallbackEvening,
  fallbackNote,
  guardReply,
  hhmmToMin,
  inQuietHours,
  isMemoryKind,
  noteDue,
  safetyReply,
  systemPrompt,
  type CoachCard,
  type CoachMessage,
  type CoachStyle,
  type Memory,
} from "./coach";

/**
 * v2.14 AI coach, server side. Everything runs with the service-role client and filters by the
 * caller's id (web cookie or Android bearer both resolve to a user id in apiUser). Model calls go
 * through the router, which logs llm_usage per call (the existing cost logger).
 */

export class CoachUnavailable extends Error {
  constructor() {
    super("Coming with the next update");
  }
}

export type CoachProfile = {
  name: string;
  dob: string | null;
  weight_kg: number | null;
  goal_type: string;
  goal_weight_kg: number | null;
  calorie_target: number;
  protein_target_g: number;
  carb_target_g: number | null;
  fat_target_g: number | null;
  weekly_workout_target: number;
  diet_mode: DietMode;
  style: CoachStyle;
  remember: boolean;
  noteMin: number;
  quiet: { from: number; to: number };
  roast: boolean;
  obstacles: string[];
  teen: boolean;
};

export async function loadCoachProfile(admin: AdminClient, uid: string, today: string): Promise<CoachProfile> {
  const [classic, v36, v37] = await Promise.all([
    admin.from("profiles").select("name, dob, weight_kg, goal_type, goal_weight_kg, calorie_target, protein_target_g, carb_target_g, fat_target_g, weekly_workout_target").eq("id", uid).maybeSingle(),
    admin.from("profiles").select("diet_mode").eq("id", uid).maybeSingle(),
    admin.from("profiles").select("coach_style, coach_remember, coach_note_time, coach_quiet_from, coach_quiet_to, coach_weekly_roast, obstacles").eq("id", uid).maybeSingle(),
  ]);
  if (v37.error) {
    if (missingV37(v37.error)) throw new CoachUnavailable();
    throw new Error(v37.error.message);
  }
  const c = (classic.data ?? {}) as Record<string, unknown>;
  const x = (v37.data ?? {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) => (v == null ? d : Number(v));
  const teen = isTeen(ageYears(typeof c.dob === "string" ? c.dob : null, today));
  const dm = (v36.data as { diet_mode?: unknown } | null)?.diet_mode;
  return {
    name: typeof c.name === "string" ? c.name : "",
    dob: typeof c.dob === "string" ? c.dob : null,
    weight_kg: c.weight_kg == null ? null : Number(c.weight_kg),
    goal_type: typeof c.goal_type === "string" ? c.goal_type : "maintain",
    goal_weight_kg: c.goal_weight_kg == null ? null : Number(c.goal_weight_kg),
    calorie_target: n(c.calorie_target, 2200),
    protein_target_g: n(c.protein_target_g, 120),
    carb_target_g: c.carb_target_g == null ? null : Number(c.carb_target_g),
    fat_target_g: c.fat_target_g == null ? null : Number(c.fat_target_g),
    weekly_workout_target: n(c.weekly_workout_target, 3),
    diet_mode: isDietMode(dm) ? dm : "balanced",
    style: effectiveCoachStyle(x.coach_style, teen ? 15 : 30),
    remember: x.coach_remember !== false,
    noteMin: hhmmToMin(x.coach_note_time, 8 * 60),
    quiet: { from: hhmmToMin(x.coach_quiet_from, 23 * 60), to: hhmmToMin(x.coach_quiet_to, 7 * 60) },
    roast: x.coach_weekly_roast === true && !teen,
    obstacles: Array.isArray(x.obstacles) ? (x.obstacles as string[]) : [],
    teen,
  };
}

// ---------------------------------------------------------------- context

type DayTotals = { date: string; kcal: number; protein: number; carbs: number; fat: number; meals: number };

export type CoachDays = { today: DayTotals; days: DayTotals[]; workouts: string[]; waterToday: number; mealsToday: { type: string; text: string }[] };

export async function loadDays(admin: AdminClient, uid: string, today: string): Promise<CoachDays> {
  const from = addDays(today, -7);
  const [meals, workouts, water] = await Promise.all([
    admin.from("meals").select("date, raw_text, meal_type, meal_items(calories, protein_g, carbs_g, fat_g)").eq("user_id", uid).gte("date", from).lte("date", today),
    admin.from("workouts").select("date").eq("user_id", uid).gte("date", from).lte("date", today),
    admin.from("water_log").select("ml").eq("user_id", uid).eq("date", today),
  ]);
  type M = { date: string; raw_text: string | null; meal_type?: string | null; meal_items: { calories: number; protein_g: number; carbs_g: number; fat_g: number }[] | null };
  const by = new Map<string, DayTotals>();
  for (let i = 0; i <= 7; i++) {
    const d = addDays(from, i);
    by.set(d, { date: d, kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 });
  }
  const mealsToday: { type: string; text: string }[] = [];
  for (const m of (meals.data ?? []) as M[]) {
    const t = by.get(m.date);
    if (!t) continue;
    t.meals++;
    for (const i of m.meal_items ?? []) {
      t.kcal += Number(i.calories) || 0;
      t.protein += Number(i.protein_g) || 0;
      t.carbs += Number(i.carbs_g) || 0;
      t.fat += Number(i.fat_g) || 0;
    }
    if (m.date === today) mealsToday.push({ type: m.meal_type ?? "meal", text: (m.raw_text ?? "").slice(0, 80) });
  }
  const days = [...by.values()].map((d) => ({ ...d, kcal: Math.round(d.kcal), protein: Math.round(d.protein), carbs: Math.round(d.carbs), fat: Math.round(d.fat) }));
  return {
    today: days[days.length - 1],
    days,
    workouts: [...new Set(((workouts.data ?? []) as { date: string }[]).map((w) => w.date))],
    waterToday: ((water.data ?? []) as { ml: number }[]).reduce((a, w) => a + Number(w.ml), 0),
    mealsToday,
  };
}

export async function loadMemories(admin: AdminClient, uid: string, n = 20): Promise<Memory[]> {
  const { data, error } = await admin
    .from("coach_memory")
    .select("id, kind, text, source, pinned, kept, created_at")
    .eq("user_id", uid)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) {
    if (missingV37(error)) throw new CoachUnavailable();
    throw new Error(error.message);
  }
  return ((data ?? []) as Memory[]).map((m) => ({ ...m, kind: isMemoryKind(m.kind) ? m.kind : "life" }));
}

function targetsOf(p: CoachProfile) {
  const carbs = p.carb_target_g ?? Math.max(0, Math.round((p.calorie_target - p.protein_target_g * 4 - p.calorie_target * 0.25) / 4));
  const fat = p.fat_target_g ?? Math.round((p.calorie_target * 0.25) / 9);
  return { kcal: p.calorie_target, protein: p.protein_target_g, carbs, fat };
}

export function contextBlock(p: CoachProfile, d: CoachDays, memories: Memory[], now: LocalNow): string {
  const t = targetsOf(p);
  const week = d.days.slice(0, -1);
  const logged = week.filter((x) => x.meals > 0);
  const avgP = logged.length ? Math.round(logged.reduce((a, x) => a + x.protein, 0) / logged.length) : null;
  const yesterday = d.days[d.days.length - 2];
  const hh = String(Math.floor(now.minutes / 60)).padStart(2, "0");
  const mm = String(now.minutes % 60).padStart(2, "0");
  const lines = [
    "CONTEXT",
    `Now: ${now.date} ${hh}:${mm} (India time).`,
    `Goal: ${p.goal_type}${p.goal_weight_kg ? ` to ${p.goal_weight_kg} kg` : ""}${p.weight_kg ? ` (now ${p.weight_kg} kg)` : ""}. Diet mode: ${p.diet_mode}. Trains ${p.weekly_workout_target}x/week target.`,
    `Daily targets: ${t.kcal} kcal, protein ${t.protein} g, carbs ${t.carbs} g, fat ${t.fat} g.`,
    `Today so far: ${d.today.kcal} kcal, protein ${d.today.protein} g, carbs ${d.today.carbs} g, fat ${d.today.fat} g, ${d.today.meals} meal(s) logged${d.mealsToday.length ? ` (${d.mealsToday.map((m) => `${m.type}: ${m.text}`).join("; ")})` : ""}. Water ${d.waterToday} ml.`,
    `Yesterday: ${yesterday.meals ? `${yesterday.kcal} kcal, protein ${yesterday.protein} g, ${yesterday.meals} meal(s)` : "nothing logged"}.`,
    `Last 7 days: logged on ${logged.length}/7 days${avgP != null ? `, avg protein ${avgP} g on logged days` : ""}; workouts on ${d.workouts.filter((w) => w < now.date).length} day(s)${d.workouts.includes(now.date) ? ", and trained today" : ""}.`,
  ];
  if (p.obstacles.length) lines.push(`Obstacles they told us: ${p.obstacles.join(", ").replace(/_/g, " ")}.`);
  if (memories.length) lines.push("WHAT YOU REMEMBER ABOUT THEM (use naturally, don't list back):", ...memories.map((m) => `- [${m.kind}] ${m.text}`));
  return lines.join("\n");
}

// ---------------------------------------------------------------- tools

const MEAL_ENUM = ["breakfast", "lunch", "dinner", "snack"];

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_meal",
    description: "Log food the user says they ate (or confirms they want logged). Pass their words; the app prices it from its Indian food database.",
    input_schema: { type: "object", properties: { text: { type: "string", description: "What they ate, e.g. '150 g paneer bhurji, 2 roti'" }, meal_type: { type: "string", enum: MEAL_ENUM } }, required: ["text"] },
  },
  {
    name: "log_water",
    description: "Log water they drank, in millilitres.",
    input_schema: { type: "object", properties: { ml: { type: "integer", minimum: 50, maximum: 3000 } }, required: ["ml"] },
  },
  { name: "remaining_today", description: "Calories and macros left for today.", input_schema: { type: "object", properties: {} } },
  {
    name: "suggest_foods",
    description: "Ranked Indian food suggestions that fit what's left today and their diet mode.",
    input_schema: { type: "object", properties: { meal_type: { type: "string", enum: MEAL_ENUM } } },
  },
  {
    name: "start_fast",
    description: "Start an intermittent fast timer when the user explicitly asks. Not available under 18.",
    input_schema: { type: "object", properties: { hours: { type: "number", minimum: 12, maximum: 24 } }, required: ["hours"] },
  },
  {
    name: "add_memory",
    description: "Propose remembering a lasting fact the user shared (routine, preference, constraint). The user confirms it. Never about looks or body shape.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["goal", "food", "life", "body", "style"] }, text: { type: "string", description: "Short, third person, e.g. 'Hostel mess on weekdays'" } }, required: ["kind", "text"] },
  },
];

type Ctx = { admin: AdminClient; uid: string; p: CoachProfile; today: string; days: CoachDays; cards: CoachCard[] };

async function insertMeal(admin: AdminClient, uid: string, input: { date: string; raw_text: string; meal_type: MealType; items: MealItem[] }): Promise<string> {
  const row = { user_id: uid, date: input.date, raw_text: input.raw_text };
  let res = await admin.from("meals").insert({ ...row, meal_type: input.meal_type }).select("id").single();
  if (res.error && missingMealTypeColumn(res.error)) res = await admin.from("meals").insert(row).select("id").single();
  if (res.error || !res.data) throw new Error(res.error?.message ?? "Could not save the meal");
  const id = res.data.id as string;
  const items = input.items.filter((i) => i.grams > 0);
  if (items.length) {
    const { error } = await admin.from("meal_items").insert(
      items.map((i) => ({ meal_id: id, user_id: uid, food_id: i.food_id, name: i.name, grams: i.grams, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, source: i.source, confidence: i.confidence, micros: i.micros ?? {}, unit: i.unit ?? null, servings: i.servings ?? null })),
    );
    if (error) throw new Error(error.message);
  }
  await rollupQuietly(admin, uid, [input.date]);
  return id;
}

async function loadPresets(admin: AdminClient): Promise<FoodPreset[]> {
  const { data } = await admin.from("food_presets").select("id, food_id, label, label_hi, category, servings, default_serving, sort, icon, image_url, foods(name, calories, protein_g, carbs_g, fat_g, micros)").order("sort", { ascending: true });
  type Row = { id: string; food_id: string; label: string; label_hi: string | null; category: string; servings: unknown; default_serving: string | null; sort: number | null; icon: string | null; image_url: string | null; foods: { name: string; calories: unknown; protein_g: unknown; carbs_g: unknown; fat_g: unknown; micros: unknown } | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.foods)
    .map((r) => ({
      id: r.id,
      food_id: r.food_id,
      label: r.label,
      label_hi: r.label_hi,
      category: r.category as FoodPreset["category"],
      servings: (Array.isArray(r.servings) ? r.servings : []) as FoodPreset["servings"],
      default_serving: r.default_serving,
      sort: Number(r.sort ?? 100),
      icon: r.icon,
      food_name: r.foods?.name ?? r.label,
      calories: Number(r.foods?.calories ?? 0),
      protein_g: Number(r.foods?.protein_g ?? 0),
      carbs_g: Number(r.foods?.carbs_g ?? 0),
      fat_g: Number(r.foods?.fat_g ?? 0),
      micros: (r.foods?.micros ?? {}) as Record<string, number>,
      image_url: r.image_url ?? null,
    }));
}

function remainingNow(c: Ctx) {
  const t = targetsOf(c.p);
  return remainingFrom(t, { calories: c.days.today.kcal, protein: c.days.today.protein, carbs: c.days.today.carbs, fat: c.days.today.fat });
}

async function runTool(c: Ctx, name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "log_meal": {
      const text = String(input.text ?? "").trim().slice(0, 500);
      if (!text) return "Nothing to log.";
      const parsed = await parseMealText({ admin: c.admin, userId: c.uid, text });
      if (!parsed.items.length) return "Couldn't find food in that. Ask them what exactly they ate.";
      const mt: MealType = isMealType(input.meal_type) ? input.meal_type : defaultMealType();
      const id = await insertMeal(c.admin, c.uid, { date: c.today, raw_text: text, meal_type: mt, items: parsed.items });
      const kcal = Math.round(parsed.items.reduce((a, i) => a + i.calories, 0));
      const protein = Math.round(parsed.items.reduce((a, i) => a + i.protein_g, 0));
      c.days.today.kcal += kcal;
      c.days.today.protein += protein;
      c.days.today.carbs += Math.round(parsed.items.reduce((a, i) => a + i.carbs_g, 0));
      c.days.today.fat += Math.round(parsed.items.reduce((a, i) => a + i.fat_g, 0));
      c.days.today.meals++;
      const title = parsed.items.map((i) => (i.servings && i.serving_unit ? `${i.name} ×${i.servings}` : `${i.name} ${Math.round(i.grams)} g`)).join(" + ");
      c.cards.push({ type: "meal_logged", meal_id: id, meal_type: mt, title: title.slice(0, 120), kcal, protein_g: protein });
      if (parsed.water) {
        await c.admin.from("water_log").insert({ user_id: c.uid, date: c.today, ml: parsed.water.ml, vessel: null });
        c.cards.push({ type: "water_logged", ml: parsed.water.ml });
      }
      return `Logged as ${mt}: ${title} = ${kcal} kcal, ${protein} g protein. Today now ${c.days.today.kcal} kcal, ${c.days.today.protein} g protein.`;
    }
    case "log_water": {
      const ml = Math.round(Number(input.ml));
      if (!(ml >= 50 && ml <= 3000)) return "Water amount must be 50–3000 ml.";
      const { error } = await c.admin.from("water_log").insert({ user_id: c.uid, date: c.today, ml, vessel: null });
      if (error) return "Couldn't log water.";
      c.days.waterToday += ml;
      c.cards.push({ type: "water_logged", ml });
      return `Logged ${ml} ml. Water today: ${c.days.waterToday} ml.`;
    }
    case "remaining_today": {
      const r = remainingNow(c);
      c.cards.push({ type: "remaining", kcal: Math.round(r.kcal), protein: Math.round(r.protein), carbs: Math.round(r.carbs), fat: Math.round(r.fat) });
      return `Left today: ${Math.round(r.kcal)} kcal, protein ${Math.round(r.protein)} g, carbs ${Math.round(r.carbs)} g, fat ${Math.round(r.fat)} g.`;
    }
    case "suggest_foods": {
      const presets = await loadPresets(c.admin);
      const mealType: MealType = isMealType(input.meal_type) ? input.meal_type : defaultMealType();
      const picks = suggestFoods({ remaining: remainingNow(c), mode: c.p.diet_mode, mealType, presets, limit: 4 });
      if (!picks.length) return "No suggestions fit right now.";
      const items = picks.map((s) => ({ name: s.label, portion: s.portion, kcal: Math.round(s.kcal), protein: Math.round(s.protein) }));
      c.cards.push({ type: "suggestions", items });
      return `Suggestions: ${items.map((i) => `${i.name} (${i.portion}, ${i.kcal} kcal, ${i.protein} g protein)`).join("; ")}.`;
    }
    case "start_fast": {
      if (c.p.teen) return "Fasting isn't available under 18. Suggest regular meals instead.";
      const hours = clampHours(Number(input.hours) || 16);
      const open = await c.admin.from("fasting_sessions").select("id").eq("user_id", c.uid).is("ended_at", null).limit(1);
      if (open.error) return "Fasting isn't available yet.";
      if (open.data?.length) return "A fast is already running.";
      const { error } = await c.admin.from("fasting_sessions").insert({ user_id: c.uid, started_at: new Date().toISOString(), target_hours: hours });
      if (error) return "Couldn't start the fast.";
      c.cards.push({ type: "fast_started", hours });
      return `Started a ${hours} h fast.`;
    }
    case "add_memory": {
      if (!c.p.remember) return "They turned memory off; don't store it.";
      const m = cleanMemory({ kind: input.kind, text: input.text });
      if (!m) return "Not stored.";
      const id = await proposeMemory(c.admin, c.uid, m, "chat");
      if (id) c.cards.push({ type: "memory", id, kind: m.kind, text: m.text });
      return id ? "Proposed; they'll confirm." : "Already known.";
    }
  }
  return "Unknown tool.";
}

/** Adds a "Learned: … Keep / Forget" proposal unless the same text is already known. */
async function proposeMemory(admin: AdminClient, uid: string, m: { kind: string; text: string }, source: "chat" | "inferred"): Promise<string | null> {
  const { data: existing } = await admin.from("coach_memory").select("id").eq("user_id", uid).is("deleted_at", null).ilike("text", m.text.replace(/[%_]/g, "")).limit(1);
  if (existing?.length) return null;
  const { data, error } = await admin.from("coach_memory").insert({ user_id: uid, kind: m.kind, text: m.text, source, kept: false, confidence: source === "chat" ? 0.9 : 0.7 }).select("id").single();
  return error || !data ? null : (data.id as string);
}

// ---------------------------------------------------------------- chat

const MEMORY_SCHEMA: JsonSchema = {
  type: "object",
  properties: { memories: { type: "array", maxItems: 2, items: { type: "object", properties: { kind: { type: "string", enum: ["goal", "food", "life", "body", "style"] }, text: { type: "string" } }, required: ["kind", "text"] } } },
  required: ["memories"],
};

const MEMORY_SYSTEM = `You extract 0 to 2 lasting facts worth remembering about a fitness-app user from one chat turn: routines (gym time, mess food on weekdays), food likes / dislikes / allergies, constraints (exams till a date), goals. Short, third person, max 8 words each ("Loves paneer", "Gym at 6 pm, 4 days"). NOT: one-off meals, moods, anything about looks, weight shaming or medical details. Skip anything already in KNOWN. Most turns have nothing: return an empty list.`;

async function extractMemories(admin: AdminClient, uid: string, userText: string, reply: string, known: Memory[]): Promise<CoachCard[]> {
  if (userText.trim().length < 12) return [];
  try {
    const res = await run<{ memories?: { kind?: string; text?: string }[] }>(
      "coach_memory",
      { kind: "json", system: MEMORY_SYSTEM, text: `KNOWN:\n${known.map((m) => `- ${m.text}`).join("\n") || "(none)"}\n\nUSER: ${userText.slice(0, 800)}\nCOACH: ${reply.slice(0, 600)}`, maxTokens: 300, schema: MEMORY_SCHEMA, schemaName: "memories" },
      (v): v is { memories?: { kind?: string; text?: string }[] } => !!v && typeof v === "object",
    );
    const out: CoachCard[] = [];
    for (const raw of (res.data.memories ?? []).slice(0, 2)) {
      const m = cleanMemory(raw);
      if (!m) continue;
      const id = await proposeMemory(admin, uid, m, "inferred");
      if (id) out.push({ type: "memory", id, kind: m.kind, text: m.text });
    }
    return out;
  } catch {
    return [];
  }
}

export type ChatResult = { user: CoachMessage; reply: CoachMessage; learned: Memory[]; safety: boolean };

export async function coachChat(admin: AdminClient, uid: string, input: { message: string; image?: string | null; mediaType?: string | null }): Promise<ChatResult> {
  const now = localNow();
  const today = now.date;
  const p = await loadCoachProfile(admin, uid, today);
  const text = input.message.trim().slice(0, 2000);
  const safety = detectSafety(text);

  const userRow = await admin.from("coach_messages").insert({ user_id: uid, role: "user", text: text || (input.image ? "(photo)" : "") }).select("id, role, text, tool, created_at").single();
  if (userRow.error) {
    if (missingV37(userRow.error)) throw new CoachUnavailable();
    throw new Error(userRow.error.message);
  }

  let replyText: string;
  let cards: CoachCard[] = [];
  let learnedCards: CoachCard[] = [];
  if (safety) {
    // The safety switch: calm voice, the helpline card and a flag. No model call.
    replyText = safetyReply(safety);
    cards = [{ type: "helpline" }];
    await admin.from("coach_safety_flags").insert({ user_id: uid, kind: safety });
  } else {
    const [days, memories, history] = await Promise.all([
      loadDays(admin, uid, today),
      p.remember ? loadMemories(admin, uid, 40).then((ms) => ms.filter((m) => m.kept).slice(0, 20)) : Promise.resolve([] as Memory[]),
      admin.from("coach_messages").select("role, text").eq("user_id", uid).neq("id", userRow.data.id).order("created_at", { ascending: false }).limit(12),
    ]);
    if (memories.length) void admin.from("coach_memory").update({ last_used_at: new Date().toISOString() }).in("id", memories.map((m) => m.id)).then(() => undefined);
    const c: Ctx = { admin, uid, p, today, days, cards: [] };
    const system = `${systemPrompt(p.style, { teen: p.teen, name: p.name, kind: "chat" })}\n\n${contextBlock(p, days, memories, now)}`;
    const past = ((history.data ?? []) as { role: string; text: string }[]).reverse();
    const messages: Anthropic.MessageParam[] = [];
    for (const m of past) {
      const role = m.role === "coach" ? "assistant" : "user";
      if (!m.text) continue;
      if (messages.length && messages[messages.length - 1].role === role) {
        const last = messages[messages.length - 1];
        last.content = `${String(last.content)}\n${m.text}`;
      } else messages.push({ role, content: m.text });
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
    const userContent: Anthropic.ContentBlockParam[] = [];
    const mt = input.mediaType === "image/png" || input.mediaType === "image/webp" ? input.mediaType : "image/jpeg";
    if (input.image) userContent.push({ type: "image", source: { type: "base64", media_type: mt, data: input.image.replace(/^data:[^,]+,/, "") } });
    userContent.push({ type: "text", text: text || "What do you make of this?" });
    if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
    messages.push({ role: "user", content: userContent });

    const task = input.image ? ("coach_chat_vision" as const) : ("coach_chat" as const);
    replyText = "";
    try {
      for (let turn = 0; turn < 4; turn++) {
        const res = await run<Anthropic.Message>(task, {
          kind: "anthropic_native",
          build: (client) => client.messages.create({ model: TASKS[task].defaultModel, max_tokens: TASKS[task].maxTokens, system, tools: TOOLS, messages }),
        });
        const msg = res.data;
        const texts = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
        const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (!uses.length || msg.stop_reason !== "tool_use") {
          replyText = texts.join("\n").trim();
          break;
        }
        messages.push({ role: "assistant", content: msg.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const u of uses) {
          const out = await runTool(c, u.name, (u.input ?? {}) as Record<string, unknown>).catch((e) => `Tool failed: ${e instanceof Error ? e.message : "error"}`);
          results.push({ type: "tool_result", tool_use_id: u.id, content: out });
        }
        messages.push({ role: "user", content: results });
      }
    } catch {
      replyText = "";
    }
    cards = c.cards;
    replyText = guardReply(replyText, p.style);
    if (p.remember) learnedCards = await extractMemories(admin, uid, text, replyText, memories);
  }

  const allCards = [...cards, ...learnedCards];
  const tool = allCards.length || safety ? { cards: allCards, ...(safety ? { safety: true as const } : {}) } : null;
  const reply = await admin.from("coach_messages").insert({ user_id: uid, role: "coach", text: replyText, tool }).select("id, role, text, tool, created_at").single();
  if (reply.error) throw new Error(reply.error.message);
  const learned: Memory[] = allCards
    .filter((c): c is Extract<CoachCard, { type: "memory" }> => c.type === "memory")
    .map((c) => ({ id: c.id, kind: c.kind, text: c.text, source: "chat", pinned: false, kept: false, created_at: new Date().toISOString() }));
  return { user: userRow.data as CoachMessage, reply: reply.data as CoachMessage, learned, safety: !!safety };
}

export async function chatHistory(admin: AdminClient, uid: string, limit = 60): Promise<CoachMessage[]> {
  const { data, error } = await admin.from("coach_messages").select("id, role, text, tool, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(200, limit)));
  if (error) {
    if (missingV37(error)) throw new CoachUnavailable();
    throw new Error(error.message);
  }
  return ((data ?? []) as CoachMessage[]).reverse();
}

// ---------------------------------------------------------------- daily note

export type CoachNote = { date: string; text: string; style: CoachStyle; kind: "morning" | "evening" | "roast"; created_at: string };

function streakFrom(days: DayTotals[]): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].meals > 0) n++;
    else if (i === days.length - 1) continue;
    else break;
  }
  return n;
}

async function writeNote(admin: AdminClient, uid: string, p: CoachProfile, kind: CoachNote["kind"], now: LocalNow): Promise<CoachNote | null> {
  const days = await loadDays(admin, uid, now.date);
  const memories = p.remember ? (await loadMemories(admin, uid, 20).catch(() => [] as Memory[])).filter((m) => m.kept) : [];
  const y = days.days[days.days.length - 2];
  const weekStart = addDays(now.date, -((now.weekday + 6) % 7));
  const facts = {
    name: p.name,
    proteinYesterday: y.meals ? y.protein : null,
    proteinTarget: p.protein_target_g,
    loggedYesterday: y.meals > 0,
    workoutsThisWeek: days.workouts.filter((w) => w >= weekStart).length,
    workoutTarget: p.weekly_workout_target,
    dayStreak: streakFrom(days.days),
    obstacles: p.obstacles,
  };
  let text = "";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await run<string>("coach_note", { kind: "text", system: systemPrompt(p.style, { teen: p.teen, name: p.name, kind: kind === "morning" ? "note" : kind }), text: contextBlock(p, days, memories, now), maxTokens: 250 });
      text = String(res.data ?? "").trim();
    } catch {
      text = "";
    }
  }
  text = text ? guardReply(text, p.style) : kind === "evening" ? fallbackEvening(p.style) : fallbackNote(p.style, facts);
  const row = { user_id: uid, date: now.date, kind, text: text.slice(0, 1000), style: p.style };
  const { data, error } = await admin.from("coach_notes").upsert(row, { onConflict: "user_id,date,kind", ignoreDuplicates: true }).select("date, text, style, kind, created_at").maybeSingle();
  if (error) return null;
  if (data) return data as CoachNote;
  const again = await admin.from("coach_notes").select("date, text, style, kind, created_at").eq("user_id", uid).eq("date", now.date).eq("kind", kind).maybeSingle();
  return (again.data as CoachNote | null) ?? null;
}

/** Today's morning note (created on first read once the note time has passed) plus Sunday's roast. */
export async function todaysNote(admin: AdminClient, uid: string, when = new Date()): Promise<{ note: CoachNote | null; roast: CoachNote | null; evening: CoachNote | null; style: CoachStyle; noteTime: string }> {
  const now = localNow(when);
  const p = await loadCoachProfile(admin, uid, now.date);
  const { data, error } = await admin.from("coach_notes").select("date, text, style, kind, created_at").eq("user_id", uid).eq("date", now.date);
  if (error) {
    if (missingV37(error)) throw new CoachUnavailable();
    throw new Error(error.message);
  }
  const have = (data ?? []) as CoachNote[];
  let note = have.find((n) => n.kind === "morning") ?? null;
  let roast = have.find((n) => n.kind === "roast") ?? null;
  const evening = have.find((n) => n.kind === "evening") ?? null;
  // Reading the app counts as "not quiet", so only the note time gates the lazy morning note.
  if (!note && now.minutes >= p.noteMin) note = await writeNote(admin, uid, p, "morning", now);
  if (!roast && p.roast && p.style === "no_excuses" && now.weekday === 7 && now.minutes >= p.noteMin) roast = await writeNote(admin, uid, p, "roast", now);
  const hh = String(Math.floor(p.noteMin / 60)).padStart(2, "0");
  return { note, roast, evening, style: p.style, noteTime: `${hh}:${String(p.noteMin % 60).padStart(2, "0")}` };
}

/**
 * Cron step: morning notes for everyone whose note time just passed (a 3 h window, so a late tick
 * still catches them), the Sunday roast, and the 8 pm nudge when nothing's logged. Each creates a
 * 'coach' notification that the tick then pushes. Also prunes old chat / expired proposals.
 * One profiles query decides who's due; only those get the full context load.
 */
export async function coachStep(db: AdminClient, now: LocalNow, skipped: string[]): Promise<number> {
  const { data, error } = await db.from("profiles").select("id, dob, coach_style, coach_note_time, coach_quiet_from, coach_quiet_to, coach_weekly_roast").limit(20000);
  if (error) {
    skipped.push(missingV37(error) ? "coach: v37 not applied" : `coach: ${error.message}`);
    return 0;
  }
  await db.rpc("coach_prune").then(
    () => undefined,
    () => undefined,
  );
  type Row = { id: string; dob: string | null; coach_style: string | null; coach_note_time: string | null; coach_quiet_from: string | null; coach_quiet_to: string | null; coach_weekly_roast: boolean | null };
  const rows = (data ?? []) as Row[];
  const evening = now.minutes >= 20 * 60 && now.minutes < 23 * 60;
  const candidates: { id: string; kinds: CoachNote["kind"][] }[] = [];
  for (const r of rows) {
    const noteMin = hhmmToMin(r.coach_note_time, 8 * 60);
    const quiet = { from: hhmmToMin(r.coach_quiet_from, 23 * 60), to: hhmmToMin(r.coach_quiet_to, 7 * 60) };
    const kinds: CoachNote["kind"][] = [];
    const morning = noteDue(now.minutes, noteMin, quiet) && now.minutes < noteMin + 180;
    if (morning) kinds.push("morning");
    if (morning && now.weekday === 7 && r.coach_weekly_roast && r.coach_style === "no_excuses") kinds.push("roast");
    if (evening && !inQuietHours(now.minutes, quiet.from, quiet.to)) kinds.push("evening");
    if (kinds.length) candidates.push({ id: r.id, kinds });
  }
  if (!candidates.length) return 0;
  const has = new Set<string>();
  const logged = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const ids = candidates.slice(i, i + 200).map((c) => c.id);
    const [notes, meals] = await Promise.all([
      db.from("coach_notes").select("user_id, kind").eq("date", now.date).in("user_id", ids),
      evening ? db.from("meals").select("user_id").eq("date", now.date).in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string }[] }),
    ]);
    for (const r of (notes.data ?? []) as { user_id: string; kind: string }[]) has.add(`${r.user_id}:${r.kind}`);
    for (const r of (meals.data ?? []) as { user_id: string }[]) logged.add(r.user_id);
  }
  let made = 0;
  for (const c of candidates) {
    const jobs = c.kinds.filter((k) => !has.has(`${c.id}:${k}`) && (k !== "evening" || !logged.has(c.id)));
    if (!jobs.length) continue;
    if (made >= 150) break; // keep one tick bounded; the next tick picks up the rest
    let p: CoachProfile;
    try {
      p = await loadCoachProfile(db, c.id, now.date);
    } catch {
      continue;
    }
    for (const kind of jobs) {
      if (kind === "roast" && !p.roast) continue;
      if (kind === "evening" && !eveningDue(now.minutes, logged.has(c.id), p.quiet)) continue;
      const note = await writeNote(db, c.id, p, kind, now);
      if (!note) continue;
      made++;
      const title = kind === "roast" ? "Your weekly roast is in" : kind === "evening" ? "Your coach" : "Today's note from your coach";
      await db.from("notifications").insert({ user_id: c.id, kind: "coach", title, body: note.text.slice(0, 180), url: "/coach" });
    }
  }
  return made;
}
