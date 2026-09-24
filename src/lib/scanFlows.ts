import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { AdminClient } from "@/lib/apiAuth";
import { isAcceptableMatch, microsFor, searchFoods, type FoodHit } from "@/lib/foodSearch";
import { TRANSCRIBE, analyseTranscript, fetchOff, lensFor, loadScanProfile, offComplete, offPer100g, offTranscript, saveScan, unreadableReport, type OffProduct } from "@/lib/labelAnalysis";
import { extractBarcode, parseNutritionLabel, roundPer100, sanityCheckPer100 } from "@/lib/labelParse";
import { liveLookup } from "@/lib/liveFood";
import { RESTAURANT_MULTIPLIER, RESTAURANT_OIL_G, mentionsRestaurant, restaurantOil } from "@/lib/quantity";
import { scanName } from "@/lib/scanNames";
import type { ItemMicros, PlateEstimate, PlateItem } from "@/lib/types";

/**
 * The three scan pipelines (label, barcode, plate photo) as plain functions, so the original
 * routes (/api/scan-label, /api/scan-barcode, /api/photo-meal, still used by the Android app) and
 * the one-button /api/scan share exactly the same code. Each returns the JSON body its route
 * sends; a `FlowError` carries a non-500 status.
 */

export class FlowError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type MediaType = "image/jpeg" | "image/png" | "image/webp";

/**
 * v2.2: store the browser's <= 320 px JPEG thumbnail of a scan at scan-photos/<uid>/<scan id>.jpg
 * (service role, upsert) and point label_scans.thumb_path at it. Best-effort: a missing or broken
 * thumb never fails the scan (old Android clients never send one). Returns the path or null.
 */
export async function attachThumb(admin: AdminClient, userId: string, scanId: string | null, thumb: string | null | undefined): Promise<string | null> {
  const b64 = String(thumb ?? "")
    .replace(/^data:[^,]*,/, "")
    .trim();
  if (!scanId || !b64) return null;
  // A 320 px JPEG is ~15-40 KB; anything far bigger isn't a thumbnail.
  if (b64.length > 700_000) return null;
  try {
    const path = `${userId}/${scanId}.jpg`;
    const up = await admin.storage.from("scan-photos").upload(path, Buffer.from(b64, "base64"), { contentType: "image/jpeg", upsert: true });
    if (up.error) {
      console.error("[attachThumb] upload failed", { scanId, error: up.error });
      return null;
    }
    const { error } = await admin.from("label_scans").update({ thumb_path: path }).eq("id", scanId).eq("user_id", userId);
    if (error) {
      console.error("[attachThumb] thumb_path update failed", { scanId, error });
      return null;
    }
    return path;
  } catch (e) {
    console.error("[attachThumb] threw", e);
    return null;
  }
}
export const mediaType = (mt?: string | null): MediaType => (mt === "image/png" || mt === "image/webp" ? mt : "image/jpeg");

function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new FlowError("ANTHROPIC_API_KEY is not set", 500);
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** The vision model every scan route uses (transcription, barcode digits, plate estimates, the classifier). */
export const VISION_MODEL = "claude-sonnet-5";

// ---------------------------------------------------------------------------------------------
// Label: OCR transcript (phone, classifier or Sonnet) -> analysis -> label_report
// ---------------------------------------------------------------------------------------------

/** Below this many characters the on-device OCR is treated as a failed read. */
const OCR_MIN_CHARS = 120;

export async function labelFlow(input: {
  admin: AdminClient;
  userId: string;
  image?: string | null;
  mediaType?: string | null;
  /** On-device OCR from the phone. */
  text?: string | null;
  /** A transcript already made from this image (the /api/scan classifier), skipping the Sonnet read. */
  transcript?: string | null;
  note?: string | null;
  lens?: string | null;
  /** v2.2: optional <= 320 px JPEG thumbnail (base64) from the browser. */
  thumb?: string | null;
}): Promise<Record<string, unknown>> {
  const ocrText = (input.text ?? "").trim();
  if (!input.image && ocrText.length === 0 && !input.transcript) throw new FlowError("No image", 400);
  const mt = mediaType(input.mediaType);
  const profile = await loadScanProfile(input.admin, input.userId);
  const lens = lensFor(profile.goal_type, input.lens, profile.lens_default);
  const client = anthropic();

  // 1. Transcribe. The phone's own OCR wins when it read enough AND it actually contains a
  //    nutrition table (front-of-pack marketing text — "Omega Loaded Mix Seeds... Protein..." —
  //    can clear the character count without ever showing a number, so it doesn't count as a
  //    usable label read on its own); otherwise a transcript the classifier already made; else
  //    Sonnet looks at the photo, which is the only way to actually get to the back-of-pack table.
  const ocrHasTable = parseNutritionLabel(ocrText).hasTable;
  const fromPhone = ocrText.length >= OCR_MIN_CHARS && (ocrHasTable || !input.image);
  let transcript = fromPhone ? ocrText : (input.transcript ?? "").trim();
  if (!transcript) {
    if (!input.image) throw new FlowError("Couldn't read enough text — retake the photo.", 400);
    const t = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 2000,
      system: TRANSCRIBE,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: input.image } }, { type: "text", text: "Transcribe this label." }] }],
    });
    transcript = t.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("\n")
      .trim();
  }
  if (!transcript || transcript.startsWith("NOT_A_LABEL")) {
    return unreadableReport(transcript.replace("NOT_A_LABEL", "").trim() || "Couldn't read a food label in that photo.", transcript);
  }

  const { report, analysis } = await analyseTranscript({ client, transcript, note: input.note ?? undefined, lens, profile, fromPhoneOcr: fromPhone, kind: "label" });

  // 2. The parser is the source of truth for per_100g, never the model. No table -> no numbers.
  const parsed = parseNutritionLabel(transcript);
  applyParsedNutrition(report, parsed);
  // A label transcript sometimes carries the barcode digits too ("8 i9 0 6..."); recover them
  // opportunistically so the scan isn't barcode-less when it didn't need to be.
  if (!report.barcode) {
    const digits = extractBarcode(transcript);
    if (digits) report.barcode = digits;
  }

  // Never store "<UNKNOWN>" or a blank name: the model's name, else the first ingredient, else "Unnamed label".
  const product = scanName("label", { model: report.product, ingredients: transcript });
  const full = { ...report, product, kind: "label", lens, transcript, analysis };
  const id = await saveScan(input.admin, {
    userId: input.userId,
    kind: "label",
    lens,
    product,
    verdict: String(report.verdict ?? ""),
    report: full,
  });
  const thumb_path = await attachThumb(input.admin, input.userId, id, input.thumb);
  return { id, ...report, product, kind: "label", lens, transcript, thumb_path };
}

/**
 * Overwrites `report.per_100g` (and related per-serving fields) with the parser's own numbers,
 * or clears them with a `needs_back_of_pack` flag when the transcript has no real nutrition
 * table. Mutates `report` in place; shared by labelFlow and, for the OFF path, barcodeFlow.
 */
function applyParsedNutrition(report: Record<string, unknown>, parsed: ReturnType<typeof parseNutritionLabel>): void {
  if (parsed.coreComplete) {
    const gate = sanityCheckPer100(parsed.per_100g);
    if (gate.ok) {
      report.per_100g = roundPer100(parsed.per_100g);
      report.nutrition_source = "label";
      report.needs_back_of_pack = false;
      if (parsed.serving_g && !((report.serving_g as number | null | undefined) ?? 0)) report.serving_g = parsed.serving_g;
      return;
    }
  }
  // No table, or the numbers we found don't check out: never let a fabricated/implausible
  // per_100g through. Clear it and tell the user what to do instead.
  delete report.per_100g;
  report.nutrition_source = null;
  report.needs_back_of_pack = true;
  const hint = "Flip the pack and scan the Nutrition Facts table for real numbers.";
  report.verdict_reason = report.verdict_reason && String(report.verdict_reason).trim() ? `${report.verdict_reason} ${hint}` : hint;
  if (report.protein && typeof report.protein === "object") delete (report.protein as Record<string, unknown>).per_serving_g;
  if (report.infographic && typeof report.infographic === "object") {
    const info = report.infographic as Record<string, unknown>;
    info.serving_share = { protein_pct: 0, carbs_pct: 0, fat_pct: 0, calories_pct: 0 };
    info.sugar_teaspoons_per_serving = 0;
    info.sodium_pct_of_2000mg = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Barcode: digits (given, or read off the photo) -> Open Food Facts (cached) -> the label analysis
// ---------------------------------------------------------------------------------------------

const CACHE_DAYS = 30;

/** The digits printed under a barcode, read by the vision model. "" when none are legible. */
export async function readBarcodeDigits(image: string, mt: MediaType): Promise<string> {
  const m = await anthropic().messages.create({
    model: VISION_MODEL,
    max_tokens: 60,
    system: "You read retail barcodes. Reply with ONLY the digits printed under the barcode (EAN-13, EAN-8 or UPC), no spaces. If no barcode digits are legible, reply NONE.",
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: image } }, { type: "text", text: "Digits?" }] }],
  });
  return m.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("")
    .replace(/\D/g, "");
}

export async function barcodeFlow(input: {
  admin: AdminClient;
  userId: string;
  barcode?: string | null;
  image?: string | null;
  mediaType?: string | null;
  note?: string | null;
  lens?: string | null;
  /** v2.2: optional thumbnail of the photo; only kept when OFF has no product image. */
  thumb?: string | null;
}): Promise<Record<string, unknown>> {
  let barcode = String(input.barcode ?? "").replace(/\D/g, "");
  // No digits but a photo: iPhone Safari has no barcode reader, and ZXing in the browser can miss a
  // curved or glossy pack. The digits are printed under the bars, so let the vision model read them.
  if (barcode.length < 8 && input.image) barcode = await readBarcodeDigits(input.image, mediaType(input.mediaType));
  if (barcode.length < 8 || barcode.length > 14) {
    return { found: false, barcode, kind: "barcode", message: barcode ? "That doesn't look like an EAN/UPC barcode" : "Couldn't read the barcode digits - get the numbers under the bars sharp and well lit, or type them." };
  }

  const profile = await loadScanProfile(input.admin, input.userId);
  const lens = lensFor(profile.goal_type, input.lens, profile.lens_default);

  // 1. Cache, then Open Food Facts. A record only gets cached once its own per-100g numbers pass
  //    the sanity gate below — the True Elements Muesli bug was exactly a bad OFF record (mis-scaled
  //    per-serving data reported as per-100g: 1037 kcal, 177.75 g carbs) cached and shown unchecked.
  let product: OffProduct | null = null;
  const { data: cached } = await input.admin.from("barcode_cache").select("product, fetched_at").eq("barcode", barcode).maybeSingle();
  const fresh = cached && Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_DAYS * 86400e3;
  if (fresh && cached?.product && (cached.product as OffProduct).product_name) product = cached.product as OffProduct;
  if (!product) {
    const fetched = await fetchOff(barcode);
    if (fetched && offPer100g(fetched).per_100g) {
      await input.admin.from("barcode_cache").upsert({ barcode, product: fetched, fetched_at: new Date().toISOString() });
      product = fetched;
    } else if (fetched) {
      // Fetched, but its nutrition numbers don't check out: use it for name/ingredients (below,
      // per_100g gets cleared) but never cache it, so a later fix to OFF's data isn't shadowed.
      product = fetched;
    } else if (cached?.product && (cached.product as OffProduct).product_name) {
      product = cached.product as OffProduct;
    }
  }
  if (!product) return { found: false, barcode, kind: "barcode", lens, message: "Not in the database yet — scan the label instead." };

  const gated = offPer100g(product);

  // 2-3. Same analysis + structuring as a label. A complete OFF record (ingredients + full
  // nutrition) only needs one search at most — recall / counterfeit checks.
  const transcript = offTranscript(product);
  const { report, analysis } = await analyseTranscript({ client: anthropic(), transcript, note: input.note ?? undefined, lens, profile, kind: "barcode", maxSearches: offComplete(product) ? 1 : 2 });
  const reasonBefore = report.verdict_reason && String(report.verdict_reason).trim() ? String(report.verdict_reason) : "";
  applyParsedNutrition(report, { per_100g: gated.per_100g ?? {}, per_serving: {}, serving_g: null, hasTable: gated.per_100g != null, coreComplete: gated.per_100g != null });
  if (gated.per_100g) {
    report.nutrition_source = "openfoodfacts";
  } else {
    // Overwrite the generic "no table" hint applyParsedNutrition just added with the OFF-specific one.
    report.verdict_reason = reasonBefore
      ? `${reasonBefore} Open Food Facts' numbers for this product didn't check out (${gated.reasons[0] ?? "inconsistent"}) — scan the label for real numbers.`
      : "Open Food Facts' numbers for this product didn't check out — scan the label for real numbers.";
  }
  const image_url = product.image_url ?? null;
  const productName = scanName("barcode", { model: report.product, off: product.product_name, ingredients: product.ingredients_text });
  const full = { ...report, product: productName, kind: "barcode", lens, barcode, image_url, transcript, analysis };
  const id = await saveScan(input.admin, {
    userId: input.userId,
    kind: "barcode",
    lens,
    product: productName,
    verdict: String(report.verdict ?? ""),
    report: full,
    imageUrl: image_url,
  });
  // The OFF pack shot is the better history picture; the photo of the bars only fills in without one.
  const thumb_path = image_url ? null : await attachThumb(input.admin, input.userId, id, input.thumb);
  return { id, found: true, ...report, product: productName, kind: "barcode", lens, barcode, image_url, transcript, thumb_path };
}

// ---------------------------------------------------------------------------------------------
// Plate: a photo of a meal -> per-item grams + macros + micros, cross-checked against the food table
// ---------------------------------------------------------------------------------------------

const MICRO = { type: "number" } as const;
const PLATE_TOOL: Anthropic.Tool = {
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

const PLATE_SYSTEM = `You estimate the food on a plate from one photo for a 17-year-old in Bengaluru who eats mostly home-cooked Indian food, plus some Western meals.

Identify each distinct food and call it by its real name — Indian dishes by their actual names ("dal tadka", "jeera rice", "aloo gobi", "roti", "curd", "paneer bhurji", "rajma", "sambar", "idli", "poha"), Western ones plainly ("grilled chicken breast", "scrambled eggs", "toast"). Never invent a dish you cannot see; combine what is clearly one dish into one item.

Portion in grams. Use these as scale: a dinner plate is ~27 cm across, a roti ~18 cm, a katori (small steel bowl) holds ~150 ml, a tablespoon ~15 g, a hand's palm ~100 g of meat. Typical portions: roti 40 g each, paratha 80 g, idli 40 g, dosa 100 g, egg 50 g, a katori of dal or sabzi 150 g, a heap of rice on a plate 150–200 g, a piece of paneer 30 g. Count items you can count (3 rotis = 120 g).

Nutrition per 100 g from your knowledge of the dish as cooked at home (with oil / ghee). Give macros and the micros you can estimate.

Confidence: high when the dish and portion are clear, medium when the dish is clear but the portion is a guess, low when either is uncertain. If the picture is not food, set is_food=false with an empty items list.`;

const CONF = new Set(["high", "medium", "low"]);

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * Plate estimate:
 *   1. Sonnet looks at the picture and is forced to call `plate_estimate`: every item named the way
 *      an Indian would name it, portion in grams using plate / roti / katori / hand as scale.
 *   2. Cross-validate: each item is looked up in bandlog.foods; when a confident match exists the
 *      model's per-100 g numbers are replaced by the table's (grams stay the model's) -> source "table".
 *   3. The JPEG goes to Storage (meal-photos/<user>/<uuid>.jpg) and the estimate to label_scans
 *      kind='photo', so the History list can show it and "Save as meal" can reuse the photo.
 */
export async function plateFlow(input: { admin: AdminClient; userId: string; image: string; mediaType?: string | null; note?: string | null; thumb?: string | null }): Promise<PlateEstimate & { thumb_path?: string | null }> {
  const image = (input.image ?? "").trim();
  if (!image) throw new FlowError("No image", 400);
  const mt = mediaType(input.mediaType);
  const note = input.note ?? undefined;
  const admin = input.admin;
  const userId = input.userId;
  const client = anthropic();
  // 1. Sonnet vision, forced tool.
  const msg = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 2500,
    system: PLATE_SYSTEM,
    tools: [PLATE_TOOL],
    tool_choice: { type: "tool", name: "plate_estimate" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mt, data: image } },
          { type: "text", text: `Estimate this plate.${note ? ` The user says: "${String(note).slice(0, 300)}"` : ""}` },
        ],
      },
    ],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new FlowError("Could not read that plate", 502);
  const raw = block.input as { items?: Record<string, unknown>[]; notes?: string[]; plate_note?: string; is_food?: boolean };
  if (raw.is_food === false || !(raw.items ?? []).length) {
    return { id: null, items: [], raw: { items: [] }, notes: raw.notes ?? [], plate_note: raw.plate_note || "That doesn't look like food.", photo_path: null } satisfies PlateEstimate;
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
  //    A hit is only accepted when isAcceptableMatch says it's really the same food — a single
  //    ingredient like "cucumber" must never be replaced by a composite dish's numbers just
  //    because the dish's name happens to share a word ("cold cucumber cream soup"). When there's
  //    no acceptable table row, fall back to a live AI nutrition lookup (liveFood.ts) rather than
  //    silently keeping a table match that doesn't fit; if that also comes up empty, the model's
  //    own plate estimate stands.
  const items: PlateItem[] = await Promise.all(
    rawItems.map(async (it) => {
      const hits = await searchFoods(it.name, 3).catch(() => [] as FoodHit[]);
      const top = hits[0];
      const match = top && isAcceptableMatch(it.name, top) ? top : await liveLookup(it.name).catch(() => null);
      if (!match) return it;
      const k = it.grams / 100;
      return {
        ...it,
        calories: Math.round(match.calories * k),
        protein_g: Math.round(match.protein_g * k * 10) / 10,
        carbs_g: Math.round(match.carbs_g * k * 10) / 10,
        fat_g: Math.round(match.fat_g * k * 10) / 10,
        micros: { ...it.micros, ...microsFor(match, it.grams) },
        source: "table",
        food_id: match.id,
      };
    }),
  );

  // 2b. Eaten out? Restaurant words in the note or the model's own description scale every portion
  //     ×1.4 and add the hidden teaspoon of oil to curries / dal / sabzi — same rule as the Quantity sheet.
  const noteText = String(note ?? "");
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
    const path = `${userId}/${randomUUID()}.jpg`;
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
    userId: userId,
    kind: "photo",
    lens: "protein",
    product: scanName("photo", { model: plate_note, off: finalItems.map((i) => i.name).join(", ") }),
    verdict: "",
    report,
    imagePath: photo_path,
  });
  const thumb_path = await attachThumb(admin, userId, id, input.thumb);
  const result: PlateEstimate & { thumb_path: string | null } = { id, items: finalItems, raw: { items: rawItems }, notes, plate_note, photo_path, portion_hint, thumb_path };
  return result;
}

// ---------------------------------------------------------------------------------------------
// The one-button classifier: barcode / label / plate, in one vision call
// ---------------------------------------------------------------------------------------------

export type ScanKind = "barcode" | "label" | "plate";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "scan_kind",
  description: "Say what the photo shows so the app can run the right scan.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["barcode", "label", "plate", "other"],
        description:
          "barcode = a retail barcode is the main subject; label = a pack's nutrition table, ingredients list or front of pack; plate = cooked food or a meal on a plate / in a bowl; other = none of these",
      },
      barcode_digits: { type: "string", description: "Only for barcode: the digits printed under the bars, no spaces. Empty when not legible." },
      has_label_text: { type: "boolean", description: "true when a nutrition table or ingredients list is legible anywhere in the photo (even next to a barcode)" },
      transcript: {
        type: "string",
        description:
          "When has_label_text is true: transcribe EVERYTHING legible on the label verbatim (product, brand, ingredients with %, allergens, serving size, the full nutrition table, claims, FSSAI number), with headings; [unreadable] where cut off or glared. Otherwise empty.",
      },
      summary: { type: "string", description: "One short line: what the photo shows" },
    },
    required: ["kind", "has_label_text", "summary"],
  },
};

export type Classified = { kind: ScanKind | "other"; barcode: string; hasLabel: boolean; transcript: string; summary: string };

/**
 * One forced tool call on the photo: which scan it is, the barcode digits when it's a barcode,
 * and — when a label is legible — the OCR transcript, so the label path needs no second read.
 */
export async function classifyScan(image: string, mt: MediaType): Promise<Classified> {
  const m = await anthropic().messages.create({
    model: VISION_MODEL,
    max_tokens: 2500,
    system:
      "You triage food photos for a nutrition app. Decide whether the photo is a retail barcode, a packaged-food label, or a plate of food, and call scan_kind exactly once. Transcribe label text only when it is legible; never guess numbers.",
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "scan_kind" },
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: image } }, { type: "text", text: "What is this?" }] }],
  });
  const block = m.content.find((b) => b.type === "tool_use");
  const raw = (block && block.type === "tool_use" ? block.input : {}) as { kind?: string; barcode_digits?: string; has_label_text?: boolean; transcript?: string; summary?: string };
  const kind = raw.kind === "barcode" || raw.kind === "label" || raw.kind === "plate" ? raw.kind : "other";
  const transcript = String(raw.transcript ?? "").trim();
  return {
    kind,
    barcode: String(raw.barcode_digits ?? "").replace(/\D/g, ""),
    hasLabel: raw.has_label_text === true && transcript.length > 40,
    transcript,
    summary: String(raw.summary ?? "").trim(),
  };
}
