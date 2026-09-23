import { createClient } from "@supabase/supabase-js";

/** One row of bandlog.foods as returned by the search_foods RPC. Per 100 g. */
export type FoodHit = {
  id: string;
  name: string;
  aliases: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  micros: Record<string, number>;
  source: "custom" | "dish" | "ifct" | "usda" | "off";
  region: string | null;
  names_local: Record<string, string>;
  units: { name: string; grams: number }[];
  unit_name: string | null;
  unit_grams: number | null;
  /** pg_trgm similarity + exact-alias boost + source priority. ≥ 1 means an exact name/alias hit. */
  score: number;
};

/** Keys we keep in `micros` (per 100 g) — the same set the app renders. */
export const MICRO_KEYS = ["fiber_g", "sugar_g", "sodium_mg", "iron_mg", "calcium_mg", "vitamin_c_mg", "vitamin_a_ug", "potassium_mg", "magnesium_mg", "zinc_mg", "b12_ug", "folate_ug"] as const;
export type MicroKey = (typeof MICRO_KEYS)[number];
export type Micros = Partial<Record<MicroKey, number>>;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "bandlog" },
    auth: { persistSession: false },
  });
}

const cache = new Map<string, { at: number; hits: FoodHit[] }>();
const TTL = 5 * 60 * 1000;

/**
 * Trigram search over bandlog.foods (see supabase/schema_v17b.sql). Ranked by similarity with an
 * exact-alias boost and a source priority custom > dish > ifct > usda > off. Server-side only —
 * it uses the service role so the parse / photo routes can call it before they know the user.
 */
export async function searchFoods(q: string, limit = 5): Promise<FoodHit[]> {
  const key = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (key.length < 2) return [];
  const hit = cache.get(`${key}|${limit}`);
  if (hit && Date.now() - hit.at < TTL) return hit.hits;
  const { data, error } = await admin().rpc("search_foods", { q: key, n: limit });
  if (error) throw new Error(`search_foods: ${error.message}`);
  const hits = ((data ?? []) as Record<string, unknown>[]).map(rowToHit);
  cache.set(`${key}|${limit}`, { at: Date.now(), hits });
  return hits;
}

/** Like searchFoods but returns only a confident match (exact alias, or similarity ≥ `min`). */
export async function bestFood(q: string, min = 0.5): Promise<FoodHit | null> {
  const [top] = await searchFoods(q, 3);
  if (!top) return null;
  return top.score >= 1 || top.score - sourceBonus(top.source) >= min ? top : null;
}

export function sourceBonus(source: string) {
  return source === "custom" ? 0.2 : source === "dish" ? 0.15 : source === "ifct" ? 0.1 : source === "usda" ? 0.05 : 0;
}

function rowToHit(r: Record<string, unknown>): FoodHit {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    calories: Number(r.calories ?? 0),
    protein_g: Number(r.protein_g ?? 0),
    carbs_g: Number(r.carbs_g ?? 0),
    fat_g: Number(r.fat_g ?? 0),
    fiber_g: n(r.fiber_g),
    sugar_g: n(r.sugar_g),
    sodium_mg: n(r.sodium_mg),
    micros: (r.micros ?? {}) as Record<string, number>,
    source: (r.source ?? "custom") as FoodHit["source"],
    region: (r.region as string | null) ?? null,
    names_local: (r.names_local ?? {}) as Record<string, string>,
    units: Array.isArray(r.units) ? (r.units as { name: string; grams: number }[]) : [],
    unit_name: (r.unit_name as string | null) ?? null,
    unit_grams: n(r.unit_grams),
    score: Number(r.score ?? 0),
  };
}

/** Everything the app shows under "Micros", scaled to `grams`. Fibre/sugar/sodium live on the row, the rest in `micros`. */
export function microsFor(f: FoodHit, grams: number): Micros {
  const k = grams / 100;
  const out: Micros = {};
  const put = (key: MicroKey, v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) out[key] = Math.round(v * k * 10) / 10;
  };
  put("fiber_g", f.fiber_g);
  put("sugar_g", f.sugar_g);
  put("sodium_mg", f.sodium_mg);
  for (const key of MICRO_KEYS) if (key !== "fiber_g" && key !== "sugar_g" && key !== "sodium_mg") put(key, f.micros[key]);
  return out;
}

/** Compact one-line description of a hit for a prompt: name, per-100 g macros, household units. */
export function describeHit(f: FoodHit): string {
  const units = f.units
    .slice(0, 4)
    .map((u) => `${u.name}=${Math.round(u.grams)}g`)
    .join(" ");
  const hi = f.names_local?.hi ? ` (${f.names_local.hi})` : "";
  return `${f.id} | ${f.name}${hi} | per100g: ${Math.round(f.calories)} kcal P${f.protein_g} C${f.carbs_g} F${f.fat_g}${units ? ` | ${units}` : ""}`;
}

/** Split "do roti, ek katori dal and 2 eggs" into candidate food chunks for the DB lookup. */
export function chunksOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\n;+]/g, ",")
    .split(/,|\band\b|\baur\b|\bwith\b|\bke saath\b|\bplus\b/)
    .map((s) => s.replace(/\b(\d+([.,]\d+)?|ek|do|teen|char|paanch|aadha|adha|thoda sa|thoda|zyada|bahut|one|two|three|four|five|half|a|an|some|few|little|of|the|g|gm|gms|grams|kg|ml|l|cup|cups|glass|bowl|katori|katoris|ladle|tbsp|tsp|spoon|spoons|chammach|piece|pieces|pcs|slice|slices|scoop|scoops|plate|small|medium|large|big)\b/g, " "))
    .map((s) => s.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 2);
}
