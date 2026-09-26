/**
 * `npx tsx scripts/check-notify.ts` — the cron's pure rules (src/lib/notify.ts, spec §2–3) and the
 * recap periods (src/lib/recap.ts, spec §13). Android's alarms port the protein rule.
 */
import { checkinDue, fastingReached, isMissingSchema, localNow, nudgeTimeReached, proteinNudgeText, proteinPicksFor, pushPayload, shouldProteinNudge, timeToMinutes } from "../src/lib/notify";
import { recapDue, recapPeriod } from "../src/lib/recap";
import { latestWaist, measurementError, compare } from "../src/lib/body";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

// 10:40 UTC = 16:10 IST, a Saturday.
check("IST clock", localNow(new Date("2026-09-26T10:40:00Z")), { date: "2026-09-26", minutes: 970, weekday: 6, dayOfMonth: 26 });
check("IST date rolls over at 18:30 UTC", localNow(new Date("2026-09-27T18:31:00Z")).date, "2026-09-28");
check("time parse", [timeToMinutes("16:00:00"), timeToMinutes("07:30"), timeToMinutes(null), timeToMinutes("25:00")], [960, 450, 960, 960]);
check("nudge time just passed", nudgeTimeReached(970, 960), true);
check("nudge time not yet", nudgeTimeReached(950, 960), false);
check("nudge window over (3 h late)", nudgeTimeReached(960 + 181, 960), false);

const base = { enabled: true, age: 25, goalType: "maintain" as const, proteinToday: 50, target: 120, loggedToday: true, alreadyToday: false };
check("under 70 % → nudge", shouldProteinNudge(base), true);
check("exactly 70 % → no nudge", shouldProteinNudge({ ...base, proteinToday: 84 }), false);
check("nothing logged today → no nudge", shouldProteinNudge({ ...base, loggedToday: false }), false);
check("already nudged today → no", shouldProteinNudge({ ...base, alreadyToday: true }), false);
check("switched off → no", shouldProteinNudge({ ...base, enabled: false }), false);
check("under 18 losing weight → never", shouldProteinNudge({ ...base, age: 16, goalType: "lose" }), false);
check("under 18 maintaining → yes", shouldProteinNudge({ ...base, age: 16 }), true);
check("unknown age losing → yes", shouldProteinNudge({ ...base, age: null, goalType: "lose" }), true);

check("balanced picks", proteinPicksFor("balanced"), ["chicken tikka (100 g)", "a whey shake", "grilled fish (100 g)"]);
check("vegetarian picks", proteinPicksFor("vegetarian"), ["a whey shake", "paneer bhurji (100 g)", "soya chunks curry"]);
check("eggetarian picks", proteinPicksFor("eggetarian"), ["a whey shake", "paneer bhurji (100 g)", "soya chunks curry"]);
check("vegan picks", proteinPicksFor("vegan"), ["soya chunks curry", "tofu stir-fry (100 g)", "2 moong dal chillas"]);
check("jain picks", proteinPicksFor("jain"), ["a whey shake", "paneer bhurji (100 g)", "soya chunks curry"]);
check("keto picks skip carb-heavy", proteinPicksFor("keto", 12).includes("roasted chana (30 g)"), false);
check("nudge text", proteinNudgeText(41.6, ["a", "b", "c"]), { title: "You're 42 g short on protein", body: "Try a, b or c." });

check("fast reached", fastingReached({ started_at: "2026-09-26T00:00:00Z", ended_at: null, target_hours: 16 }, new Date("2026-09-26T16:00:00Z")), true);
check("fast not yet", fastingReached({ started_at: "2026-09-26T00:00:00Z", ended_at: null, target_hours: 16 }, new Date("2026-09-26T15:59:00Z")), false);
check("fast ended → nothing", fastingReached({ started_at: "2026-09-26T00:00:00Z", ended_at: "2026-09-26T10:00:00Z", target_hours: 16 }, new Date("2026-09-26T17:00:00Z")), false);
check("check-in on Monday", checkinDue({ date: "2026-09-28", minutes: 600, weekday: 1, dayOfMonth: 28 }, true, false), true);
check("no check-in on Tuesday", checkinDue({ date: "2026-09-29", minutes: 600, weekday: 2, dayOfMonth: 29 }, true, false), false);
check("push payload keeps app-relative url", pushPayload({ id: "1", kind: "nudge", title: "t", body: "b", url: "https://evil.example" }).url, "/notifications");
check("missing-table error", isMissingSchema({ code: "PGRST205", message: "Could not find the table 'bandlog.notifications'" }), true);
check("other error", isMissingSchema({ code: "23505", message: "duplicate key" }), false);

check("weekly recap = previous Mon–Sun", recapPeriod("weekly", "2026-09-28"), { kind: "weekly", from: "2026-09-21", to: "2026-09-27", label: recapPeriod("weekly", "2026-09-28").label, key: "w-2026-09-21" });
check("weekly recap mid-week", [recapPeriod("weekly", "2026-09-30").from, recapPeriod("weekly", "2026-09-30").to], ["2026-09-21", "2026-09-27"]);
check("monthly recap = previous month", [recapPeriod("monthly", "2026-10-01").from, recapPeriod("monthly", "2026-10-01").to], ["2026-09-01", "2026-09-30"]);
check("monthly recap across a year", [recapPeriod("monthly", "2027-01-01").from, recapPeriod("monthly", "2027-01-01").to], ["2026-12-01", "2026-12-31"]);
check("recap due", [recapDue("2026-09-28"), recapDue("2026-10-01"), recapDue("2026-09-29"), recapDue("2027-02-01")], ["weekly", "monthly", null, "monthly"]);

check("latest waist wins over profile", latestWaist([{ date: "2026-09-01", waist_cm: 84 }, { date: "2026-09-20", waist_cm: 82.5 }, { date: "2026-09-10", waist_cm: null }], 90), 82.5);
check("no waist entries → profile waist", latestWaist([], 90), 90);
check("measurement needs a value", measurementError({}), "Enter at least one measurement");
check("body fat range", measurementError({ body_fat_pct: 80 }), "Body fat should be between 2 and 70 %");
check("before/after ordering and weight", compare({ date: "2026-09-20", weight_kg: 78 }, { date: "2026-08-01", weight_kg: null }, [{ date: "2026-08-03", weight_kg: 81.2 }]), {
  before: { date: "2026-08-01", weight_kg: null },
  after: { date: "2026-09-20", weight_kg: 78 },
  days: 50,
  weightDelta: -3.2,
});

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
