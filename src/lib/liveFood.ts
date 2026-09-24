import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { FoodHit } from "@/lib/foodSearch";

/**
 * v2.7: live AI nutrition lookup — the fallback when bandlog.foods has no acceptable match for a
 * named food (see foodSearch.ts's isAcceptableMatch and scanFlows.ts's plateFlow). Returns
 * realistic per-100 g macros (Indian foods in mind), sanity-checks them, and caches a good result
 * in bandlog.foods with source "ai" (see supabase/schema_v27.sql) so the next search finds it for
 * free without calling out again.
 *
 * Provider is pluggable via env:
 *   LIVE_FOOD_PROVIDER    "anthropic" (default) | "openai-compatible"
 *   LIVE_FOOD_MODEL       default "claude-haiku-4-5-20251001"; for openai-compatible hosts this is
 *                         the host's model id (e.g. "deepseek/deepseek-chat", "qwen/qwen-2.5-72b-instruct")
 *   LIVE_FOOD_BASE_URL    OpenAI-compatible base URL (e.g. an OpenRouter endpoint) — openai-compatible only
 *   LIVE_FOOD_API_KEY     API key for that host — openai-compatible only
 */

const TIMEOUT_MS = 4000;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

type RawNutrition = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "bandlog" },
    auth: { persistSession: false },
  });
}

const SYSTEM = `You are a food nutrition database. Given a food name (often Indian home cooking, sometimes Hinglish or a
restaurant dish), give realistic average nutrition PER 100 GRAMS of the food as normally prepared/eaten. Use your
best knowledge of Indian recipes and ingredient ratios (oil/ghee, etc.) when the food is a home-cooked Indian dish.
If the name is a bare raw ingredient (e.g. "cucumber", "apple"), give the raw ingredient's own nutrition — never a
dish made from it. Be realistic: whole fruits and vegetables are low calorie, fried and sweet foods are high.`;

function userPrompt(name: string): string {
  return `Food: ${name}\n\nGive per-100g nutrition: calories (kcal), protein_g, carbs_g, fat_g, and if you can estimate them, fiber_g, sugar_g, sodium_mg.`;
}

const LOOKUP_TOOL = {
  name: "nutrition",
  description: "Report per-100g nutrition for the named food.",
  input_schema: {
    type: "object" as const,
    properties: {
      calories: { type: "number", description: "kcal per 100g" },
      protein_g: { type: "number" },
      carbs_g: { type: "number" },
      fat_g: { type: "number" },
      fiber_g: { type: "number" },
      sugar_g: { type: "number" },
      sodium_mg: { type: "number" },
    },
    required: ["calories", "protein_g", "carbs_g", "fat_g"],
  },
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function fromAnthropic(name: string): Promise<RawNutrition | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.LIVE_FOOD_MODEL || DEFAULT_MODEL;
  const msg = await client.messages.create({
    model,
    max_tokens: 300,
    system: SYSTEM,
    tools: [LOOKUP_TOOL],
    tool_choice: { type: "tool", name: "nutrition" },
    messages: [{ role: "user", content: userPrompt(name) }],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;
  return block.input as RawNutrition;
}

async function fromOpenAiCompatible(name: string): Promise<RawNutrition | null> {
  const base = process.env.LIVE_FOOD_BASE_URL;
  const key = process.env.LIVE_FOOD_API_KEY;
  if (!base || !key) return null;
  const model = process.env.LIVE_FOOD_MODEL || DEFAULT_MODEL;
  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${userPrompt(name)}\n\nRespond with ONLY a JSON object with keys calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg — numbers only, no prose, no markdown fences.`,
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as RawNutrition;
  } catch {
    return null;
  }
}

/**
 * Sanity-check a model's nutrition guess. Rejects it if calories are implausibly high, any macro
 * is negative, the macros sum past 100g, or the stated calories don't roughly match the Atwater
 * calculation (4p + 4c + 9f), within ~25% + 15 kcal.
 */
function sanityCheck(raw: RawNutrition | null): RawNutrition | null {
  if (!raw) return null;
  const calories = Number(raw.calories);
  const protein_g = Number(raw.protein_g);
  const carbs_g = Number(raw.carbs_g);
  const fat_g = Number(raw.fat_g);
  if (![calories, protein_g, carbs_g, fat_g].every(Number.isFinite)) return null;
  if (calories < 0 || calories > 905) return null; // pure fats are 884-902
  if (protein_g < 0 || carbs_g < 0 || fat_g < 0) return null;
  if (protein_g + carbs_g + fat_g > 100) return null;
  const atwater = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  if (Math.abs(atwater - calories) > calories * 0.25 + 15) return null;

  const num = (v: unknown) => (v == null ? null : Number(v));
  const fiber_g = num(raw.fiber_g);
  const sugar_g = num(raw.sugar_g);
  const sodium_mg = num(raw.sodium_mg);
  if (fiber_g != null && (!Number.isFinite(fiber_g) || fiber_g < 0 || fiber_g > 100)) return null;
  if (sugar_g != null && (!Number.isFinite(sugar_g) || sugar_g < 0 || sugar_g > carbs_g + 5)) return null;
  if (sodium_mg != null && (!Number.isFinite(sodium_mg) || sodium_mg < 0 || sodium_mg > 20000)) return null;

  return { calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "food"
  );
}

/**
 * Cache a good lookup in bandlog.foods under a deterministic id derived from the normalized name
 * (dedupe: the same normalized name always maps to the same row, so a repeat lookup upserts
 * instead of creating a duplicate). source="ai" ranks below every curated source in search_foods
 * (see supabase/schema_v27.sql / schema_v25.sql's score CASE, whose else-branch bonus is 0).
 */
async function cache(name: string, n: RawNutrition): Promise<FoodHit> {
  const id = `ai-${slugify(name)}`;
  const row = {
    id,
    name: name.trim(),
    aliases: [] as string[],
    calories: n.calories,
    protein_g: n.protein_g,
    carbs_g: n.carbs_g,
    fat_g: n.fat_g,
    fiber_g: n.fiber_g ?? null,
    sugar_g: n.sugar_g ?? null,
    sodium_mg: n.sodium_mg ?? null,
    micros: {} as Record<string, number>,
    source: "ai" as const,
    region: null as string | null,
    names_local: {} as Record<string, string>,
    units: [] as { name: string; grams: number }[],
    unit_name: null as string | null,
    unit_grams: null as number | null,
  };
  try {
    await admin().from("foods").upsert(row, { onConflict: "id" });
  } catch {
    // Caching is best-effort — a failed write never blocks handing the estimate back to the caller.
  }
  return { ...row, score: 1 };
}

/**
 * Live nutrition lookup for a named food, used when the food table has no acceptable match.
 * Runs the configured provider with a ~4s timeout, sanity-checks the result, and caches a good
 * one. Returns null (never throws) on timeout, provider error, or a failed sanity check — callers
 * should fall back to the model's own plate estimate in that case.
 */
export async function liveLookup(name: string): Promise<FoodHit | null> {
  const food = name.trim();
  if (!food) return null;
  const provider = (process.env.LIVE_FOOD_PROVIDER || "anthropic").trim();
  const call = provider === "openai-compatible" ? fromOpenAiCompatible(food) : fromAnthropic(food);
  const raw = await withTimeout(call.catch(() => null), TIMEOUT_MS);
  const good = sanityCheck(raw);
  if (!good) return null;
  return cache(food, good);
}
