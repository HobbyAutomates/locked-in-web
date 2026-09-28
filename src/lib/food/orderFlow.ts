import type { AdminClient } from "@/lib/apiAuth";
import { run } from "@/lib/ai/router";
import type { JsonSchema } from "@/lib/ai/types";
import { FlowError, mediaType } from "@/lib/scanFlows";
import { remainingToday } from "@/lib/menuFlow";
import { rankMenu } from "@/lib/menuScan";
import { effectiveDietMode, isDietMode, type DietMode } from "@/lib/dietModes";
import { ageYears } from "@/lib/goals";
import type { Remaining } from "@/lib/whatToEat";
import { toUsageEntry, type UsageEntry } from "@/lib/usage";
import { orderPlan, parseOrderText, type OrderDish, type OrderPlan } from "./orderHelper";

/**
 * v2.18 A4 restaurant and delivery helper, the server half. A pasted Swiggy / Zomato order (text)
 * or a screenshot of one (image) → the dishes with a quantity and honest per-portion ranges, the
 * diet-mode check, and a plan for what's left today (orderHelper.orderPlan). Uses the menu scan's
 * router tasks (menu_vision, then menu_vision_hard when the cheap read finds nothing). Nothing is
 * saved here: "Pre-log" is the normal meal save on the client.
 */

const SYSTEM = `You read food delivery orders (Swiggy, Zomato, EatSure, restaurant bills) for an Indian nutrition app and estimate nutrition for each ordered dish.

For every food or drink line (skip delivery fees, taxes, packaging, tips, discounts, totals and addresses):
- name as the restaurant wrote it (fix obvious OCR slips), qty = how many were ordered (1 when not shown), and a short description of what it usually is.
- the usual single restaurant portion of ONE unit ("1 plate", "1 naan", "half", "6 pieces") and its weight in grams.
- kcal_low / kcal_high and protein_low / protein_high for ONE unit. Restaurant and delivery food uses more oil, ghee, butter and cream than home cooking; price that in, and keep ranges honest (wider when the dish varies).
- carbs_g and fat_g for one unit at the middle of the range.
- confidence: high for standard dishes with a clear name, medium when the recipe varies, low for unclear names; "why" in one short line.
- veg (true / false) and "contains": any of meat, fish, egg, dairy, onion_garlic, root_veg, honey.
If there is no food order in it, return is_order false with no dishes and a one-line note.`;

const DISH = {
  type: "object",
  properties: {
    name: { type: "string" },
    qty: { type: "number" },
    description: { type: "string" },
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
  },
  required: ["name", "qty", "portion", "kcal_low", "kcal_high", "protein_low", "protein_high", "confidence"],
};
const SCHEMA: JsonSchema = {
  type: "object",
  properties: { is_order: { type: "boolean" }, restaurant: { type: "string" }, note: { type: "string" }, dishes: { type: "array", items: DISH } },
  required: ["is_order", "dishes"],
} as unknown as JsonSchema;

type Raw = { is_order?: boolean; restaurant?: string; note?: string; dishes?: Record<string, unknown>[] };
const isRaw = (v: unknown): v is Raw => !!v && typeof v === "object" && Array.isArray((v as Raw).dishes);

export type OrderResult = { kind: "order"; restaurant: string | null; note: string; dishes: OrderDish[]; plan: OrderPlan; remaining: Remaining; diet_mode: DietMode };

export async function orderFlow(input: { admin: AdminClient; userId: string; text?: string | null; image?: string | null; mediaType?: string | null; remaining?: Partial<Remaining> | null }): Promise<OrderResult & { usage: UsageEntry[] }> {
  const text = String(input.text ?? "").trim().slice(0, 4000);
  const image = String(input.image ?? "").replace(/^data:[^,]*,/, "").trim();
  if (!text && !image) throw new FlowError("Paste the order or add a screenshot", 400);
  if (image.length > 8_000_000) throw new FlowError("That screenshot is too big. Try again, it gets resized on the way.", 413);

  const [{ data: prof }, modeRow] = await Promise.all([
    input.admin.from("profiles").select("calorie_target, protein_target_g, carb_target_g, fat_target_g, dob").eq("id", input.userId).maybeSingle(),
    input.admin.from("profiles").select("diet_mode").eq("id", input.userId).maybeSingle(),
  ]);
  const p = (prof ?? {}) as { calorie_target?: number; protein_target_g?: number; carb_target_g?: number | null; fat_target_g?: number | null; dob?: string | null };
  const stored = modeRow.error ? null : (modeRow.data as { diet_mode?: unknown } | null)?.diet_mode;
  const mode: DietMode = effectiveDietMode(isDietMode(stored) ? stored : "balanced", ageYears(p.dob ?? null));
  const base = await remainingToday(input.admin, input.userId, { calorie_target: Number(p.calorie_target) || 2200, protein_target_g: Number(p.protein_target_g) || 120, carb_target_g: p.carb_target_g ?? null, fat_target_g: p.fat_target_g ?? null });
  const remaining: Remaining = { ...base, ...Object.fromEntries(Object.entries(input.remaining ?? {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0)) };

  // Text: the deterministic pre-pass finds the dish lines and quantities; the model only prices them.
  const lines = text ? parseOrderText(text) : [];
  const prompt = image
    ? `Read this order screenshot.${text ? ` The person adds: ${text.slice(0, 300)}` : ""}`
    : lines.length
      ? `The order (quantity × dish):\n${lines.map((l) => `${l.qty} × ${l.name}`).join("\n")}\n\nPrice each dish; keep these names and quantities.`
      : `The pasted order:\n${text}`;
  const req = { kind: "json" as const, system: SYSTEM, ...(image ? { images: [{ mediaType: mediaType(input.mediaType), base64: image }] } : {}), text: prompt, maxTokens: 4000, schema: SCHEMA, schemaName: "order_report" };
  const usage: UsageEntry[] = [];
  let raw: Raw | null = null;
  try {
    const r = await run<Raw>("menu_vision", req, isRaw);
    usage.push(toUsageEntry("menu_vision", r.model, r.usage));
    raw = r.data;
  } catch (e) {
    console.error("[orderFlow] menu_vision failed, trying menu_vision_hard", e instanceof Error ? e.message : e);
  }
  if (!raw || (raw.is_order !== false && !(raw.dishes ?? []).length)) {
    const r = await run<Raw>("menu_vision_hard", req, isRaw);
    usage.push(toUsageEntry("menu_vision_hard", r.model, r.usage));
    raw = r.data;
  }

  const rawDishes = raw?.dishes ?? [];
  const { dishes } = rankMenu(rawDishes, remaining, mode);
  const qtyByName = new Map<string, number>();
  for (const d of rawDishes) {
    const name = String(d.name ?? "").toLowerCase().trim();
    const fromText = lines.find((l) => l.name.toLowerCase() === name)?.qty;
    const q = Math.round(Number(fromText ?? d.qty) || 1);
    qtyByName.set(name, Math.max(1, Math.min(20, q)));
  }
  const withQty: OrderDish[] = dishes.map((d) => ({ ...d, qty: qtyByName.get(d.name.toLowerCase()) ?? 1 }));
  const plan = orderPlan(withQty, remaining);
  const restaurant = typeof raw?.restaurant === "string" && raw.restaurant.trim() ? raw.restaurant.trim().slice(0, 60) : null;
  const note = typeof raw?.note === "string" ? raw.note.trim().slice(0, 200) : "";
  return { kind: "order", restaurant, note: withQty.length ? note : note || "Couldn't find any dishes in that. Paste the item lines, or add a screenshot of the order.", dishes: withQty, plan, remaining, diet_mode: mode, usage };
}
