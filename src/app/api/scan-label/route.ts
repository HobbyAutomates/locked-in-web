import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * An ingredients / nutrition label → structured verdict.
 * Three steps so each model does what it is best at and the output is always structured:
 *   1. Transcribe. The phone now does this on-device (ML Kit) and posts `text`; when that text is
 *      long enough we skip straight to step 2. Otherwise Sonnet reads the photo as before.
 *   2. Haiku analyses the transcript, may web-search the brand for recalls / fakes / lab tests.
 *   3. Haiku is FORCED to emit the label_report tool from that analysis, so a report always comes back.
 */

/** Below this many characters the on-device OCR is treated as a failed read. */
const OCR_MIN_CHARS = 120;
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
      infographic: {
        type: "object",
        description: "Everything the phone needs to draw the report as a picture. Fill every field.",
        properties: {
          serving_share: {
            type: "object",
            description: "ONE serving as a percentage of this user's daily targets, integers 0-100 (clamp above 100 to 100).",
            properties: {
              protein_pct: { type: "integer" },
              carbs_pct: { type: "integer" },
              fat_pct: { type: "integer" },
              calories_pct: { type: "integer" },
            },
            required: ["protein_pct", "carbs_pct", "fat_pct", "calories_pct"],
          },
          sugar_teaspoons_per_serving: { type: "number", description: "sugar grams per serving divided by 4" },
          sodium_pct_of_2000mg: { type: "integer", description: "sodium mg per serving as a percentage of 2000 mg" },
          score_out_of_10: { type: "integer", description: "overall score for THIS user, 0-10" },
          one_liner: { type: "string", description: "12 words or fewer, plain English, e.g. 'Great protein, watch the sodium'" },
          eat_it: { type: "string", enum: ["yes", "sometimes", "skip"] },
        },
        required: ["serving_share", "sugar_teaspoons_per_serving", "sodium_pct_of_2000mg", "score_out_of_10", "one_liner", "eat_it"],
      },
    },
    required: ["product", "readable", "verdict", "verdict_reason", "protein", "concerns", "claims", "suggestions", "alternatives", "infographic"],
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

  const body = (await req.json()) as { image?: string; media_type?: string; note?: string; text?: string };
  const { image, media_type, note } = body;
  const ocrText = (body.text ?? "").trim();
  if (!image && ocrText.length === 0) return NextResponse.json({ error: "No image" }, { status: 400 });
  const mt = (media_type ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

  const { createClient: createAdmin } = await import("@supabase/supabase-js");
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: "bandlog" } });
  const { data: prof } = await admin
    .from("profiles")
    .select("protein_target_g, calorie_target, weekly_workout_target, carb_target_g, fat_target_g")
    .eq("id", user.id)
    .maybeSingle();
  const profile = prof ?? { protein_target_g: 120, calorie_target: 2200, weekly_workout_target: 3, carb_target_g: null, fat_target_g: null };
  // Same fallback the app uses when the macro goals were never set explicitly.
  const fatTarget = profile.fat_target_g ?? Math.round((profile.calorie_target * 0.25) / 9);
  const carbTarget =
    profile.carb_target_g ?? Math.max(0, Math.round((profile.calorie_target - profile.protein_target_g * 4 - fatTarget * 9) / 4));
  const targets = `DAILY TARGETS for this user: ${profile.calorie_target} kcal, ${profile.protein_target_g} g protein, ${carbTarget} g carbs, ${fatTarget} g fat.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const text = (m: Anthropic.Message) => m.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");

  try {
    // 1. Transcribe. The phone's own OCR wins when it read enough; otherwise Sonnet looks at the photo.
    let transcript = ocrText.length >= OCR_MIN_CHARS ? ocrText : "";
    if (!transcript) {
      if (!image) return NextResponse.json({ error: "Couldn't read enough text — retake the photo." }, { status: 400 });
      const t = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: TRANSCRIBE,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: image } }, { type: "text", text: "Transcribe this label." }] }],
      });
      transcript = text(t).trim();
    }
    if (!transcript || transcript.startsWith("NOT_A_LABEL")) {
      return NextResponse.json({ readable: false, product: "", verdict: "caution", verdict_reason: transcript.replace("NOT_A_LABEL", "").trim() || "Couldn't read a food label in that photo.", protein: { rating: "poor", quality: "", note: "" }, concerns: [], claims: [], research: [], suggestions: [], alternatives: [], transcript });
    }

    // 2. Analyse + research (text only, so it's fast).
    const a = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: analyseSystem(profile),
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as unknown as Anthropic.Tool],
      messages: [
        {
          role: "user",
          content:
            `LABEL TRANSCRIPT${ocrText.length >= OCR_MIN_CHARS ? " (read on the user's phone, so odd line breaks and the occasional misread character are expected — use judgement)" : ""}:\n${transcript}\n\n` +
            `${note ? `User note: ${note.slice(0, 300)}\n\n` : ""}${targets}\n\nAnalyse it.`,
        },
      ],
    });
    const analysis = text(a).trim();

    // 3. Structure — the tool is forced, so this always yields a report.
    const s = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "label_report" },
      messages: [
        {
          role: "user",
          content:
            `Convert this label analysis into the label_report tool call. Keep every number as written. Set readable=true.\n\n` +
            `${targets}\n\n` +
            `Fill the infographic object from the transcript and those targets:\n` +
            `- serving_share: take ONE serving (use serving_g; if the label has no serving size, use 100 g and say so in one_liner) and express its calories/protein/carbs/fat as whole percentages of the daily targets above. Clamp each to 0-100.\n` +
            `- sugar_teaspoons_per_serving: sugar grams in one serving divided by 4. Use 0 when there is no sugar figure.\n` +
            `- sodium_pct_of_2000mg: sodium mg in one serving as a whole percentage of 2000 mg. Use 0 when unknown.\n` +
            `- score_out_of_10: how good this product is for THIS user overall (protein quality, sugar, sodium, additives, honesty of the claims). 0 is awful, 10 is excellent.\n` +
            `- one_liner: at most 12 words, plain English, no jargon, e.g. "Great protein, watch the sodium".\n` +
            `- eat_it: "yes" for a regular staple, "sometimes" for an occasional treat, "skip" if he shouldn't buy it.\n\n` +
            `TRANSCRIPT:\n${transcript}\n\nANALYSIS:\n${analysis}`,
        },
      ],
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
