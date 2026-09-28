import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { run } from "@/lib/ai/router";
import { DEFAULT_VISION_MODEL } from "@/lib/ai/tasks";
import { sanityCheck, slugify, type RawNutrition } from "@/lib/nutritionSanity";
import type { SourceLink } from "@/lib/sourceInfo";
import { toUsageEntry, type UsageEntry } from "@/lib/usage";

/**
 * v2.15 "internet first" nutrition lookup — router task `food_web_lookup` (tasks.ts): Claude Sonnet
 * with Anthropic's `web_search` server tool, the same way `label_analysis` uses it. It searches for
 * the food (brand when there is one, the Indian name), reads real sources (IFCT / INDB, USDA, the
 * brand's own page, reputable trackers) and reports per-100 g numbers with up to 3 source links.
 *
 * Used by:
 *   - photos (scanFlows.plateFromEstimate → plateMatch.webCheckPlateItem) — NEVER reads bandlog.foods;
 *   - typed logging (parseMeal) when bandlog.foods has no acceptable match, and liveFood.liveLookup.
 * A good result is cached in bandlog.foods with source 'web' (schema_v38 widens the check), so
 * typed logging finds it next time for free. Photos still never read that cache.
 *
 * Never throws: a timeout, a model error, no report, or a failed sanity check all return null, and
 * the caller keeps its own estimate (labelled "AI estimate").
 */

export const WEB_LOOKUP_TIMEOUT_MS = 25_000;

export type WebNutrition = RawNutrition & {
  /** The food the sources actually describe ("Roti / chapati, whole wheat"). */
  matched_name: string;
  /** "as eaten, cooked" / "dry product" … one short phrase, shown in the ⓘ sheet. */
  basis: string;
  sources: SourceLink[];
  confidence: "high" | "medium" | "low";
  usage?: UsageEntry[];
};

const SYSTEM = `You look up nutrition facts on the web for a food-logging app used mostly in India (Bengaluru), and report them per 100 grams.

Search first, then answer from what you read — never from memory alone. Good sources, best first: the brand's own product page or pack photo (for a packaged or branded product), IFCT 2017 / INDB (Indian Nutrient Databank) for Indian foods and dishes, USDA FoodData Central, then reputable trackers (HealthifyMe, Nutritionix, FatSecret India, MyFitnessPal verified entries). Prefer numbers that two sources agree on. For a home-cooked Indian dish, use the cooked dish as normally made at home (with its usual oil/ghee), not the raw ingredients. For a bare ingredient ("cucumber", "apple", "milk") give the ingredient itself, never a dish made from it. For a branded product, use that exact product and variant; say "dry product" in basis when the numbers are for the dry pack (muesli, oats, powder).

Convert per-serving numbers to per 100 g yourself (check the serving weight). Calories must roughly equal 4×protein + 4×carbs + 9×fat. Keep the search short: one or two searches is usually enough.

When you're done, call report_nutrition exactly once. List only URLs you actually read in search results (max 3). confidence: high when a brand page or two agreeing reference sources back the numbers, medium for one decent source, low when you had to guess.`;

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_nutrition",
  description: "Report per-100 g nutrition for the food, with the sources it came from.",
  input_schema: {
    type: "object",
    properties: {
      matched_name: { type: "string", description: "The exact food / product the numbers are for" },
      basis: { type: "string", description: "Short phrase: 'cooked, as eaten', 'dry product', 'as sold'" },
      calories: { type: "number", description: "kcal per 100 g" },
      protein_g: { type: "number" },
      carbs_g: { type: "number" },
      fat_g: { type: "number" },
      fiber_g: { type: "number" },
      sugar_g: { type: "number" },
      sodium_mg: { type: "number" },
      sources: {
        type: "array",
        description: "Up to 3 pages you read that back these numbers",
        items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["url"] },
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["matched_name", "calories", "protein_g", "carbs_g", "fat_g", "sources", "confidence"],
  },
};

type Report = Partial<RawNutrition> & { matched_name?: string; basis?: string; sources?: { title?: string; url?: string }[]; confidence?: string };

/** Every page the web search returned, in order (title + url). */
function searchedPages(content: unknown[]): SourceLink[] {
  const out: SourceLink[] = [];
  for (const b of content as Record<string, unknown>[]) {
    if (b?.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content as Record<string, unknown>[]) {
      const url = typeof r?.url === "string" ? r.url : "";
      if (/^https?:\/\//.test(url) && !out.some((o) => o.url === url)) out.push({ label: String(r.title ?? url).slice(0, 80), url });
    }
  }
  return out;
}

/** The report's own source list, kept to real http(s) links (the model's picks first, then what it searched). */
export function pickSources(reported: Report["sources"], searched: SourceLink[]): SourceLink[] {
  const out: SourceLink[] = [];
  for (const s of reported ?? []) {
    const url = String(s?.url ?? "").trim();
    if (!/^https?:\/\//.test(url) || out.some((o) => o.url === url)) continue;
    const known = searched.find((p) => p.url === url);
    out.push({ label: String(s?.title || known?.label || hostOf(url)).slice(0, 80), url });
    if (out.length >= 3) return out;
  }
  for (const p of searched) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.url === p.url)) out.push(p);
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
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

const EXTRA: Record<string, unknown> = process.env.WEB_LOOKUP_THINKING === "on" ? {} : { thinking: { type: "disabled" } };

/** One Sonnet + web_search call (with one continuation when the server pauses a long search turn). */
async function callModel(name: string, context: string | undefined, timeoutMs: number): Promise<{ report: Report | null; searched: SourceLink[]; usage: UsageEntry[] }> {
  const webSearch = {
    type: process.env.WEB_LOOKUP_TOOL || "web_search_20250305",
    name: "web_search",
    max_uses: 2,
    user_location: { type: "approximate", country: "IN", city: "Bengaluru", timezone: "Asia/Kolkata" },
  } as unknown as Anthropic.Tool;
  const user = `Food: ${name.slice(0, 160)}${context ? `\nContext: ${context.slice(0, 300)}` : ""}\n\nFind its nutrition per 100 g on the web, then call report_nutrition.`;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  const usage: UsageEntry[] = [];
  const searched: SourceLink[] = [];
  for (let turn = 0; turn < 2; turn++) {
    const call = await run<Anthropic.Message>("food_web_lookup", {
      kind: "anthropic_native",
      build: (client) =>
        client.messages.create(
          { model: DEFAULT_VISION_MODEL, max_tokens: 4000, system: SYSTEM, tools: [webSearch, REPORT_TOOL], messages, ...EXTRA } as Anthropic.MessageCreateParamsNonStreaming,
          { timeout: timeoutMs, maxRetries: 0 },
        ),
    });
    usage.push(toUsageEntry("food_web_lookup", call.model, call.usage));
    const msg = call.data;
    searched.push(...searchedPages(msg.content as unknown[]).filter((p) => !searched.some((s) => s.url === p.url)));
    const block = msg.content.find((b) => b.type === "tool_use" && b.name === REPORT_TOOL.name);
    if (block && block.type === "tool_use") return { report: block.input as Report, searched, usage };
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content as unknown as Anthropic.ContentBlockParam[] });
  }
  return { report: null, searched, usage };
}

/** Turn the model's report into checked numbers + sources, or null. Pure — used by the checks too. */
export function webResultFrom(report: Report | null, searched: SourceLink[]): Omit<WebNutrition, "usage"> | null {
  if (!report) return null;
  const good = sanityCheck(report as RawNutrition);
  if (!good) return null;
  const confidence = report.confidence === "high" || report.confidence === "low" ? report.confidence : "medium";
  const sources = pickSources(report.sources, searched);
  return {
    ...good,
    matched_name: String(report.matched_name ?? "").slice(0, 120),
    basis: String(report.basis ?? "").slice(0, 60),
    sources,
    // No link to show for it → never "high".
    confidence: !sources.length && confidence === "high" ? "medium" : confidence,
  };
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: "bandlog" }, auth: { persistSession: false } });
}

/** Best-effort cache in bandlog.foods (source 'web', id `web-<slug>`). Silently skipped until schema_v38. */
export async function cacheWebFood(name: string, n: WebNutrition): Promise<void> {
  if (n.confidence === "low" || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const row = {
    id: `web-${slugify(name)}`,
    name: name.trim().slice(0, 120),
    aliases: n.matched_name && n.matched_name.toLowerCase() !== name.trim().toLowerCase() ? [n.matched_name] : [],
    calories: n.calories,
    protein_g: n.protein_g,
    carbs_g: n.carbs_g,
    fat_g: n.fat_g,
    fiber_g: n.fiber_g ?? null,
    sugar_g: n.sugar_g ?? null,
    sodium_mg: n.sodium_mg ?? null,
    micros: {},
    source: "web",
    source_ref: n.sources[0]?.url ?? null,
    region: null,
    names_local: {},
    units: [],
    unit_name: null,
    unit_grams: null,
  };
  try {
    const { error } = await admin().from("foods").upsert(row, { onConflict: "id" });
    // source_ref arrived with schema_v32; retry without it on an older database.
    if (error && /source_ref/.test(error.message ?? "")) {
      const { source_ref: _drop, ...rest } = row;
      void _drop;
      await admin().from("foods").upsert(rest, { onConflict: "id" });
    }
  } catch {
    // caching never blocks the answer
  }
}

/**
 * Look a food up on the web. `context` is extra wording for the search ("visible on a home plate
 * photo; brand on pack: Pintola"). Returns null (never throws) on timeout / error / bad numbers.
 */
export async function webLookup(name: string, opts: { context?: string; timeoutMs?: number; cache?: boolean } = {}): Promise<WebNutrition | null> {
  const food = name.trim();
  if (!food || !process.env.ANTHROPIC_API_KEY) return null;
  const timeoutMs = opts.timeoutMs ?? WEB_LOOKUP_TIMEOUT_MS;
  const out = await withTimeout(callModel(food, opts.context, timeoutMs), timeoutMs + 500);
  if (!out) {
    logLookup(food, "timeout");
    return null;
  }
  const res = webResultFrom(out.report, out.searched);
  logLookup(food, res ? "ok" : out.report ? "insane" : "no_report", res?.calories);
  if (!res) return null;
  const full: WebNutrition = { ...res, usage: out.usage };
  if (opts.cache !== false) void cacheWebFood(food, full);
  return full;
}

function logLookup(name: string, outcome: string, kcal?: number) {
  try {
    console.log(JSON.stringify({ evt: "food_web_lookup", name: name.slice(0, 60), outcome, ...(kcal != null ? { kcal } : {}) }));
  } catch {
    // never block on logging
  }
}
