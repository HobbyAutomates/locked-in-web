import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Photo of a packaged food's ingredients / nutrition label → structured verdict.
 * Haiku reads the label, may web-search the product/brand for recalls, fake-product reports and
 * lab tests, and returns a report tuned to the user's targets.
 */
const REPORT_TOOL: Anthropic.Tool = {
  name: "label_report",
  description: "Return the structured assessment of the food label.",
  input_schema: {
    type: "object",
    properties: {
      product: { type: "string", description: "Product and brand as printed, or best guess" },
      readable: { type: "boolean", description: "false if the photo is not a food label or is unreadable" },
      verdict: { type: "string", enum: ["safe", "caution", "unsafe", "misleading", "fake"], description: "Overall call" },
      verdict_reason: { type: "string", description: "One or two sentences that justify the verdict" },
      per_100g: {
        type: "object",
        properties: { calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, sugar_g: { type: "number" }, fat_g: { type: "number" }, sodium_mg: { type: "number" } },
      },
      serving_g: { type: "number", description: "Serving size on the label in grams, if given" },
      protein: {
        type: "object",
        properties: {
          rating: { type: "string", enum: ["excellent", "good", "average", "poor"] },
          per_serving_g: { type: "number" },
          quality: { type: "string", description: "Source and completeness (e.g. whey isolate = complete; soy; plant blend; collagen = incomplete)" },
          note: { type: "string", description: "Protein-per-100-kcal, amino spiking risk, or other useful observation" },
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
        description: "Marketing claims on the pack and whether the label supports them",
        items: { type: "object", properties: { claim: { type: "string" }, status: { type: "string", enum: ["supported", "misleading", "false", "unclear"] }, why: { type: "string" } }, required: ["claim", "status", "why"] },
      },
      research: { type: "array", items: { type: "string" }, description: "Facts found by web search: recalls, FSSAI/FDA actions, lab tests, counterfeit warnings, with source names" },
      suggestions: { type: "array", items: { type: "string" }, description: "Personalised advice for this user: how much to have, when, what to pair it with, or whether to skip it" },
      alternatives: { type: "array", items: { type: "string" }, description: "Better products or foods for the same purpose, available in India" },
    },
    required: ["product", "readable", "verdict", "verdict_reason", "protein", "concerns", "claims", "suggestions", "alternatives"],
  },
};

function system(profile: { protein_target_g: number; calorie_target: number; weekly_workout_target: number }) {
  return `You are a food-label analyst for one user: a 17-year-old male student in Bengaluru, India, who trains with resistance bands ${profile.weekly_workout_target}x/week and targets ${profile.protein_target_g} g protein and ${profile.calorie_target} kcal per day. He mostly eats home-cooked Indian food (rice, dal, eggs, whey).

You receive a photo of a packaged food's ingredients list and/or nutrition panel.
1. Transcribe what the label actually says. If it is not a food label or unreadable, set readable=false and explain.
2. Judge safety and honesty:
   - "safe": normal food, nothing concerning at sensible amounts.
   - "caution": legal but worth limiting (very high sugar/sodium/trans fat, many additives, allergens, artificial sweeteners in large amounts, proprietary blends hiding doses).
   - "unsafe": banned or hazardous ingredients, undeclared allergens, dosages beyond safe limits, or a product with a recall / regulator action.
   - "misleading": the marketing claims are not supported by the label (e.g. "high protein" with low protein per 100 kcal, "sugar-free" with maltodextrin, amino-spiked protein, "natural" with artificial additives, serving-size tricks).
   - "fake": signs of counterfeit (misspelled brand, missing FSSAI/licence number, wrong batch/MRP format, known counterfeit reports for that brand).
3. Do at most two quick web searches, only if the brand is legible: "<brand product> fake OR recall OR lab test". Report only what you actually found, with the source name. Do not invent recalls. If the label alone answers the question, skip searching.
4. Protein: rate per serving and per 100 kcal against his goal; call out incomplete sources and amino spiking (glycine/taurine/creatine counted as protein).
5. Suggestions must be specific to him: grams per day, timing around band workouts, what to add to hit ${profile.protein_target_g} g, and whether to keep buying it. Alternatives should be things sold in India.
Be direct and concrete. Always call the label_report tool exactly once at the end.`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const { image, media_type, note } = (await req.json()) as { image?: string; media_type?: string; note?: string };
  if (!image) return NextResponse.json({ error: "No image" }, { status: 400 });
  const mt = (media_type ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

  const { createClient: createAdmin } = await import("@supabase/supabase-js");
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: "bandlog" } });
  const { data: prof } = await admin.from("profiles").select("protein_target_g, calorie_target, weekly_workout_target").eq("id", user.id).maybeSingle();
  const profile = prof ?? { protein_target_g: 120, calorie_target: 2200, weekly_workout_target: 3 };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2500,
    system: system(profile),
    // Two searches max keeps a scan under ~40 s; the label itself carries most of the answer.
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as unknown as Anthropic.Tool, REPORT_TOOL],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mt, data: image } },
          { type: "text", text: `Analyse this label.${note ? ` The user adds: ${note.slice(0, 300)}` : ""}` },
        ],
      },
    ],
  });

  const block = msg.content.find((b) => b.type === "tool_use" && b.name === "label_report");
  if (!block || block.type !== "tool_use") return NextResponse.json({ error: "No report produced" }, { status: 502 });
  const report = block.input as { product?: string; verdict?: string };

  const { data: saved } = await admin
    .from("label_scans")
    .insert({ user_id: user.id, product: report.product ?? "", verdict: report.verdict ?? "", report })
    .select("id")
    .single();

  return NextResponse.json({ id: saved?.id ?? null, ...report });
}
