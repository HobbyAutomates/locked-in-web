import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { AdminClient } from "@/lib/apiAuth";
import { run } from "@/lib/ai/router";
import type { JsonSchema } from "@/lib/ai/types";
import { toUsageEntry, type UsageEntry } from "@/lib/usage";
import { derivePer100FromServing, roundPer100, sanityCheckPer100, type Per100 } from "@/lib/labelParse";

/**
 * The analysis + structuring steps shared by /api/scan-label (OCR transcript or photo) and
 * /api/scan-barcode (Open Food Facts product). Both end in the same `label_report` tool call, so
 * the app renders one report shape whatever the input was.
 *
 * Tone: the report says what a product IS and how it fits four ways of eating (protein, snack,
 * cutting, bulking). `verdict` is reserved for safety / authenticity ("Trust" in the UI).
 */

export type Lens = "protein" | "snack" | "cutting" | "bulking";
export const LENSES: Lens[] = ["protein", "snack", "cutting", "bulking"];

/**
 * The lens a scan is written for: the request wins, then Profile → "Judge scans for"
 * (`lens_default`; `goal` follows the weight goal: lose → cutting, gain → bulking, else protein).
 */
export function lensFor(goalType: string | null | undefined, requested?: string | null, lensDefault?: string | null): Lens {
  if (requested && (LENSES as string[]).includes(requested)) return requested as Lens;
  if (lensDefault && lensDefault !== "goal" && (LENSES as string[]).includes(lensDefault)) return lensDefault as Lens;
  if (goalType === "lose") return "cutting";
  if (goalType === "gain") return "bulking";
  return "protein";
}

export type ScanProfile = {
  protein_target_g: number;
  calorie_target: number;
  weekly_workout_target: number;
  carb_target_g: number | null;
  fat_target_g: number | null;
  goal_type: string | null;
  lens_default?: string | null;
};

export async function loadScanProfile(admin: AdminClient, userId: string): Promise<ScanProfile> {
  const { data } = await admin
    .from("profiles")
    .select("protein_target_g, calorie_target, weekly_workout_target, carb_target_g, fat_target_g, goal_type, lens_default")
    .eq("id", userId)
    .maybeSingle();
  return (
    (data as ScanProfile | null) ?? { protein_target_g: 120, calorie_target: 2200, weekly_workout_target: 3, carb_target_g: null, fat_target_g: null, goal_type: "maintain", lens_default: "protein" }
  );
}

/** Same fallback the app uses when the macro goals were never set explicitly. */
export function targetsLine(p: ScanProfile) {
  const fat = p.fat_target_g ?? Math.round((p.calorie_target * 0.25) / 9);
  const carbs = p.carb_target_g ?? Math.max(0, Math.round((p.calorie_target - p.protein_target_g * 4 - fat * 9) / 4));
  return `DAILY TARGETS for this user: ${p.calorie_target} kcal, ${p.protein_target_g} g protein, ${carbs} g carbs, ${fat} g fat. Goal: ${p.goal_type ?? "maintain"} weight.`;
}

const FIT = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["great", "ok", "weak"] },
    why: { type: "string", description: "One plain sentence with the number that decides it" },
  },
  required: ["verdict", "why"],
} as const;

export const REPORT_TOOL: Anthropic.Tool = {
  name: "label_report",
  description: "Return the structured assessment of the packaged food.",
  input_schema: {
    type: "object",
    properties: {
      product: { type: "string", description: "Product and brand as printed, or best guess" },
      readable: { type: "boolean", description: "false if the input is not a food label / product" },
      what_it_is: {
        type: "string",
        description: "Two neutral sentences: what the product is and what it is mostly made of; who it suits. No judgement words.",
      },
      verdict: { type: "string", enum: ["safe", "caution", "unsafe", "misleading", "fake"], description: "Safety / authenticity ONLY (shown as Trust)" },
      verdict_reason: { type: "string", description: "One or two sentences that justify the trust verdict" },
      fits: {
        type: "object",
        description: "How the product fits four ways of eating. Describe, never scold.",
        properties: { protein: FIT, snack: FIT, cutting: FIT, bulking: FIT },
        required: ["protein", "snack", "cutting", "bulking"],
      },
      per_100g: {
        type: "object",
        properties: {
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          sugar_g: { type: "number" },
          fat_g: { type: "number" },
          fiber_g: { type: "number" },
          sodium_mg: { type: "number" },
        },
      },
      serving_g: { type: "number" },
      protein: {
        type: "object",
        properties: {
          rating: { type: "string", enum: ["excellent", "good", "average", "poor"] },
          per_serving_g: { type: "number" },
          quality: { type: "string" },
          note: { type: "string" },
        },
        required: ["rating", "quality", "note"],
      },
      concerns: {
        type: "array",
        items: {
          type: "object",
          properties: { ingredient: { type: "string" }, issue: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] } },
          required: ["ingredient", "issue", "severity"],
        },
      },
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: { claim: { type: "string" }, status: { type: "string", enum: ["supported", "misleading", "false", "unclear"] }, why: { type: "string" } },
          required: ["claim", "status", "why"],
        },
      },
      research: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
      alternatives: { type: "array", items: { type: "string" } },
      infographic: {
        type: "object",
        description: "Everything the phone needs to draw the report as a picture. Fill every field.",
        properties: {
          serving_share: {
            type: "object",
            description: "ONE serving as a percentage of this user's daily targets, integers 0-100 (clamp above 100 to 100).",
            properties: { protein_pct: { type: "integer" }, carbs_pct: { type: "integer" }, fat_pct: { type: "integer" }, calories_pct: { type: "integer" } },
            required: ["protein_pct", "carbs_pct", "fat_pct", "calories_pct"],
          },
          sugar_teaspoons_per_serving: { type: "number", description: "sugar grams per serving divided by 4" },
          sodium_pct_of_2000mg: { type: "integer", description: "sodium mg per serving as a percentage of 2000 mg" },
          score_out_of_10: { type: "integer", description: "overall score for THIS user's chosen lens, 0-10" },
          one_liner: { type: "string", description: "12 words or fewer, plain English, descriptive, e.g. 'Mostly refined flour and palm oil; 7 g protein'" },
          eat_it: { type: "string", enum: ["yes", "sometimes", "skip"], description: "for the user's chosen lens" },
        },
        required: ["serving_share", "sugar_teaspoons_per_serving", "sodium_pct_of_2000mg", "score_out_of_10", "one_liner", "eat_it"],
      },
    },
    required: ["product", "readable", "what_it_is", "verdict", "verdict_reason", "fits", "protein", "concerns", "claims", "suggestions", "alternatives", "infographic"],
  },
};

export const TRANSCRIBE = `You are an OCR engine for packaged-food labels. Transcribe EVERYTHING legible on the label, verbatim, preserving numbers and units exactly: product name, brand, ingredients list with percentages, allergen line, serving size, the full nutrition table (per 100 g and per serving if both), claims printed on the pack, FSSAI licence number, batch, MRP, manufacturer. Use headings for each section. If part of the label is cut off, blurred or glared, say [unreadable] at that spot instead of guessing. If this is not a food label, say NOT_A_LABEL and describe what it is in one line.`;

const LENS_WORDS: Record<Lens, string> = {
  protein: "hitting a daily protein target (grams per serving, grams per 100 kcal, source quality)",
  snack: "an everyday snack (calories per serving, satiety, sugar and salt, whether one pack is a sensible portion)",
  cutting: "eating in a calorie deficit (calories per 100 g, protein per 100 kcal, volume and fullness)",
  bulking: "eating in a calorie surplus (calorie density, protein, whether it is easy to eat more of, digestion)",
};

export function analyseSystem(profile: ScanProfile, lens: Lens) {
  return `You are a food analyst for one user: a 17-year-old male student in Bengaluru, India, who trains with resistance bands ${profile.weekly_workout_target}x/week and targets ${profile.protein_target_g} g protein and ${profile.calorie_target} kcal per day. He mostly eats home-cooked Indian food (rice, dal, roti, eggs, whey). His current lens is "${lens}": ${LENS_WORDS[lens]}.

TONE — this matters more than anything else. Describe, don't judge. Say what the product IS and what it does, with numbers. Never write "not good for you", "junk", "avoid", "unhealthy" or similar. The pattern is:
  "For protein it's weak (3 g per serving). As a snack it's fine at 170 kcal. If you're cutting, it's easy to overshoot with. Post-workout, pair it with 2 eggs."
Judgement is only allowed under TRUST (safety and honesty), where the facts warrant it.

Cover, in this order:
1. WHAT IT IS — two neutral sentences: what kind of product, what it's mostly made of (first three ingredients), who it suits.
2. TRUST — safe / caution / unsafe / misleading / fake, and why. "misleading" = claims the label doesn't support (high-protein with low protein per 100 kcal, sugar-free with maltodextrin, amino spiking, serving-size tricks). "fake" = counterfeit signs (misspelled brand, missing/invalid FSSAI number, known counterfeit reports). "unsafe" = banned/hazardous ingredients, undeclared allergens, doses beyond safe limits, or a recall. Otherwise "safe".
3. FITS — one short paragraph for EACH of the four lenses (protein, snack, cutting, bulking): great / ok / weak, and the single number that decides it. Be concrete: "ok — 170 kcal and 5 g sugar per pack".
4. Per-100 g numbers as printed. Serving size.
5. Protein: per serving, per 100 kcal, source quality (complete vs incomplete, isolate vs concentrate vs plant blend, collagen), rating excellent/good/average/poor for a ${profile.protein_target_g} g/day target.
6. Ingredients worth knowing about, with severity low/medium/high — factual ("palm oil: saturated fat, 6.8 g/100 g"), not moralising.
7. Each marketing claim on the pack: supported / misleading / false / unclear.
8. Web research: at most two quick searches, only if the brand is legible ("<brand product> fake OR recall OR lab test OR FSSAI"). Report only what you actually found, naming the source. Never invent recalls. Skip searching if the label alone answers everything.
9. Suggestions for HIM under the "${lens}" lens: how much, when (around band days), what to pair it with to reach ${profile.protein_target_g} g, whether to keep buying it.
10. Better alternatives available in India, for that lens.
Be direct and concrete.`;
}

export type AnalysisInput = {
  transcript: string;
  note?: string;
  lens: Lens;
  profile: ScanProfile;
  /** true when the transcript came from the phone's OCR (line breaks / misreads expected). */
  fromPhoneOcr?: boolean;
  /** "label" (photo/OCR) or "barcode" (Open Food Facts product data). */
  kind: "label" | "barcode";
  /** Web searches Haiku may run (default 2). A complete Open Food Facts record needs at most 1. */
  maxSearches?: number;
};

/** The rules the structuring step follows, shared by the two-call and the single-call paths. */
function structureRules(targets: string, lens: Lens, compact: boolean) {
  return (
    `${targets}\nThe user's chosen lens is "${lens}".\n\n` +
    `Rules:\n` +
    `- what_it_is: two neutral sentences from section 1. No judgement words.\n` +
    `- verdict / verdict_reason: from TRUST only (safety + honesty). Never let taste or nutrition move it.\n` +
    `- fits: one entry per lens (protein, snack, cutting, bulking) with verdict great|ok|weak and a "why" that quotes the deciding number. Descriptive wording only — never "not good for you".\n` +
    `- infographic.serving_share: take ONE serving (use serving_g; if there is no serving size, use 100 g and say so in one_liner) and express its calories/protein/carbs/fat as whole percentages of the daily targets above. Clamp each to 0-100.\n` +
    `- infographic.sugar_teaspoons_per_serving: sugar grams in one serving divided by 4. 0 when unknown.\n` +
    `- infographic.sodium_pct_of_2000mg: sodium mg in one serving as a whole percentage of 2000 mg (salt g x 400 = sodium mg). 0 when unknown.\n` +
    `- infographic.score_out_of_10: how well this product serves the "${lens}" lens for THIS user. 0 is useless for that lens, 10 is ideal.\n` +
    `- infographic.one_liner: at most 12 words, descriptive ("Mostly refined flour and palm oil; 7 g protein per pack").\n` +
    `- infographic.eat_it: for the "${lens}" lens — "yes" great fit, "sometimes" ok, "skip" weak.\n` +
    `- per_100g / protein.per_serving_g: ONLY the numbers actually printed in the transcript's nutrition table. If the transcript has no nutrition table (front-of-pack only, ingredients only, etc.), leave per_100g and protein.per_serving_g out entirely — never estimate, round from memory, or restate a number you are not looking at. A parser re-derives these fields from the transcript afterward and will overwrite whatever you put here when it finds a real table, so guessing only risks being wrong when it can't.\n` +
    (compact
      ? `- Keep it tight: at most 4 concerns, 3 suggestions, 3 alternatives, 2 research lines (only what you actually found; an empty array when you did not search), and only claims actually printed on the pack. One sentence per "why", "note" and "issue".\n\n`
      : `\n`)
  );
}

/**
 * Steps 2 (analyse + research) and 3 (forced tool call). Always yields a report object.
 *
 * v2.8: ONE Haiku call does both the free-text analysis and the structured `label_report` tool
 * call, for every input (label scan, thin OFF record, or a complete OFF record) — collapsed from
 * the v2.7 analyse -> structure pair (2 Haiku calls) down to 1. Web search stays available on the
 * same call (max_uses from `maxSearches`, 2 for a label/thin record, 1 for a complete OFF record)
 * and stays OFF by default in the sense that matters: the prompt tells the model to reach for it
 * only when a recall/counterfeit story is plausible, so most scans never trigger it. This is
 * purely about the AI call shape — the numbers in `per_100g` are NEVER taken from this call. The
 * deterministic parser in labelParse.ts (via `applyParsedNutrition` in scanFlows.ts) always runs
 * AFTER this returns and overwrites/clears per_100g with its own sanity-gated numbers; the model's
 * report is only the narrative + structure around them.
 * Falls back to a second `label_structure` call only in the rare case the model writes prose but
 * never calls the tool.
 */
/** Loose runtime shape check on `label_report` output for providers other than Anthropic (which is
 *  schema-forced already via tool_choice). */
function isReportShape(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && "verdict" in (v as object) && "fits" in (v as object);
}

export async function analyseTranscript(input: AnalysisInput): Promise<{ report: Record<string, unknown>; analysis: string; usage: UsageEntry[] }> {
  const { transcript, note, lens, profile } = input;
  const text = (m: Anthropic.Message) => m.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
  const targets = targetsLine(profile);
  const maxSearches = input.maxSearches ?? 2;
  const compact = input.kind === "barcode" && maxSearches <= 1;
  const usage: UsageEntry[] = [];
  const provenance =
    input.kind === "barcode"
      ? " (this is a product record from Open Food Facts, contributed by volunteers — nutrition numbers are usually right, ingredient lists may be partial; say so if a field is missing)"
      : input.fromPhoneOcr
        ? " (read on the user's phone, so odd line breaks and the occasional misread character are expected — use judgement)"
        : "";
  // A complete OFF record answers the nutrition questions on its own; the one remaining reason to
  // search is a recall / counterfeit story, and most products have none.
  const searchHint = compact
    ? "\n\nThe data comes from Open Food Facts and is complete (ingredients + full nutrition table). Search the web ONLY if the brand/product could plausibly have a recall or counterfeit issue; otherwise answer from the record and skip the search."
    : "";
  const userText = `LABEL TRANSCRIPT${provenance}:\n${transcript}\n\n${note ? `User note: ${note.slice(0, 300)}\n\n` : ""}${targets}${searchHint}`;
  const webSearch = { type: "web_search_20250305", name: "web_search", max_uses: maxSearches } as unknown as Anthropic.Tool;
  const notesLimit = compact ? "under 150 words in total" : "under 220 words in total";

  // One call: `web_search` is Anthropic-only, so this task always runs on Claude (see tasks.ts), but
  // still goes through router.run for timing + the usage log line.
  const call = await run<Anthropic.Message>("label_analysis", {
    kind: "anthropic_native",
    build: (client) =>
      client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        system:
          analyseSystem(profile, lens) +
          `\n\nWrite your analysis as short bullets (${notesLimit} — the numbers, the trust call, one line per lens), then call the label_report tool exactly once with the full report. Every number in the report comes from the transcript above.`,
        tools: [webSearch, REPORT_TOOL],
        messages: [{ role: "user", content: `${userText}\n\nAnalyse it briefly, then call label_report.\n\n${structureRules(targets, lens, compact)}` }],
      }),
  });
  usage.push(toUsageEntry("label_analysis", call.model, call.usage));
  const msg = call.data;
  const analysis = text(msg).trim();
  const block = msg.content.find((b) => b.type === "tool_use" && b.name === "label_report");
  if (block && block.type === "tool_use") return { report: block.input as Record<string, unknown>, analysis, usage };

  // Rare fallback: the model wrote prose but never called the tool — structure it in a second call.
  // Structuring has no Anthropic-only feature — a generic structured-JSON task, provider-flexible.
  const s = await run<Record<string, unknown>>(
    "label_structure",
    {
      kind: "json",
      maxTokens: 2500,
      schema: REPORT_TOOL.input_schema as unknown as JsonSchema,
      schemaName: "label_report",
      text:
        `Convert this analysis into the label_report tool call. Keep every number as written. Set readable=true.\n\n` +
        structureRules(targets, lens, compact) +
        `TRANSCRIPT:\n${transcript}\n\nANALYSIS:\n${analysis}`,
    },
    isReportShape,
  );
  usage.push(toUsageEntry("label_structure", s.model, s.usage));
  return { report: s.data, analysis, usage };
}

// ---- Barcode AI-report cache (v2.7: keyed on barcode + lens + a hash of the profile targets used
//      in the prompt, stored inside barcode_cache.product so a repeat scan skips Haiku entirely) ----

export type CachedReport = { report: Record<string, unknown>; analysis: string; cachedAt: string };
export type ReportCache = Record<string, CachedReport>;

/** Short, stable hash of the profile numbers that actually shape the report's wording and infographic. */
export function reportCacheKey(lens: Lens, profile: ScanProfile): string {
  const h = createHash("sha1")
    .update(JSON.stringify({ p: profile.protein_target_g, c: profile.calorie_target, cb: profile.carb_target_g, f: profile.fat_target_g, g: profile.goal_type, w: profile.weekly_workout_target }))
    .digest("hex")
    .slice(0, 10);
  // "g1": reports built after the OFF sanity gate landed (v2.7 merge) — older, ungated ones never hit.
  return `g1:${lens}:${h}`;
}

/** The "couldn't read that" report, in the same shape, so clients never special-case it. */
export function unreadableReport(reason: string, transcript = ""): Record<string, unknown> {
  return {
    readable: false,
    product: "",
    what_it_is: "",
    verdict: "caution",
    verdict_reason: reason,
    fits: {},
    protein: { rating: "poor", quality: "", note: "" },
    concerns: [],
    claims: [],
    research: [],
    suggestions: [],
    alternatives: [],
    transcript,
  };
}

/** Persist a scan for the History list. Returns the row id. */
export async function saveScan(
  admin: AdminClient,
  row: { userId: string; kind: "label" | "barcode" | "photo"; lens: string; product: string; verdict: string; report: Record<string, unknown>; imagePath?: string | null; imageUrl?: string | null },
): Promise<string | null> {
  const { data, error } = await admin
    .from("label_scans")
    .insert({ user_id: row.userId, kind: row.kind, lens: row.lens, product: row.product, verdict: row.verdict, report: row.report, image_path: row.imagePath ?? null, image_url: row.imageUrl ?? null })
    .select("id")
    .single();
  if (error) console.error("[saveScan] label_scans insert failed", { kind: row.kind, error });
  return (data?.id as string | undefined) ?? null;
}

// ---- Open Food Facts ----

/** True when OFF has an ingredients list and per-100 g energy, protein, carbs, fat, sugar and sodium. */
export function offComplete(p: OffProduct): boolean {
  if (!p.ingredients_text?.trim()) return false;
  const n = p.nutriments ?? {};
  const has = (k: string) => {
    const v = n[`${k}_100g`] ?? n[k];
    return v != null && v !== "" && Number.isFinite(Number(v));
  };
  const sodium = has("sodium") || has("salt");
  return has("energy-kcal") && has("proteins") && has("carbohydrates") && has("fat") && has("sugars") && sodium;
}

export type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  ingredients_text?: string;
  nutriments?: Record<string, number | string>;
  serving_size?: string;
  quantity?: string;
  image_url?: string;
  nutriscore_grade?: string;
  nova_group?: number;
  countries_tags?: string[];
};

/**
 * The OFF record's own per-100g numbers (not the model's restatement of them), run through the
 * same sanity gate as a label scan. This is what caught the True Elements Muesli bug: OFF's
 * per-100g fields for that product were mis-scaled per-serving values (1037 kcal/100g), and got
 * cached and shown unchecked. Tries the printed per-100g fields first, then re-derives from
 * per-serving + serving size if those fail the gate; returns null (never cache, never show) if
 * neither checks out.
 */
export function offPer100g(p: OffProduct): { per_100g: Per100 | null; source: "openfoodfacts" | null; reasons: string[] } {
  const n = p.nutriments ?? {};
  const num = (k: string) => {
    const v = n[k];
    if (v == null || v === "") return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const direct: Per100 = {
    calories: num("energy-kcal_100g") ?? undefined,
    protein_g: num("proteins_100g") ?? undefined,
    carbs_g: num("carbohydrates_100g") ?? undefined,
    sugar_g: num("sugars_100g") ?? undefined,
    fat_g: num("fat_100g") ?? undefined,
    saturated_fat_g: num("saturated-fat_100g") ?? undefined,
    trans_fat_g: num("trans-fat_100g") ?? undefined,
    fiber_g: num("fiber_100g") ?? undefined,
    sodium_mg: num("sodium_100g") != null ? (num("sodium_100g") as number) * 1000 : num("salt_100g") != null ? (num("salt_100g") as number) * 400 : undefined,
  };
  const directGate = sanityCheckPer100(direct);
  if (directGate.ok) return { per_100g: roundPer100(direct), source: "openfoodfacts", reasons: [] };

  // Try re-deriving from per-serving values + a printed serving size.
  const servingG = (() => {
    const m = String(p.serving_size ?? "").match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
    return m ? Number(m[1].replace(",", ".")) : null;
  })();
  if (servingG && servingG > 0) {
    const perServing: Per100 = {
      calories: num("energy-kcal_serving") ?? undefined,
      protein_g: num("proteins_serving") ?? undefined,
      carbs_g: num("carbohydrates_serving") ?? undefined,
      sugar_g: num("sugars_serving") ?? undefined,
      fat_g: num("fat_serving") ?? undefined,
      saturated_fat_g: num("saturated-fat_serving") ?? undefined,
      trans_fat_g: num("trans-fat_serving") ?? undefined,
      fiber_g: num("fiber_serving") ?? undefined,
      sodium_mg: num("sodium_serving") != null ? (num("sodium_serving") as number) * 1000 : num("salt_serving") != null ? (num("salt_serving") as number) * 400 : undefined,
    };
    if (perServing.calories != null && perServing.protein_g != null && perServing.carbs_g != null && perServing.fat_g != null) {
      const derived = derivePer100FromServing(perServing, servingG);
      const derivedGate = sanityCheckPer100(derived);
      if (derivedGate.ok) return { per_100g: roundPer100(derived), source: "openfoodfacts", reasons: [] };
      return { per_100g: null, source: null, reasons: derivedGate.reasons };
    }
  }
  return { per_100g: null, source: null, reasons: directGate.reasons };
}

const OFF_FIELDS = "product_name,brands,ingredients_text,nutriments,serving_size,quantity,image_url,nutriscore_grade,nova_group,countries_tags";
const OFF_UA = "LockedIn/1.7 (sohumai.team@gmail.com)";

/** world.openfoodfacts.org first, then the Indian mirror. Null when neither knows the code. */
export async function fetchOff(barcode: string): Promise<OffProduct | null> {
  for (const host of ["world.openfoodfacts.org", "in.openfoodfacts.org"]) {
    try {
      const res = await fetch(`https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`, {
        headers: { "User-Agent": OFF_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { status?: number; product?: OffProduct };
      if (j.status === 1 && j.product && (j.product.product_name || j.product.nutriments)) return { ...j.product, code: barcode };
    } catch {
      // try the next host
    }
  }
  return null;
}

/** Flatten an OFF product into the same kind of text the label OCR produces. */
export function offTranscript(p: OffProduct): string {
  const n = p.nutriments ?? {};
  const num = (k: string) => {
    const v = n[k];
    return v == null || v === "" ? null : Number(v);
  };
  const line = (label: string, key: string, unit: string, scale = 1) => {
    const per100 = num(`${key}_100g`) ?? num(key);
    const serving = num(`${key}_serving`);
    if (per100 == null && serving == null) return null;
    const f = (v: number | null) => (v == null ? "—" : `${Math.round(v * scale * 100) / 100} ${unit}`);
    return `${label}: ${f(per100)} per 100 g${serving != null ? `, ${f(serving)} per serving` : ""}`;
  };
  const rows = [
    line("Energy", "energy-kcal", "kcal"),
    line("Protein", "proteins", "g"),
    line("Carbohydrate", "carbohydrates", "g"),
    line("of which sugars", "sugars", "g"),
    line("Fat", "fat", "g"),
    line("of which saturates", "saturated-fat", "g"),
    line("Trans fat", "trans-fat", "g"),
    line("Fibre", "fiber", "g"),
    line("Sodium", "sodium", "mg", 1000),
    line("Salt", "salt", "g"),
    line("Calcium", "calcium", "mg", 1000),
    line("Iron", "iron", "mg", 1000),
  ].filter(Boolean);
  const country = (p.countries_tags ?? []).map((c) => c.replace(/^en:/, "")).join(", ");
  return [
    `PRODUCT: ${p.product_name || "(unnamed)"}`,
    p.brands ? `BRAND: ${p.brands}` : null,
    p.quantity ? `PACK SIZE: ${p.quantity}` : null,
    p.serving_size ? `SERVING SIZE: ${p.serving_size}` : null,
    p.code ? `BARCODE: ${p.code}` : null,
    country ? `SOLD IN: ${country}` : null,
    p.nova_group ? `NOVA GROUP (processing, 1 least – 4 most): ${p.nova_group}` : null,
    p.nutriscore_grade && p.nutriscore_grade !== "unknown" ? `NUTRI-SCORE: ${String(p.nutriscore_grade).toUpperCase()}` : null,
    "",
    "INGREDIENTS:",
    p.ingredients_text?.trim() || "[not listed on Open Food Facts]",
    "",
    "NUTRITION:",
    ...(rows.length ? rows : ["[no nutrition table on Open Food Facts]"]),
    "",
    "(source: Open Food Facts, volunteer-contributed)",
  ]
    .filter((l) => l != null)
    .join("\n");
}
