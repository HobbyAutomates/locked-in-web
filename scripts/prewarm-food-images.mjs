/**
 * v2.4: resolve a picture for every food people see first, so lists open with photos.
 *
 * Usage (from the repo root, with the app running — dev or prod):
 *   node scripts/prewarm-food-images.mjs                       # against http://localhost:3000
 *   node scripts/prewarm-food-images.mjs --base http://localhost:5480 --retry-misses
 *
 * Goes through the real /api/food-image route (authenticated with the service-role key, which
 * also lets it pass the exact search `query=`), so web, Android and this script share one cache.
 *
 *   1. every bandlog.food_presets row — query "<label> indian food" for dal / sabzi / staple /
 *      breakfast / sweet, the plain label otherwise — and writes food_presets.image_url
 *   2. every saved meal — its biggest item's picture — and writes saved_meals.image_url
 *   3. the 100 most-logged meal item names across everyone (Sohum + friends)
 *
 * Prints hit / miss counts and the list of misses. Env from .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = arg("--base", "http://localhost:3000").replace(/\/$/, "");
const RETRY = process.argv.includes("--retry-misses");
const CONCURRENCY = Number(arg("--concurrency", "2"));
const INDIAN = new Set(["dal", "sabzi", "staple", "breakfast", "sweet"]);

function loadEnv() {
  const env = {};
  const file = path.join(ROOT, ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !SERVICE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, SERVICE, { db: { schema: "bandlog" }, auth: { persistSession: false } });

async function resolve(name, kind, query) {
  const u = new URL(`${BASE}/api/food-image`);
  u.searchParams.set("q", name);
  u.searchParams.set("kind", kind);
  if (query) u.searchParams.set("query", query);
  if (RETRY) u.searchParams.set("refresh", "1");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(u, { headers: { Authorization: `Bearer ${SERVICE}` }, signal: AbortSignal.timeout(40000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt) return { key: name, url: null, source: null, error: String(e?.message ?? e) };
    }
  }
}

async function pool(items, fn) {
  let i = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function fetchAll(table, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const stats = { hit: 0, miss: 0, bySource: {} };
const misses = [];
const seen = new Map(); // key -> url, so a name shared by a preset and a meal item is resolved once

function tally(label, r) {
  if (r?.url) {
    stats.hit++;
    const s = r.cached ? `${r.source ?? "?"} (cached)` : r.source ?? "?";
    stats.bySource[s] = (stats.bySource[s] ?? 0) + 1;
  } else {
    stats.miss++;
    misses.push(label + (r?.error ? ` [${r.error}]` : ""));
  }
}

async function main() {
  const t0 = Date.now();
  // 1. presets
  const presets = await fetchAll("food_presets", "id, label, category, image_url");
  console.log(`Presets: ${presets.length}`);
  await pool(presets, async (p) => {
    const query = INDIAN.has(p.category) ? `${p.label} indian food` : p.category === "drink" || p.category === "fruit" ? p.label : undefined;
    const r = await resolve(p.label, "preset", query);
    tally(`preset: ${p.label}`, r);
    if (r?.key) seen.set(r.key, r.url ?? null);
    if (r?.url && r.url !== p.image_url) await db.from("food_presets").update({ image_url: r.url }).eq("id", p.id);
    process.stdout.write(r?.url ? "." : "x");
  });
  console.log();

  // 2. saved meals: the biggest item stands for the meal
  const saved = await fetchAll("saved_meals", "id, name, items, image_url");
  console.log(`Saved meals: ${saved.length}`);
  await pool(saved, async (m) => {
    const items = Array.isArray(m.items) ? m.items : [];
    const top = [...items].sort((a, b) => Number(b.calories ?? 0) - Number(a.calories ?? 0))[0];
    const name = top?.name || m.name;
    const r = await resolve(name, "generic");
    tally(`saved meal: ${m.name} (${name})`, r);
    if (r?.url && r.url !== m.image_url) await db.from("saved_meals").update({ image_url: r.url }).eq("id", m.id);
    process.stdout.write(r?.url ? "." : "x");
  });
  console.log();

  // 3. the 100 most-logged item names
  const rows = await fetchAll("meal_items", "name, source");
  const counts = new Map();
  for (const r of rows) {
    const n = String(r.name ?? "").trim();
    if (!n) continue;
    const k = n.toLowerCase();
    const cur = counts.get(k) ?? { name: n, n: 0, scan: 0 };
    cur.n++;
    if (r.source === "scan") cur.scan++;
    counts.set(k, cur);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 100);
  console.log(`Meal items: ${rows.length} rows, ${counts.size} distinct names, prewarming the top ${top.length}`);
  await pool(top, async (t) => {
    const r = await resolve(t.name, t.scan > t.n / 2 ? "product" : "generic");
    tally(`item: ${t.name} (×${t.n})`, r);
    process.stdout.write(r?.url ? "." : "x");
  });
  console.log();

  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s — hits ${stats.hit}, misses ${stats.miss}`);
  console.log("By source:", JSON.stringify(stats.bySource));
  if (misses.length) console.log(`Misses:\n  ${misses.join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
