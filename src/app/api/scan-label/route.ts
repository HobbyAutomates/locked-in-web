import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Photo of a packaged food's ingredients / nutrition label → structured verdict.
 * Three steps so each model does what it is best at and the output is always structured:
 *   1. Sonnet transcribes the label (best vision/OCR we can call without new infra).
 *   2. Haiku analyses the transcript, may web-search the brand for recalls / fakes / lab tests.
 *   3. Haiku is FORCED to emit the label_report tool from that analysis, so a report always comes back.
 */
const REPORT_TOOL: Anthropic.Tool = {
  name: "label_report",
  description: "Return the structured assessment of the food label.",
  input_schema: {
    type: "object",
    properties: {
      product: { type: "string", description: "Product and brand as printed, or best guess" },
      readable: { type: "boolean", description: "false if the photo is not a food label or is unreadable" },
      verdict: { type: "string", enum: ["safe", "caution", "unsafe", "misleading", "fake"] },
      verdict_reason: { type: "string", description: "One or two sentences that justify the verdict" },
      per_100g: {
        type: "object",
        properties: { calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, sugar_g: { type: "number" }, fat_g: { type: "number" }, sodium_mg: { type: "number" } },
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
      concerns: { type: "array", items: { type: "object", properties: { ingredient: { type: "string" }, issue: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] } }, required: ["ingredient", "issue", "severity"] } },
      claims: { type: "array", items: { type: "object", properties: { claim: { type: "string" }, status: { type: "string", enum: ["supported", "misleading", "false", "unclear"] }, why: { type: "string" } }, required: ["claim", "status", "why"] } },
      research: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
      alternatives: { type: "array", items: { type: "string" } },
    },
    required: ["product", "readable", "verdict", "verdict_reason", "protein", "concerns", "claims", "suggestions", "alternatives"],
  },
};

const TRANSCRIBE = `You are an OCR engine for packaged-food labels. Transcribe EVERYTHING legible on the label, verbatim, preserving numbers and units exactly: product name, brand, ingredients list with percentages, allergen line, serving size, the full nutrition table (per 100 g and per serving if both), claims printed on the pack, FSSAI licence number, batch, MRP, manufacturer. Use headings for each section. If part of the label is cut off, blurred or glared, say [unreadable] at that spot instead of guessing. If this is not a food label, say NOT_A_LABEL and describe what it is in one line.`;

function analyseSystem(profile: { protein_target_g: number; calorie_target: number; weekly_workout_target: number }) {
  return `You are a food-label analyst for one user: a 17-year-old male student in Bengaluru, India, who trains with resistance bands ${profile.weekly_workout_target}x/week and targets ${profile.protein_target_g} g protein and ${profile.calorie_target} kcal per day. He mostly eats home-cooked Indian food (rice, dal, eggs, whey).

You get a transcript of a packaged food's label. Write a thorough but tight analysis covering:
- Verdict: safe / caution / unsafe / misleading / fake, and why. "misleading" = claims the label doesn't support (high-protein with low protein per 100 kcal, sugar-free with maltodextrin, amino spiking, serving-size tricks). "fake" = counterfeit signs (misspelled brand, missing/invalid FSSAI number, known counterfeit reports). "unsafe" = banned/hazardous ingredients, undeclared allergens, doses beyond safe limits, or a recall.
- Per-100 g numbers as printed.
- Protein: per serving, per 100 kcal, source quality (complete vs incomplete, isolate vs concentrate vs plant blend, collagen), rating excellent/good/average/poor for HIS goal.
- Ingredients worth knowing about, with severity low/medium/high.
- Each marketing claim on the pack: supported / misleading / false / unclear.
- Web research: at most two quick searches, only if the brand is legible ("<brand product> fake OR recall OR lab test OR FSSAI"). Report only what you actually found, naming the source. Never invent recalls. Skip searching if the label alone answers everything.
- Suggestions specific to him: how much, when (around band days), what to pair it with to reach ${profile.protein_target_g} g, whether to keep buying it.
- Better alternatives available in India.
Be direct and concrete.`;
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
  const text = (m: Anthropic.Message) => m.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");

  try {
    // 1. Transcribe (vision).
    const t = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: TRANSCRIBE,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: image } }, { type: "text", text: "Transcribe this label." }] }],
    });
    const transcript = text(t).trim();
    if (!transcript || transcript.startsWith("NOT_A_LABEL")) {
      return NextResponse.json({ readable: false, product: "", verdict: "caution", verdict_reason: transcript.replace("NOT_A_LABEL", "").trim() || "Couldn't read a food label in that photo.", protein: { rating: "poor", quality: "", note: "" }, concerns: [], claims: [], research: [], suggestions: [], alternatives: [], transcript });
    }

    // 2. Analyse + research (text only, so it's fast).
    const a = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: analyseSystem(profile),
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as unknown as Anthropic.Tool],
      messages: [{ role: "user", content: `LABEL TRANSCRIPT:\n${transcript}\n\n${note ? `User note: ${note.slice(0, 300)}\n\n` : ""}Analyse it.` }],
    });
    const analysis = text(a).trim();

    // 3. Structure — the tool is forced, so this always yields a report.
    const s = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "label_report" },
      messages: [{ role: "user", content: `Convert this label analysis into the label_report tool call. Keep every number as written. Set readable=true.\n\nTRANSCRIPT:\n${transcript}\n\nANALYSIS:\n${analysis}` }],
    });
    const block = s.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return NextResponse.json({ error: "Could not structure the report" }, { status: 500 });
    const report = block.input as { product?: string; verdict?: string };

    const { data: saved } = await admin
      .from("label_scans")
      .insert({ user_id: user.id, product: report.product ?? "", verdict: report.verdict ?? "", report: { ...report, transcript, analysis } })
      .select("id")
      .single();

    return NextResponse.json({ id: saved?.id ?? null, ...report, transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
