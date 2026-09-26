/**
 * `npx tsx scripts/check-pro.ts` — offline check of src/lib/pro.ts (spec §1). Android's
 * util/Pro.kt must produce the same answers for these vectors.
 */
import { DEFAULT_PRO_CONFIG, gate, hasPro, parseProConfig, priceText, proButton, proState } from "../src/lib/pro";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

const NOW = new Date("2026-09-26T10:00:00Z");

check("beta, no end date → Pro", hasPro("beta", null, NOW), true);
check("pro, no end date → Pro", hasPro("pro", null, NOW), true);
check("free → no Pro", hasPro("free", null, NOW), false);
check("pro, ends tomorrow → Pro", hasPro("pro", "2026-09-27T10:00:00Z", NOW), true);
check("pro, ended yesterday → no Pro", hasPro("pro", "2026-09-25T10:00:00Z", NOW), false);
check("beta, ended exactly now → no Pro", hasPro("beta", "2026-09-26T10:00:00Z", NOW), false);
check("column missing (v36 not applied) → Pro", hasPro(null, null, NOW, true), true);
check("free but column missing → Pro", hasPro("free", "2020-01-01T00:00:00Z", NOW, true), true);
check("unknown plan value → no Pro", hasPro(undefined, null, NOW), false);

check("config fallback", parseProConfig(null), DEFAULT_PRO_CONFIG);
check("config from app_config", parseProConfig({ price_inr: 700, period: "month", beta_all_pro: true, payments_enabled: false }), { price_inr: 700, period: "month", beta_all_pro: true, payments_enabled: false });
check("config junk price → 700", parseProConfig({ price_inr: -3 }).price_inr, 700);
check("price text", priceText(DEFAULT_PRO_CONFIG), "₹700 / month");

check("gate: Pro feature, Pro user", gate("routines", true), "open");
check("gate: Pro feature, free user", gate("routines", false), "locked");
check("gate: free feature, free user", gate("body_measurements", false), "open");

check("state: row missing → beta Pro", proState(null, null, NOW).pro, true);
check("state: free row → not Pro", proState({ plan: "free", pro_until: null }, null, NOW).pro, false);
check("state: new account default is beta", proState({ plan: undefined, pro_until: null }, null, NOW).plan, "beta");

check("button: beta", proButton(proState({ plan: "beta", pro_until: null }, null, NOW)), { label: "You're in the beta", disabled: true });
check("button: free, payments off", proButton(proState({ plan: "free", pro_until: null }, null, NOW)), { label: "Coming soon", disabled: true });
check("button: free, payments on", proButton(proState({ plan: "free", pro_until: null }, { price_inr: 700, payments_enabled: true }, NOW)), { label: "Get Pro · ₹700 / month", disabled: false });

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
