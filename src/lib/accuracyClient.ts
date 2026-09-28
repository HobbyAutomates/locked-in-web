import { ANALYTICS_ON } from "@/lib/analytics";
import { overrideKey, rescalePer100, rescalePerUnit } from "@/lib/perUnit";
import { APP_VERSION } from "@/lib/version";
import type { MealItem } from "@/lib/types";

/**
 * v2.15 browser side of the accuracy endpoints (docs/v215-api.md). Everything is fire-and-forget:
 * nothing here throws or blocks the UI, and once the server says a table isn't there
 * (`available: false`, schema_v38 not applied) that feature goes quiet for the rest of the session.
 */

export type InputKind = "text" | "photo" | "barcode" | "label" | "manual";
export type LogKind = "log" | "edit" | "delete" | "skip" | "scan_accept" | "scan_dismiss" | "note";

/** The context an item editor needs to file a correction (where the item came from). */
export type AccuracyContext = { inputKind: InputKind; mealId?: string | null; scanId?: string | null; rawInput?: string | null };

const dead = { log: false, corrections: false, overrides: false };

function post(url: string, body: unknown, method = "POST"): Promise<Record<string, unknown> | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
    .catch(() => null);
}

// ---- entry log (batched) -----------------------------------------------------------------------

type QueuedEvent = { kind: LogKind; meal_id?: string | null; item_name?: string | null; payload?: Record<string, unknown> };
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

/** Queue one beta entry-log event; sent in batches every few seconds and when the tab hides. */
export function logEvent(kind: LogKind, e: Omit<QueuedEvent, "kind"> = {}): void {
  if (!ANALYTICS_ON || dead.log || typeof window === "undefined") return;
  try {
    if (queue.length >= 50) queue.shift();
    queue.push({ kind, ...e });
    if (!hooked) {
      hooked = true;
      document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushLog());
    }
    if (!timer) timer = setTimeout(flushLog, 3000);
  } catch {
    // never let logging break the page
  }
}

export function flushLog(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || dead.log) return;
  const events = queue.map((e) => ({ ...e, platform: "web", app_version: APP_VERSION }));
  queue = [];
  void post("/api/log-event", { events, platform: "web" }).then((r) => {
    if (r && r.available === false) dead.log = true;
  });
}

/** The numbers of an item, small enough for a log payload. */
export function nums(i: Pick<MealItem, "name" | "grams" | "calories" | "protein_g" | "carbs_g" | "fat_g"> & { servings?: number | null; source?: string; source_info?: { kind?: string } | null }) {
  return { name: i.name, grams: i.grams, count: i.servings ?? null, kcal: Math.round(i.calories), p: i.protein_g, c: i.carbs_g, f: i.fat_g, source: i.source_info?.kind ?? i.source ?? null };
}

// ---- corrections -------------------------------------------------------------------------------

export function postCorrection(ctx: AccuracyContext, before: MealItem, user: { calories: number; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }, extra: { unit?: string | null; count?: number | null; source?: string; note?: string; remember?: boolean }): void {
  if (dead.corrections) return;
  void post("/api/corrections", {
    meal_id: ctx.mealId ?? null,
    item_name: before.name,
    food_id: before.food_id,
    input_kind: ctx.inputKind,
    grams: before.grams,
    unit: extra.unit ?? null,
    count: extra.count ?? null,
    app: { kcal: before.calories, protein: before.protein_g, carbs: before.carbs_g, fat: before.fat_g },
    user: { kcal: user.calories, protein: user.protein_g ?? null, carbs: user.carbs_g ?? null, fat: user.fat_g ?? null },
    source: extra.source || null,
    note: extra.note || null,
    scan_id: ctx.scanId ?? null,
    raw_input: ctx.rawInput ?? null,
    remember: !!extra.remember,
  }).then((r) => {
    if (r && r.available === false) dead.corrections = true;
  });
}

// ---- per-user overrides ------------------------------------------------------------------------

export type Override = { food_key: string; unit: string; kcal_per_unit: number; protein_per_unit: number | null; carbs_per_unit: number | null; fat_per_unit: number | null };
let overrides: Promise<Map<string, Override>> | null = null;

const okey = (food_key: string, unit: string) => `${food_key}|${unit.toLowerCase()}`;

/** All of the person's overrides, fetched once per page load (empty until schema_v38). */
export function loadOverrides(): Promise<Map<string, Override>> {
  if (typeof window === "undefined") return Promise.resolve(new Map());
  overrides ??= fetch("/api/food-overrides")
    .then((r) => (r.ok ? (r.json() as Promise<{ available?: boolean; overrides?: Override[] }>) : { available: false, overrides: [] }))
    .then((d) => {
      if (d.available === false) dead.overrides = true;
      return new Map((d.overrides ?? []).map((o) => [okey(o.food_key, o.unit), o]));
    })
    .catch(() => new Map());
  return overrides;
}

export function putOverride(name: string, unit: string, kcal: number, macros: { protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null } = {}): void {
  if (dead.overrides || !(kcal >= 0)) return;
  const o: Override = { food_key: overrideKey({ name }), unit: unit.toLowerCase(), kcal_per_unit: Math.round(kcal * 10) / 10, protein_per_unit: macros.protein_g ?? null, carbs_per_unit: macros.carbs_g ?? null, fat_per_unit: macros.fat_g ?? null };
  // Remember locally at once, so the next add on this page already uses it.
  void loadOverrides().then((m) => m.set(okey(o.food_key, o.unit), o));
  void post("/api/food-overrides", { name, unit: o.unit, kcal_per_unit: o.kcal_per_unit, protein_per_unit: o.protein_per_unit, carbs_per_unit: o.carbs_per_unit, fat_per_unit: o.fat_per_unit }, "PUT").then((r) => {
    if (r && r.available === false) dead.overrides = true;
  });
}

/** The noun a counted item's serving label counts in ("1 roti" → "roti", "1 × 5-6 pieces" → null). */
export function unitNoun(servingLabel: string | null | undefined): string | null {
  const m = /^\s*1\s+([\p{L}][\p{L}\s-]*)$/u.exec(servingLabel ?? "");
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * Apply the person's saved override to a freshly added item: counted items by their unit noun
 * (count × kcal per unit), gram items by '100g'. Items the person already corrected are left alone.
 */
export function withOverride(item: MealItem, servingLabel: string | null | undefined, map: Map<string, Override>): MealItem {
  if (!map.size || item.user_verified) return item;
  const key = overrideKey(item);
  const noun = item.unit === "serving" && Number(item.servings) > 0 ? unitNoun(servingLabel) : null;
  if (noun) {
    const o = map.get(okey(key, noun));
    if (!o) return item;
    return { ...rescalePerUnit(item, Number(item.servings), o.kcal_per_unit, { protein_g: o.protein_per_unit, carbs_g: o.carbs_per_unit, fat_g: o.fat_per_unit }), source_info: rememberedInfo(`${Math.round(o.kcal_per_unit)} kcal per ${noun}`) };
  }
  const o = map.get(okey(key, "100g"));
  if (!o || !(item.grams > 0)) return item;
  return { ...rescalePer100(item, o.kcal_per_unit, { protein_g: o.protein_per_unit, carbs_g: o.carbs_per_unit, fat_g: o.fat_per_unit }), source_info: rememberedInfo(`${Math.round(o.kcal_per_unit)} kcal per 100 g`) };
}

function rememberedInfo(what: string): MealItem["source_info"] {
  return { kind: "user", label: "Your numbers", detail: `Using the ${what} you set before. Change it in the item's editor.`, links: [] };
}
