/**
 * Full-table backup of bandlog.* tables via the PostgREST API, paging with Range headers
 * so it never hits `supabase db query`'s row/size limits (which is why
 * backups/2026-09-24/foods.json came out as 0 bytes — foods has 3,390 rows and no committed
 * backup script existed; the dump was evidently taken with an ad-hoc `supabase db query` /
 * psql \copy that either truncated or errored silently on the larger table while the smaller
 * tables in the same run succeeded).
 *
 * Usage:
 *   node scripts/backup-tables.mjs <outDir> <table1> [table2 ...]
 *   node scripts/backup-tables.mjs backups/2026-09-25 foods food_aliases food_presets
 *
 * Writes <outDir>/<table>.json as { rows: [...] }, matching the existing backup format.
 * Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local (or process.env).
 * Read-only: never writes to the database.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

function loadEnv() {
  const p = new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const fromFile = existsSync(p)
    ? Object.fromEntries(
        readFileSync(p, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#") && l.includes("="))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
      )
    : {};
  return { ...fromFile, ...process.env };
}

// Primary-key column per table, used only to keep Range-based paging stable across pages.
const ORDER_COL = {
  food_aliases: "alias",
  activities: "code",
  barcode_cache: "barcode",
  food_images: "key",
  daily_stats: "user_id,date",
  group_members: "group_id,user_id",
  battle_wins: "group_id,date",
  app_events: "id",
};

async function fetchAllRows(url, key, table, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  const orderCol = ORDER_COL[table] ?? "id";
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=${orderCol}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "bandlog",
        Range: `${offset}-${offset + pageSize - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${table} [${offset}-${offset + pageSize - 1}] failed: ${res.status} ${body.slice(0, 500)}`);
    }
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`GET ${table}: unexpected response ${JSON.stringify(page).slice(0, 300)}`);
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function main() {
  const [outDirArg, ...tables] = process.argv.slice(2);
  if (!outDirArg || tables.length === 0) {
    console.error("usage: node scripts/backup-tables.mjs <outDir> <table1> [table2 ...]");
    process.exit(1);
  }
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");

  const outDir = new URL(outDirArg.replace(/\\/g, "/") + "/", `file://${process.cwd()}/`).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  mkdirSync(outDir, { recursive: true });

  const summary = {};
  for (const table of tables) {
    const rows = await fetchAllRows(url, key, table);
    writeFileSync(outDir + `${table}.json`, JSON.stringify({ rows }, null, 1));
    summary[table] = rows.length;
    console.log(`${table}: ${rows.length} rows -> ${outDir}${table}.json`);
  }
  console.log("done", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
