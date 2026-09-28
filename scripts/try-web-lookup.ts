/**
 * `npx tsx --env-file=.env.local scripts/try-web-lookup.ts "roti" "paneer bhurji"` — manual, REAL
 * `food_web_lookup` calls (Sonnet + web_search; costs money, ~a few cents each). Never caches.
 * Prints kcal/100 g, macros, confidence and sources. Not part of the offline checks.
 */
import { webLookup } from "../src/lib/webFood";

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) throw new Error("usage: try-web-lookup.ts <food> [<food> …]");
  const results = await Promise.all(
    names.map(async (n) => {
      const t = Date.now();
      const r = await webLookup(n, { cache: false, timeoutMs: Number(process.env.WEB_LOOKUP_MS) || undefined });
      return { n, r, s: ((Date.now() - t) / 1000).toFixed(1) };
    }),
  );
  for (const { n, r, s } of results) {
    if (!r) {
      console.log(`\n${n}: no result (${s}s)`);
      continue;
    }
    const tokens = (r.usage ?? []).reduce((a, u) => ({ in: a.in + u.in, out: a.out + u.out }), { in: 0, out: 0 });
    console.log(`\n${n} (${s}s, ${tokens.in} in / ${tokens.out} out tokens): ${r.calories} kcal/100 g · P ${r.protein_g} C ${r.carbs_g} F ${r.fat_g} · ${r.confidence} · "${r.matched_name}" [${r.basis}]`);
    for (const src of r.sources) console.log(`   - ${src.label} — ${src.url}`);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
