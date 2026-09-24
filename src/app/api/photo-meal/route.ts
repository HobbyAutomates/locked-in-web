import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { apiUser } from "@/lib/apiAuth";
import { microsFor, searchFoods, sourceBonus, type FoodHit } from "@/lib/foodSearch";
import { saveScan } from "@/lib/labelAnalysis";
import { RESTAURANT_MULTIPLIER, RESTAURANT_OIL_G, mentionsRestaurant, restaurantOil } from "@/lib/quantity";
import type { ItemMicros, PlateEstimate, PlateItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * A photo of a plate → per-item grams + macros + micros (Cal AI style).
 *   1. Sonnet looks at the picture and is forced to call `plate_estimate`: every item named the way
 *      an Indian would name it, portion in grams using plate / roti / katori / hand as scale.
 *   2. Cross-validate: each item is looked up in bandlog.foods; when a confident match exists the
 *      model's per-100 g numbers are replaced by the table's (grams stay the model's) → source "table".
 *   3. The JPEG goes to Storage (meal-photos/<user>/<uuid>.jpg) and the estimate to label_scans
 *      kind='photo', so the History list can show it and "Save as meal" can reuse the photo.
 */

const MICRO = { type: "number" } as const;
const TOOL: Anthropic.Tool = {
  name: "plate_estimate",
  description: "Return every food visible on the plate with an estimated portion and nutrition.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Real dish name: 'dal tadka', 'jeera rice', 'aloo gobi', 'roti', 'chicken breast, grilled'. Not 'lentil soup'." },
            grams: { type: "number", description: "Estimated weight of THIS portion in grams" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            calories: { type: "number", description: "kcal per 100 g of this food" },
            protein_g: { type: "number", description: "per 100 g" },
            carbs_g: { type: "number", description: "per 100 g" },
            fat_g: { type: "number", description: "per 100 g" },
            micros: {
              type: "object",
              description: "per 100 g, best estimates",
              properties: { fiber_g: MICRO, sugar_g: MICRO, sodium_mg: MICRO, iron_mg: MICRO, calcium_mg: MICRO, vitamin_c_mg: MICRO, potassium_mg: MICRO },
            },
          },
          required: ["name", "grams", "confidence", "calories", "protein_g", "carbs_g", "fat_g"],
        },
      },
      notes: { type: "array", items: { type: "string" }, description: "Assumptions: what you used as scale, hidden ingredients (ghee, oil), anything you could not see" },
      plate_note: { type: "string", description: "One sentence: what this meal is" },
      is_food: { type: "boolean" },
    },
    required: ["items", "notes", "plate_note", "is_food"],
  },
};

const SYSTEM = `You estimate the food on a plate from one photo for a 17-year-old in Bengaluru who eats mostly home-cooked Indian food, plus some Western meals.

Identify each distinct food and call it by its real name — Indian dishes by their actual names ("dal tadka", "jeera rice", "aloo gobi", "roti", "curd", "paneer bhurji", "rajma", "sambar", "idli", "poha"), Western ones plainly ("grilled chicken breast", "scrambled eggs", "toast"). Never invent a dish you cannot see; combine what is clearly one dish into one item.

Portion in grams. Use these as scale: a dinner plate is ~27 cm across, a roti ~18 cm, a katori (small steel bowl) holds ~150 ml, a tablespoon ~15 g, a hand's palm ~100 g of meat. Typical portions: roti 40 g each, paratha 80 g, idli 40 g, dosa 100 g, egg 50 g, a katori of dal or sabzi 150 g, a heap of rice on a plate 150–200 g, a piece of paneer 30 g. Count items you can count (3 rotis = 120 g).

Nutrition per 100 g from your knowledge of the dish as cooked at home (with oil / ghee). Give macros and the micros you can estimate.

Confidence: high when the dish and portion are clear, medium when the dish is clear but the portion is a guess, low when either is uncertain. If the picture is not food, set is_food=false with an empty items list.`;

const CONF = new Set(["high", "medium", "low"]);

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { image?: string; media_type?: string; note?: string };
  const image = (body.image ?? "").trim();
  if (!image) return NextResponse.json({ error: "No image" }, { status: 400 });
  const mt = (body.media_type ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

  try {
    // 1. Sonnet vision, forced tool.
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2500,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "plate_estimate" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mt, data: image } },
            { type: "text", text: `Estimate this plate.${body.note ? ` The user says: "${String(body.note).slice(0, 300)}"` : ""}` },
          ],
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return NextResponse.json({ error: "Could not read that plate" }, { status: 502 });
    const raw = block.input as { items?: Record<string, unknown>[]; notes?: string[]; plate_note?: string; is_food?: boolean };
    if (raw.is_food === false || !(raw.items ?? []).length) {
      return NextResponse.json({ id: null, items: [], raw: { items: [] }, notes: raw.notes ?? [], plate_note: raw.plate_note || "That doesn't look like food.", photo_path: null } satisfies PlateEstimate);
    }

    // The model's own view, scaled to the portion.
    const rawItems: PlateItem[] = (raw.items ?? []).map((it) => {
      const grams = Math.max(1, Math.round(n(it.grams, 100)));
      const k = grams / 100;
      const m = (it.micros ?? {}) as Record<string, unknown>;
      const micros: ItemMicros = {};
      for (const key of ["fiber_g", "sugar_g", "sodium_mg", "iron_mg", "calcium_mg", "vitamin_c_mg", "potassium_mg"] as const) {
        if (m[key] != null && Number.isFinite(Number(m[key]))) micros[key] = Math.round(Number(m[key]) * k * 10) / 10;
      }
      return {
        name: String(it.name ?? "food").trim(),
        grams,
        confidence: CONF.has(String(it.confidence)) ? (String(it.confidence) as PlateItem["confidence"]) : "medium",
        calories: Math.round(n(it.calories) * k),
        protein_g: Math.round(n(it.protein_g) * k * 10) / 10,
        carbs_g: Math.round(n(it.carbs_g) * k * 10) / 10,
        fat_g: Math.round(n(it.fat_g) * k * 10) / 10,
        micros,
        source: "estimated",
        food_id: null,
      };
    });

    // 2. Cross-validate against the food table (keep the model's grams, take the table's per-100 g).
    const items: PlateItem[] = await Promise.all(
      rawItems.map(async (it) => {
        const hits = await searchFoods(it.name, 3).catch(() => [] as FoodHit[]);
        const top = hits[0];
        if (!top) return it;
        const sim = top.score >= 1 ? 1 : top.score - sourceBonus(top.source);
        if (sim < 0.5) return it;
        const k = it.grams / 100;
        return {
          ...it,
          name: top.source === "custom" || top.source === "dish" ? it.name : it.name,
          calories: Math.round(top.calories * k),
          protein_g: Math.round(top.protein_g * k * 10) / 10,
          carbs_g: Math.round(top.carbs_g * k * 10) / 10,
          fat_g: Math.round(top.fat_g * k * 10) / 10,
          micros: { ...it.micros, ...microsFor(top, it.grams) },
          source: "table",
          food_id: top.id,
        };
      }),
    );

    // 2b. Eaten out? Restaurant words in the note or the model's own description scale every portion
    //     ×1.4 and add the hidden teaspoon of oil to curries / dal / sabzi — same rule as the Quantity sheet.
    const noteText = String(body.note ?? "");
    const restaurant = mentionsRestaurant(`${noteText} ${String(raw.plate_note ?? "")}`);
    const finalItems: PlateItem[] = restaurant
      ? items.map((it) => {
          const k = RESTAURANT_MULTIPLIER;
          const oil = restaurantOil(it.name, null) ? RESTAURANT_OIL_G : 0;
          const micros: ItemMicros = {};
          for (const [key, v] of Object.entries(it.micros ?? {})) if (v != null) micros[key as keyof ItemMicros] = Math.round(v * k * 10) / 10;
          return {
            ...it,
            grams: Math.round(it.grams * k),
            calories: Math.round(it.calories * k + oil * 8.84),
            protein_g: Math.round(it.protein_g * k * 10) / 10,
            carbs_g: Math.round(it.carbs_g * k * 10) / 10,
            fat_g: Math.round((it.fat_g * k + oil) * 10) / 10,
            micros,
            cooked_in: "restaurant",
          };
        })
      : items;

    // 3. Store the photo and the estimate.
    let photo_path: string | null = null;
    try {
      const path = `${user.id}/${randomUUID()}.jpg`;
      const { error } = await admin.storage.from("meal-photos").upload(path, Buffer.from(image, "base64"), { contentType: mt, upsert: false });
      if (!error) photo_path = path;
    } catch {
      // A failed upload never blocks the estimate.
    }
    const notes = (raw.notes ?? []).map(String);
    if (restaurant) notes.unshift(`Restaurant portion: amounts ×${RESTAURANT_MULTIPLIER}, plus 1 tsp hidden oil on curries, dal and sabzi.`);
    const plate_note = String(raw.plate_note ?? "");
    const portion_hint = restaurant ? ("restaurant" as const) : null;
    const report = { kind: "photo", items: finalItems, raw: { items: rawItems }, notes, plate_note, photo_path, portion_hint };
    const id = await saveScan(admin, {
      userId: user.id,
      kind: "photo",
      lens: "protein",
      product: plate_note || finalItems.map((i) => i.name).join(", "),
      verdict: "",
      report,
      imagePath: photo_path,
    });
    const result: PlateEstimate = { id, items: finalItems, raw: { items: rawItems }, notes, plate_note, photo_path, portion_hint };
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Photo estimate failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
