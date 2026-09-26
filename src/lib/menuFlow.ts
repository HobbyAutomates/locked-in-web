import type { AdminClient } from "@/lib/apiAuth";
import { run } from "@/lib/ai/router";
import type { JsonSchema } from "@/lib/ai/types";
import { attachThumb, FlowError, mediaType } from "@/lib/scanFlows";
import { toUsageEntry, type UsageEntry } from "@/lib/usage";
import { today as todayIso } from "@/lib/dates";
import { ageYears } from "@/lib/goals";
import { effectiveDietMode, isDietMode, type DietMode } from "@/lib/dietModes";
import { rankMenu, type MenuScanResult } from "@/lib/menuScan";
import type { Remaining } from "@/lib/whatToEat";

/**
 * v2.13 restaurant menu scan (spec §10): a photo of a menu → the dishes with kcal / protein ranges
 * per portion, a confidence each, and a best pick for what's left today and the diet mode.
 *
 * Model: the router's `menu_vision` task (Claude Haiku) first; when that call fails or finds no
 * dishes, `menu_vision_hard` (Sonnet) reads it again — the same cheap-first pattern as the label
 * scan. Every call logs its `llm_usage` line (router) and the usage rides along in the saved report.
 * The scan is saved to label_scans with kind 'menu' (schema_v36); before v36 the insert is refused
 * by the kind check, and the scan still comes back (just without an id / History row).
 */

const SYSTEM = `You read photos of restaurant menus, mostly in India (dhabas, cafes, QSR chains, udupi places, biryani houses), and estimate nutrition for each dish.

For every dish you can read (up to 30, skip drinks unless they're the only items, skip section headings):
- name exactly as printed (fix obvious OCR slips), a short description of what it usually is, and its menu section if shown.
- the usual single restaurant portion ("1 plate", "half", "6 pieces", "1 bowl") and its weight in grams.
- kcal_low / kcal_high and protein_low / protein_high for that portion. Restaurant food uses more oil, ghee, butter and cream than home cooking; price that in. Keep ranges honest: wider when the dish varies a lot.
- carbs_g and fat_g at the middle of the range.
- confidence: high for standard dishes with a clear name, medium for common dishes whose recipe varies, low for unclear names or house specials; "why" is one short line saying why.
- veg (true / false) and "contains": any of meat, fish, egg, dairy, onion_garlic, root_veg, honey that the dish normally has.
- price as printed, if visible.
If the photo is not a menu, return is_menu false, no dishes and a one-line note saying what it looks like.`;

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    is_menu: { type: "boolean" },
    restaurant: { type: "string", description: "The restaurant's name if printed, else empty" },
    note: { type: "string", description: "One line about the menu or the photo" },
    dishes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          section: { type: "string" },
          portion: { type: "string" },
          grams: { type: "number" },
          kcal_low: { type: "number" },
          kcal_high: { type: "number" },
          protein_low: { type: "number" },
          protein_high: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          why: { type: "string" },
          veg: { type: "boolean" },
          contains: { type: "array", items: { type: "string", enum: ["meat", "fish", "egg", "dairy", "onion_garlic", "root_veg", "honey"] } },
          price: { type: "string" },
        },
        required: ["name", "portion", "kcal_low", "kcal_high", "protein_low", "protein_high", "confidence"],
      },
    },
  },
  required: ["is_menu", "dishes"],
};

type Raw = { is_menu?: boolean; restaurant?: string; note?: string; dishes?: unknown[] };
const isRaw = (v: unknown): v is Raw => !!v && typeof v === "object" && Array.isArray((v as Raw).dishes);

/** What's left today for this user (calorie target minus today's meals), for the best pick. */
async function remainingToday(admin: AdminClient, userId: string, p: { calorie_target: number; protein_target_g: number; carb_target_g: number | null; fat_target_g: number | null }): Promise<Remaining> {
  const { data } = await admin.from("meals").select("meal_items(calories, protein_g, carbs_g, fat_g)").eq("user_id", userId).eq("date", todayIso());
  const eaten = { k: 0, p: 0, c: 0, f: 0 };
  for (const m of (data ?? []) as { meal_items: { calories: unknown; protein_g: unknown; carbs_g: unknown; fat_g: unknown }[] | null }[])
    for (const i of m.meal_items ?? []) {
      eaten.k += Number(i.calories) || 0;
      eaten.p += Number(i.protein_g) || 0;
      eaten.c += Number(i.carbs_g) || 0;
      eaten.f += Number(i.fat_g) || 0;
    }
  const fat = p.fat_target_g ?? Math.trunc((p.calorie_target * 0.25) / 9);
  const carbs = p.carb_target_g ?? Math.max(0, Math.trunc((p.calorie_target - p.protein_target_g * 4 - fat * 9) / 4));
  return {
    kcal: Math.max(0, Math.round(p.calorie_target - eaten.k)),
    protein: Math.max(0, Math.round(p.protein_target_g - eaten.p)),
    carbs: Math.max(0, Math.round(carbs - eaten.c)),
    fat: Math.max(0, Math.round(fat - eaten.f)),
  };
}

export async function menuFlow(input: {
  admin: AdminClient;
  userId: string;
  image: string;
  mediaType?: string | null;
  note?: string | null;
  thumb?: string | null;
  /** Optional overrides (Android may send what it already computed). */
  remaining?: Partial<Remaining> | null;
  dietMode?: string | null;
}): Promise<MenuScanResult & { usage: UsageEntry[] }> {
  const image = (input.image ?? "").replace(/^data:[^,]*,/, "").trim();
  if (!image) throw new FlowError("No image", 400);
  // A downscaled 1600 px JPEG is ~300–600 KB of base64; far bigger means the client skipped it.
  if (image.length > 8_000_000) throw new FlowError("That photo is too big. Try again, it gets resized on the way.", 413);
  const mt = mediaType(input.mediaType);

  const [{ data: prof }, modeRow] = await Promise.all([
    input.admin.from("profiles").select("calorie_target, protein_target_g, carb_target_g, fat_target_g, dob").eq("id", input.userId).maybeSingle(),
    input.admin.from("profiles").select("diet_mode").eq("id", input.userId).maybeSingle(),
  ]);
  const p = (prof ?? {}) as { calorie_target?: number; protein_target_g?: number; carb_target_g?: number | null; fat_target_g?: number | null; dob?: string | null };
  const stored = modeRow.error ? null : (modeRow.data as { diet_mode?: unknown } | null)?.diet_mode;
  const wanted = isDietMode(input.dietMode) ? input.dietMode : isDietMode(stored) ? stored : "balanced";
  const mode: DietMode = effectiveDietMode(wanted, ageYears(p.dob ?? null));
  const base = await remainingToday(input.admin, input.userId, { calorie_target: Number(p.calorie_target) || 2200, protein_target_g: Number(p.protein_target_g) || 120, carb_target_g: p.carb_target_g ?? null, fat_target_g: p.fat_target_g ?? null });
  const remaining: Remaining = { ...base, ...Object.fromEntries(Object.entries(input.remaining ?? {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0)) };

  const usage: UsageEntry[] = [];
  const req = {
    kind: "json" as const,
    system: SYSTEM,
    images: [{ mediaType: mt, base64: image }],
    text: `Read this menu.${input.note ? ` The user adds: ${String(input.note).slice(0, 200)}` : ""}`,
    maxTokens: 4000,
    schema: SCHEMA,
    schemaName: "menu_report",
  };
  let raw: Raw | null = null;
  try {
    const r = await run<Raw>("menu_vision", req, isRaw);
    usage.push(toUsageEntry("menu_vision", r.model, r.usage));
    raw = r.data;
  } catch (e) {
    console.error("[menuFlow] menu_vision failed, trying menu_vision_hard", e instanceof Error ? e.message : e);
  }
  if (!raw || (raw.is_menu !== false && !(raw.dishes ?? []).length)) {
    const r = await run<Raw>("menu_vision_hard", req, isRaw);
    usage.push(toUsageEntry("menu_vision_hard", r.model, r.usage));
    raw = r.data;
  }

  const { dishes, best } = rankMenu(raw?.dishes ?? [], remaining, mode);
  const restaurant = typeof raw?.restaurant === "string" && raw.restaurant.trim() ? raw.restaurant.trim().slice(0, 60) : null;
  const note = typeof raw?.note === "string" ? raw.note.trim().slice(0, 200) : "";
  const result: MenuScanResult = {
    id: null,
    kind: "menu",
    restaurant,
    dishes,
    best_pick_index: best,
    remaining,
    diet_mode: mode,
    note: dishes.length ? note : note || "Couldn't read any dishes. Try a straighter, closer photo of the menu.",
  };

  if (dishes.length) {
    const product = restaurant ?? "Menu scan";
    const verdict = best !== null ? `Best pick: ${dishes[best].name}` : "Nothing fits your diet here";
    // The row's own id / thumb_path live in their columns; the report is everything else.
    const { id: _id, thumb_path: _thumb, ...stored } = result;
    void _id;
    void _thumb;
    const { data, error } = await input.admin.from("label_scans").insert({ user_id: input.userId, kind: "menu", lens: "protein", product, verdict, report: { ...stored, usage } }).select("id").single();
    if (error) console.error("[menuFlow] label_scans insert failed (schema_v36 applied?)", { code: error.code, message: error.message });
    result.id = (data?.id as string | undefined) ?? null;
    result.thumb_path = await attachThumb(input.admin, input.userId, result.id, input.thumb);
  }
  return { ...result, usage };
}
