/**
 * Import Indian food presets into bandlog.food_presets.
 *
 * Usage (from the repo root):
 *   node scripts/import-presets.mjs          # validate + upsert
 *   node scripts/import-presets.mjs --dry    # validate only, print what would be written
 *
 * Reads data/presets.json, checks that every food_id exists in bandlog.foods
 * (fails loudly listing any missing ids), strips the `source_note` field and
 * upserts rows in batches of 100 with onConflict "id".
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from
 * .env.local (process.env takes precedence).
 *
 * Sources for serving sizes (grams per serving):
 *  - INDB — Indian Nutrient Databank: Jaacks LM et al., "Indian Nutrient Databank
 *    (INDB): a harmonised nutrient database for Indian recipes", Curr Dev Nutr 2024,
 *    doi:10.1016/j.cdnut.2024.103790, CC BY 4.0. Per-serving weights from
 *    recipes_servingsize.xlsx (katori, bowl, plate, piece, tea cup, glass ...).
 *  - IFCT 2017 — Indian Food Composition Tables, ICMR-National Institute of
 *    Nutrition, Hyderabad: household measures (egg 50 g, cup/katori, handful).
 *  - Standard Indian household measures for the rest (katori 150 g, roti 40 g,
 *    tsp 5 g, tbsp 15 g, glass 250 ml, retail pack sizes). Each preset's
 *    `source_note` in data/presets.json says which one applies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const BATCH = 100;
const CATEGORIES = new Set(["breakfast", "staple", "dal", "sabzi", "protein", "snack", "drink", "sweet", "fruit", "fat"]);
const ICONS = new Set(["bowl", "roti", "cup", "egg", "leaf", "flame", "drop", "fruit", "sweet", "fish", "glass", "spoon"]);

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

class ImportError extends Error {}
function fail(msg) {
  throw new ImportError(msg);
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");

  const supabase = createClient(url, key, { db: { schema: "bandlog" }, auth: { persistSession: false } });

  const presets = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "presets.json"), "utf8"));
  if (!Array.isArray(presets) || presets.length === 0) fail("data/presets.json is empty or not an array");

  // ---- shape validation ------------------------------------------------------
  const problems = [];
  const seen = new Set();
  for (const p of presets) {
    const where = p.id ?? JSON.stringify(p).slice(0, 60);
    if (!p.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) problems.push(`${where}: id must be kebab-case`);
    if (seen.has(p.id)) problems.push(`${where}: duplicate id`);
    seen.add(p.id);
    if (!p.food_id) problems.push(`${where}: missing food_id`);
    if (!p.label || !p.label_hi) problems.push(`${where}: missing label / label_hi`);
    if (!CATEGORIES.has(p.category)) problems.push(`${where}: bad category "${p.category}"`);
    if (!ICONS.has(p.icon)) problems.push(`${where}: bad icon "${p.icon}"`);
    if (!Array.isArray(p.servings) || p.servings.length < 2 || p.servings.length > 4) problems.push(`${where}: need 2-4 servings`);
    else {
      for (const s of p.servings) if (!s.label || !(s.grams > 0)) problems.push(`${where}: bad serving ${JSON.stringify(s)}`);
      if (!p.servings.some((s) => s.label === p.default_serving)) problems.push(`${where}: default_serving "${p.default_serving}" not in servings`);
    }
    if (!Number.isInteger(p.sort)) problems.push(`${where}: sort must be an integer`);
  }
  if (problems.length) fail(`Invalid presets:\n  - ${problems.join("\n  - ")}`);

  // ---- food_id existence -----------------------------------------------------
  const foodIds = [...new Set(presets.map((p) => p.food_id))];
  const found = new Set();
  for (let i = 0; i < foodIds.length; i += BATCH) {
    const chunk = foodIds.slice(i, i + BATCH);
    const { data, error } = await supabase.from("foods").select("id").in("id", chunk);
    if (error) fail(`foods lookup failed: ${error.message}`);
    for (const r of data) found.add(r.id);
  }
  const missing = presets.filter((p) => !found.has(p.food_id));
  if (missing.length) {
    fail(`${missing.length} preset(s) reference food_ids not in bandlog.foods:\n  - ${missing.map((p) => `${p.id} -> ${p.food_id}`).join("\n  - ")}`);
  }

  // ---- upsert ----------------------------------------------------------------
  const rows = presets.map((pr) => {
    const row = { ...pr };
    delete row.source_note;
    return row;
  });
  const byCat = rows.reduce((acc, r) => ((acc[r.category] = (acc[r.category] || 0) + 1), acc), {});
  console.log(`✓ ${rows.length} presets valid, ${foodIds.length} distinct food rows, all food_ids exist`);
  console.log("  per category:", byCat);

  if (DRY) {
    console.log("--dry: nothing written. First row:\n", JSON.stringify(rows[0], null, 2));
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("food_presets").upsert(chunk, { onConflict: "id" });
    if (error) fail(`upsert failed at batch ${i / BATCH + 1}: ${error.message}`);
    written += chunk.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }
  console.log(`✓ done: ${written} presets upserted into bandlog.food_presets`);
}

// Set exitCode instead of calling process.exit() (avoids a libuv assert on Windows).
main().catch((err) => {
  console.error(`\n✖ ${err instanceof ImportError ? err.message : err.stack || err}\n`);
  process.exitCode = 1;
});
