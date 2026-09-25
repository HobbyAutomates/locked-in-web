/**
 * `npx tsx scripts/check-admin.ts` — offline checks for the v2.10 admin panel and beta events:
 *  - ADMIN_EMAILS matching (the /admin gate's allow-list; everything else 404s),
 *  - event props are trimmed to small flat labels (schema_v33 caps props at 2 KB),
 *  - a missing app_events table is recognised (trackers go quiet instead of retrying),
 *  - the scan-usage cost estimate.
 */
import { isAdminEmail } from "../src/lib/admin/emails";
import { cleanProps, isMissingTable } from "../src/lib/analytics";
import { costOf } from "../src/lib/admin/pricing";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---- ADMIN_EMAILS ----
const saved = process.env.ADMIN_EMAILS;
delete process.env.ADMIN_EMAILS;
check("unset → nobody", !isAdminEmail("owner@example.com"));
process.env.ADMIN_EMAILS = "";
check("empty → nobody", !isAdminEmail("owner@example.com"));
check("empty email never matches empty list", !isAdminEmail(""));
process.env.ADMIN_EMAILS = " Owner@Example.com , second@example.com,,";
check("case + spaces", isAdminEmail("owner@example.com"));
check("second entry", isAdminEmail("SECOND@example.com "));
check("stranger", !isAdminEmail("friend@example.com"));
check("no substring match", !isAdminEmail("wner@example.com"));
check("null user email", !isAdminEmail(null));
check("undefined user email", !isAdminEmail(undefined));
if (saved === undefined) delete process.env.ADMIN_EMAILS;
else process.env.ADMIN_EMAILS = saved;

// ---- props ----
const long = "x".repeat(500);
const p = cleanProps({ message: long, n: 3, ok: true, gone: undefined, bad: Number.NaN });
check("strings cut to 160", typeof p.message === "string" && p.message.length === 160);
check("numbers kept", p.n === 3);
check("booleans kept", p.ok === true);
check("undefined dropped", !("gone" in p));
check("NaN → null", p.bad === null);
const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, long]));
const cm = cleanProps(many);
check("at most 12 keys", Object.keys(cm).length === 12);
check("fits the 2 KB column check", JSON.stringify(cm).length < 2048, `${JSON.stringify(cm).length} chars`);
check("no props → {}", JSON.stringify(cleanProps(undefined)) === "{}");

// ---- missing table ----
check("42P01", isMissingTable({ code: "42P01", message: 'relation "bandlog.app_events" does not exist' }));
check("PGRST205", isMissingTable({ code: "PGRST205", message: "Could not find the table 'bandlog.app_events' in the schema cache" }));
check("RLS denial is not 'missing'", !isMissingTable({ code: "42501", message: "new row violates row-level security policy" }));
check("no error", !isMissingTable(null));

// ---- cost ----
const sonnet = costOf({ route: "label_ocr", model: "claude-sonnet-5", in: 1_000_000, out: 100_000 });
check("sonnet 5: 1M in + 100k out = $3", sonnet != null && Math.abs(sonnet - 3) < 1e-9, String(sonnet));
const haiku = costOf({ route: "label_structure", model: "claude-haiku-4-5-20251001", in: 2000, out: 500, cache_read: 10_000 });
check("haiku 4.5 with cache read", haiku != null && Math.abs(haiku - (2000 * 1 + 500 * 5 + 10_000 * 0.1) / 1e6) < 1e-12, String(haiku));
check("unpriced model → null", costOf({ route: "meal_vision", model: "qwen3-vl-plus", in: 10, out: 10 }) === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
