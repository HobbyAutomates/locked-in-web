import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { webCheckPlateItem } from "@/lib/plateMatch";
import { webLookup, WEB_LOOKUP_TIMEOUT_MS } from "@/lib/webFood";
import { applyVoiceAmounts, applyVoiceOil, dropUnpriced, parseVoice } from "@/lib/food/voicePlate";
import type { PlateItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * v2.18 A1 "after the photo": add spoken details to a plate that's already on screen, without a
 * second vision call. Web (cookie) and Android (Bearer) both call it.
 *
 *   POST { items: PlateItem[], voice: "2 roti, less oil, extra dal", plate_note? }
 *   → { items: PlateItem[], changes: string[], notes: string[] }
 *
 * Counts / katoris / extra / less / none rescale the items (their numbers scale with the grams);
 * foods the photo missed are looked up on the web (food_web_lookup) like every photo item; oil cues
 * apply last. A voice-added food the web can't price is left out with a note (never logged at 0).
 */
export async function POST(req: Request) {
  const { user } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { items?: unknown; voice?: string; plate_note?: string };
  const voice = String(body.voice ?? "").trim().slice(0, 400);
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter(isPlateItem)
    .slice(0, 20)
    .map((it): PlateItem => ({
      ...it,
      grams: Number(it.grams),
      calories: Number(it.calories),
      protein_g: Number(it.protein_g) || 0,
      carbs_g: Number(it.carbs_g) || 0,
      fat_g: Number(it.fat_g) || 0,
      micros: it.micros && typeof it.micros === "object" ? it.micros : {},
      confidence: it.confidence === "high" || it.confidence === "low" ? it.confidence : "medium",
      source: it.source === "table" ? "table" : "estimated",
      food_id: typeof it.food_id === "string" ? it.food_id : null,
    }));
  if (!voice) return NextResponse.json({ error: "Say something about the plate first" }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "No plate to add that to" }, { status: 400 });

  const spoken = parseVoice(voice);
  const amounts = applyVoiceAmounts(items, spoken);
  const context = `Seen on a meal photo (usually home-cooked Indian food in Bengaluru).${body.plate_note ? ` The plate: ${String(body.plate_note).slice(0, 160)}.` : ""} The person says: "${voice.slice(0, 200)}".`;
  const looked = await Promise.all(
    amounts.items.map((it, i) =>
      amounts.added.includes(i) && process.env.ANTHROPIC_API_KEY ? webCheckPlateItem(it, { web: (name, ctx) => webLookup(name, { context: ctx, timeoutMs: WEB_LOOKUP_TIMEOUT_MS }) }, context) : Promise.resolve(it),
    ),
  );
  const oiled = applyVoiceOil(looked, spoken);
  const priced = dropUnpriced(oiled.items);
  const changes = [...amounts.changes, ...oiled.changes];
  return NextResponse.json({ items: priced.items, changes: changes.length ? changes : [], notes: changes.length ? priced.notes : ["Didn't catch any amounts in that. Try \"2 roti, less oil\"."] });
}

function isPlateItem(v: unknown): v is PlateItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === "string" && Number.isFinite(Number(o.grams)) && Number.isFinite(Number(o.calories));
}
