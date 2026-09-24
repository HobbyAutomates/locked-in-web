import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, after } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { chunksOf, describeHit, hasDevanagari, hindiToLatin, microsFor, searchFoods, type FoodHit } from "@/lib/foodSearch";
import { matchFood } from "@/lib/foods";
import { foodKey } from "@/lib/foodKey";
import { cachedFoodImages, resolveFoodImage } from "@/lib/foodImage";
import type { ParseResult, ParsedItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * "do roti, ek katori dal tadka, thoda ghee, 2 eggs" → priced items.
 *
 * 1. Split the text into food chunks and look each up in bandlog.foods (3,000+ Indian + Western
 *    rows). The top-3 candidates per chunk — with their per-100 g values and household units — go
 *    into the prompt, so Haiku PICKS from the database and only estimates when nothing matches.
 * 2. Haiku returns items with a `food_id` (or none) and grams after unit conversion.
 * 3. We price every item from the DB row when it named one (source "table"), else from Haiku's
 *    own per-100 g estimate (source "estimated").
 */

type HaikuItem = {
  input: string;
  food: string;
  food_id?: string | null;
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
            food: { type: "string", description: "Canonical food name (the database name when food_id is set)" },
            food_id: { type: "string", description: "The id of the DATABASE CANDIDATE you picked, or omit when none of the candidates is the same food" },
            grams: { type: "number", description: "Total grams for this item, after converting units" },
            confidence: { type: "number", description: "0 to 1" },
            est_per_100g: {
              type: "object",
              description: "Only when food_id is NOT set: your estimate per 100 g",
              properties: { calories: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" } },
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

const SYSTEM = `You convert a person's description of what they ate — English, Hindi or Hinglish, often from voice dictation — into structured food items.

DATABASE FIRST. The user message lists DATABASE CANDIDATES for each chunk of the text: "id | name (हिंदी) | per100g: kcal P C F | unit=grams …". If a candidate is the same food the person means, set food_id to that id and food to that name, even when the wording differs ("dal tadka" → the dal row, "chapati" → the roti row). Only when NO candidate is that food, omit food_id and fill est_per_100g from your own nutrition knowledge.

HINGLISH GLOSSARY — numbers: ek = 1, do = 2, teen = 3, char = 4, paanch = 5, chhe = 6, saat = 7, aath = 8, das = 10, aadha / adha = half, dedh = 1.5, dhai = 2.5, thoda / thoda sa = a little (about 1 tsp for fats and sauces, a quarter portion for foods), zyada = extra (about 1.5x), bahut = a lot (about 2x). Measures: katori = small bowl (150 g for dal, sabzi, curd, rice), bowl / bada katori = 200 g, chammach = spoon (tbsp 15 g; chhota chammach = tsp 5 g), glass = 250 ml, cup = 150 ml, plate = 250 g, ladle / karchi = 60 g, piece / tukda = one item, roti / chapati / phulka = 40 g each, paratha = 80 g, idli = 40 g, dosa = 100 g, egg / anda = 50 g, egg white = 33 g, scoop (whey) = 30 g, slice of bread = 30 g, banana = 120 g, apple = 180 g. Use the candidate's own units (e.g. "katori=150g", "piece=93g") when it lists them — they beat the defaults.

DEVANAGARI — the text may be in Hindi script (from voice dictation in hi-IN). Numbers: एक = 1, दो = 2, तीन = 3, चार = 4, पाँच / पांच = 5, छह = 6, सात = 7, आठ = 8, नौ = 9, दस = 10, आधा / आधी = half, डेढ़ = 1.5, ढाई = 2.5, थोड़ा / थोड़ा सा / थोड़ी = a little, ज़्यादा = extra, बहुत = a lot; Devanagari digits ०-९ are 0-9. Measures: कटोरी = katori (150 g), कटोरा / बड़ी कटोरी = bowl (200 g), गिलास / ग्लास = glass (250 ml), कप = cup (150 ml), प्लेट = plate (250 g), चम्मच = tbsp (15 g; छोटा चम्मच = tsp 5 g), पीस / टुकड़ा = one piece, स्कूप = scoop (30 g), ग्राम = grams. Foods: रोटी / चपाती / फुल्का = roti, पराठा = paratha, चावल = rice, दाल = dal, दाल तड़का = dal tadka, सब्ज़ी / सब्जी = sabzi, अंडा / अंडे = egg(s), दूध = milk, दही = curd, पनीर = paneer, घी = ghee, तेल = oil, चाय = chai, चीनी = sugar, केला = banana, सेब = apple, मक्खन = butter, चिकन = chicken, मछली = fish, राजमा = rajma, छोले / चना = chole. Each DATABASE CANDIDATE line shows the Hindi name in brackets — match Devanagari input against those names too (the same food, whichever script it is written in). Write "food" and "input" for Devanagari items in the candidate's English name; keep "input" as the original Devanagari words.

Rules:
- Interpret messy dictation generously ("hundred fifty grams rice comma dal hundred").
- Indian defaults: rice, dal, sabzi and similar are COOKED weights unless the text says raw / kachcha / uncooked. Record that in "assumptions" when you apply it.
- When a quantity is missing, use one household unit and say so in "assumptions".
- Put anything that is not food into "unparsed".
- Keep each item's "input" as the exact words it came from.
Always call the log_food_items tool exactly once.`;

function priced(it: HaikuItem, food: FoodHit | null): ParsedItem {
  const grams = Math.max(0, Number(it.grams) || 0);
  const k = grams / 100;
  if (food) {
    return {
      input: it.input,
      food_id: food.id,
      name: food.name,
      grams,
      calories: Math.round(food.calories * k),
      protein_g: Math.round(food.protein_g * k * 10) / 10,
      carbs_g: Math.round(food.carbs_g * k * 10) / 10,
      fat_g: Math.round(food.fat_g * k * 10) / 10,
      source: "table",
      matched_from: "table",
      confidence: it.confidence ?? null,
      micros: microsFor(food, grams),
    };
  }
  const e = it.est_per_100g;
  return {
    input: it.input,
    food_id: null,
    name: it.food,
    grams,
    calories: e ? Math.round((Number(e.calories) || 0) * k) : 0,
    protein_g: e ? Math.round((Number(e.protein_g) || 0) * k * 10) / 10 : 0,
    carbs_g: e ? Math.round((Number(e.carbs_g) || 0) * k * 10) / 10 : 0,
    fat_g: e ? Math.round((Number(e.fat_g) || 0) * k * 10) / 10 : 0,
    source: "estimated",
    matched_from: "estimated",
    confidence: e ? (it.confidence ?? null) : 0,
    micros: {},
  };
}

/** Legacy fallback: the in-repo table, shaped like a search hit. */
function localHit(name: string): FoodHit | null {
  const f = matchFood(name);
  if (!f) return null;
  return {
    id: f.id,
    name: f.name,
    aliases: f.aliases,
    calories: f.calories,
    protein_g: f.protein,
    carbs_g: f.carbs,
    fat_g: f.fat,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    micros: {},
    source: "custom",
    region: null,
    names_local: {},
    units: f.unit && f.unitGrams ? [{ name: f.unit, grams: f.unitGrams }] : [],
    unit_name: f.unit ?? null,
    unit_grams: f.unitGrams ?? null,
    score: 1,
  };
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { text, correction, previous } = (await req.json()) as { text?: string; correction?: string; previous?: unknown };
  if (!text || !text.trim()) return NextResponse.json({ error: "Nothing to parse" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  // 1. Database candidates per chunk (best-effort: a search failure never blocks the parse).
  const chunks = chunksOf(text).slice(0, 12);
  const candidates = new Map<string, FoodHit>();
  const lines: string[] = [];
  await Promise.all(
    chunks.map(async (c) => {
      // A Devanagari chunk is searched as written AND as its English name ("दाल तड़का" → "dal tadka"),
      // so it lands on the same rows a Hinglish speaker gets; the English hits rank first.
      const latin = hasDevanagari(c) ? hindiToLatin(c) : null;
      const [own, en] = await Promise.all([
        searchFoods(c, 3).catch(() => [] as FoodHit[]),
        latin && latin !== c && !hasDevanagari(latin) ? searchFoods(latin, 3).catch(() => [] as FoodHit[]) : Promise.resolve([] as FoodHit[]),
      ]);
      const seen = new Set<string>();
      const hits = [...en, ...own].filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true))).slice(0, 4);
      if (!hits.length) return;
      for (const h of hits) candidates.set(h.id, h);
      lines.push(`"${c}"${latin && latin !== c ? ` (= ${latin})` : ""}:\n${hits.map((h) => "  - " + describeHit(h)).join("\n")}`);
    }),
  );
  const candidateBlock = lines.length ? `DATABASE CANDIDATES (per chunk of the text):\n${lines.join("\n")}` : "DATABASE CANDIDATES: none found — estimate everything.";

  // "Fix issue": the user tells us what was wrong with the last result; re-parse with that in view.
  const userContent = correction
    ? `Original description:\n${text.slice(0, 2000)}\n\nMy previous parse (JSON):\n${JSON.stringify(previous ?? []).slice(0, 4000)}\n\nThe user says this is wrong: "${String(correction).slice(0, 500)}"\nProduce the corrected full item list.\n\n${candidateBlock}`
    : `${text.slice(0, 2000)}\n\n${candidateBlock}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1800,
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
    if (!(Number(it.grams) > 0)) continue;
    let food: FoodHit | null = (it.food_id && candidates.get(it.food_id)) || null;
    if (!food && !it.est_per_100g) {
      // Haiku named a food without an id and without numbers: one more DB look, then the legacy table.
      const [hit] = await searchFoods(it.food, 1).catch(() => [] as FoodHit[]);
      food = hit && hit.score >= 1 ? hit : localHit(it.food) ?? localHit(it.input);
    }
    items.push(priced(it, food));
  }

  // v2.4: pictures from the shared cache so the plate shows photos with no extra round trip; the
  // first few foods nobody has pictured yet are looked up after the response, for next time.
  const imgs = await cachedFoodImages(admin, items.map((i) => i.name)).catch(() => new Map<string, string>());
  const unpictured: string[] = [];
  for (const it of items) {
    const u = imgs.get(foodKey(it.name));
    if (u) it.image_url = u;
    else if (!unpictured.includes(it.name)) unpictured.push(it.name);
  }
  if (unpictured.length) after(() => Promise.all(unpictured.slice(0, 4).map((n) => resolveFoodImage(n, { admin }).catch(() => null))).then(() => undefined));

  const result: ParseResult = { items, assumptions: raw.assumptions ?? [], unparsed: raw.unparsed ?? [] };
  return NextResponse.json(result);
}
