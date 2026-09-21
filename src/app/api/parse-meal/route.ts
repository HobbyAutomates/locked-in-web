import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { FOOD_NAMES_FOR_PROMPT, matchFood } from "@/lib/foods";
import { createClient } from "@/lib/supabase/server";
import type { ParseResult, ParsedItem } from "@/lib/types";

export const runtime = "nodejs";

type HaikuItem = {
  input: string;
  food: string;
  grams: number;
  confidence?: number;
  est_per_100g?: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
};

const TOOL: Anthropic.Tool = {
  name: "log_food_items",
  description: "Return the foods mentioned in the text as structured items.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            input: { type: "string", description: "The words from the text this item came from" },
            food: { type: "string", description: "Canonical food name, matching the known list when possible" },
            grams: { type: "number", description: "Total grams for this item, after converting units" },
            confidence: { type: "number", description: "0 to 1" },
            est_per_100g: {
              type: "object",
              description: "Only for foods NOT in the known list: your estimate per 100 g",
              properties: {
                calories: { type: "number" },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
              },
              required: ["calories", "protein_g", "carbs_g", "fat_g"],
            },
          },
          required: ["input", "food", "grams"],
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
      unparsed: { type: "array", items: { type: "string" } },
    },
    required: ["items", "assumptions", "unparsed"],
  },
};

const SYSTEM = `You convert a person's spoken description of what they ate into structured food items.
Rules:
- The text comes from voice dictation and may be messy ("hundred fifty grams rice comma dal hundred"). Interpret it generously.
- Prefer food names from this known list exactly as written: ${FOOD_NAMES_FOR_PROMPT}
- Indian defaults: rice, dal, sabzi and similar are COOKED weights unless the text says raw or uncooked. Record that assumption in "assumptions" whenever you apply it.
- Household units, when no grams are given: 1 roti = 40 g, 1 paratha = 80 g, 1 idli = 40 g, 1 dosa = 100 g, 1 egg = 50 g, 1 egg white = 33 g, 1 scoop whey = 30 g, 1 bowl of rice or dal = 150 g, 1 glass of milk = 250 ml, 1 cup tea = 150 ml, 1 slice bread = 30 g, 1 medium banana = 120 g, 1 apple = 180 g, 1 tbsp = 15 g, 1 tsp = 5 g. State the conversion in "assumptions".
- If a quantity is genuinely missing, use the household unit above and note it.
- For a food that is not in the known list, still return it, with est_per_100g filled in from your nutrition knowledge.
- Put anything that is not food into "unparsed".
Always call the log_food_items tool exactly once.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  // Browser calls carry the session cookie; the Android app sends its Supabase access token as a bearer.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { text, correction, previous } = (await req.json()) as { text?: string; correction?: string; previous?: unknown };
  if (!text || !text.trim()) return NextResponse.json({ error: "Nothing to parse" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  // "Fix issue": the user tells us what was wrong with the last result; re-parse with that in view.
  const userContent = correction
    ? `Original description:\n${text.slice(0, 2000)}\n\nMy previous parse (JSON):\n${JSON.stringify(previous ?? []).slice(0, 4000)}\n\nThe user says this is wrong: "${String(correction).slice(0, 500)}"\nProduce the corrected full item list.`
    : text.slice(0, 2000);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "log_food_items" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return NextResponse.json({ error: "Parser returned nothing" }, { status: 502 });
  const raw = block.input as { items?: HaikuItem[]; assumptions?: string[]; unparsed?: string[] };

  const items: ParsedItem[] = [];
  for (const it of raw.items ?? []) {
    const grams = Math.max(0, Number(it.grams) || 0);
    if (!grams) continue;
    const food = matchFood(it.food) ?? matchFood(it.input);
    const k = grams / 100;
    if (food) {
      items.push({
        input: it.input,
        food_id: food.id,
        name: food.name,
        grams,
        calories: Math.round(food.calories * k),
        protein_g: Math.round(food.protein * k * 10) / 10,
        carbs_g: Math.round(food.carbs * k * 10) / 10,
        fat_g: Math.round(food.fat * k * 10) / 10,
        source: "table",
        confidence: it.confidence ?? null,
      });
    } else if (it.est_per_100g) {
      const e = it.est_per_100g;
      items.push({
        input: it.input,
        food_id: null,
        name: it.food,
        grams,
        calories: Math.round((Number(e.calories) || 0) * k),
        protein_g: Math.round((Number(e.protein_g) || 0) * k * 10) / 10,
        carbs_g: Math.round((Number(e.carbs_g) || 0) * k * 10) / 10,
        fat_g: Math.round((Number(e.fat_g) || 0) * k * 10) / 10,
        source: "estimated",
        confidence: it.confidence ?? null,
      });
    } else {
      items.push({
        input: it.input,
        food_id: null,
        name: it.food,
        grams,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        source: "estimated",
        confidence: 0,
      });
    }
  }

  const result: ParseResult = { items, assumptions: raw.assumptions ?? [], unparsed: raw.unparsed ?? [] };
  return NextResponse.json(result);
}
