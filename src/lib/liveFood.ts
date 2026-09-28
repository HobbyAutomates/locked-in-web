import { createClient } from "@supabase/supabase-js";
import { sanityCheck, slugify, type RawNutrition } from "@/lib/nutritionSanity";
import { webLookup } from "@/lib/webFood";
import type { FoodHit } from "@/lib/foodSearch";

/**
 * v2.15: the default path is now the WEB lookup (webFood.ts, router task `food_web_lookup`: Sonnet +
 * web_search, ~25 s budget). The sanity check (nutritionSanity.ts) and the bandlog.foods cache stay.
 * The older Haiku-only `food_lookup` task is no longer called; the openai-compatible switch below is
 * kept only for deployments that set LIVE_FOOD_PROVIDER=openai-compatible.
 *
 * v2.7: live AI nutrition lookup — the fallback when bandlog.foods has no acceptable match for a
 * named food (see foodSearch.ts's isAcceptableMatch and scanFlows.ts's plateFlow). Returns
 * realistic per-100 g macros (Indian foods in mind), sanity-checks them, and caches a good result
 * in bandlog.foods with source "ai" (see supabase/schema_v27.sql) so the next search finds it for
 * free without calling out again.
 *
 * The default path is the model router's `food_lookup` task (src/lib/ai/router.ts + tasks.ts:
 * Claude Haiku by default, `AI_ROUTE_FOOD_LOOKUP="provider:model"` to move it). The older direct
 * OpenAI-compatible switch is kept for existing deployments:
 *   LIVE_FOOD_PROVIDER    "anthropic" (default → router) | "openai-compatible"
 *   LIVE_FOOD_MODEL       openai-compatible only: the host's model id (e.g. "deepseek/deepseek-chat")
 *   LIVE_FOOD_BASE_URL    OpenAI-compatible base URL (e.g. an OpenRouter endpoint) — openai-compatible only
 *   LIVE_FOOD_API_KEY     API key for that host — openai-compatible only
 */

const TIMEOUT_MS = 25_000;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";


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
  if (provider === "openai-compatible") {
    const raw = await withTimeout(fromOpenAiCompatible(food).catch(() => null), 4000);
    const good = sanityCheck(raw);
    return good ? cache(food, good) : null;
  }
  // v2.15: the web lookup sanity-checks and caches (source 'web') on its own.
  const web = await webLookup(food, { timeoutMs: TIMEOUT_MS });
  if (!web) return null;
  return { id: `web-${slugify(food)}`, name: food, aliases: [], calories: web.calories, protein_g: web.protein_g, carbs_g: web.carbs_g, fat_g: web.fat_g, fiber_g: web.fiber_g ?? null, sugar_g: web.sugar_g ?? null, sodium_mg: web.sodium_mg ?? null, micros: {}, source: "web", region: null, names_local: {}, units: [], unit_name: null, unit_grams: null, score: 1 };
}
