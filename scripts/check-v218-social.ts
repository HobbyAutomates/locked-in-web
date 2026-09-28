/**
 * `npx tsx scripts/check-v218-social.ts` — offline checks for the v2.18 social stream (Areas D + E):
 * streak freezes, referrals, stamps + reactions, live sessions, pledges, seasonal events, packs
 * (gold covers, badge skins), leagues, coach view, Wrapped, language, regional food names, the
 * offline queue, CSV export and the safety helpers. Android's unit tests pin the same numbers.
 */
import assert from "node:assert/strict";
import { addDays } from "../src/lib/dates";
import { activityDayStreak } from "../src/lib/streaks";
import { MAX_FREEZES, canGift, clampTokens, earnHint, freezeCountText, parseFreezeEvents, perfectWeeks, planFreezeUse, simulateSync, withFrozen } from "../src/lib/social/freezes";
import { bankedText, claimMessage, inviteUrl, normalizeCode, referralGrant } from "../src/lib/social/referrals";
import { EMPTY_STAMPS, parseStampRows, stampVerdict, stampable, toggleStamp } from "../src/lib/social/stamps";
import { REACTIONS, normalizeReaction, parseCounts } from "../src/lib/reactions";
import { isLiveFresh, liveElapsed, liveLine, parseLiveRows } from "../src/lib/social/live";
import { endsOn, goalText, parsePledge, pledgeProgress, stakeLine, validatePledge } from "../src/lib/social/pledges";
import { DIWALI, eventById, eventProgress, eventWhen, eventsAround, eventsForYear } from "../src/lib/social/seasonal";
import { GOLD_COVERS, goldHex, goldifySvg, isGoldCover, parseSkin, priceLabel, PACKS, skinAllowed } from "../src/lib/social/packs";
import { closeWeek, leaguesOn, movers, tierName } from "../src/lib/social/leagues";
import { adherenceLine, normalizeUsername, parseOverview } from "../src/lib/social/coachView";
import { parseWrappedKind, wrappedPeriod, wrappedSlides } from "../src/lib/social/wrapped";
import { buildRecap } from "../src/lib/recap";
import { STRINGS, parseLang, syncLabel, t } from "../src/lib/social/i18n";
import { regionalMatch, regionalQuery } from "../src/lib/social/regionalFoods";
import { MAX_TRIES, afterAttempt, enqueue, isNetworkError, ordered, shouldQueue } from "../src/lib/social/offlineQueue";
import { combinedCsv, mealRows, toCsv } from "../src/lib/social/exportData";
import { deleteConfirmed, parseReason, passwordProblem, reportSnapshot, withoutBlocked } from "../src/lib/social/safety";

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  void name;
};

// ---------------------------------------------------------------- D5 freezes
ok("freezes", () => {
  const T = "2026-09-30"; // a Wednesday
  const week = (ws: string) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  // Weeks starting 21 Sep and 14 Sep are the last two completed weeks.
  assert.deepEqual(perfectWeeks(week("2026-09-21"), T), ["2026-09-21"]);
  assert.deepEqual(perfectWeeks([...week("2026-09-21"), ...week("2026-09-14")], T), ["2026-09-21", "2026-09-14"]);
  assert.deepEqual(perfectWeeks(week("2026-09-21").slice(1), T), []); // Monday missing
  assert.deepEqual(perfectWeeks(week("2026-09-28"), T), []); // this week isn't complete
  assert.equal(clampTokens(7), 3);
  assert.equal(clampTokens(-1), 0);
  assert.equal(clampTokens("x"), 0);

  // Missed yesterday only, streak before it, 1 token → freeze yesterday.
  const act = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];
  assert.deepEqual(planFreezeUse(act, [], 1, T, "2026-09-01"), ["2026-09-29"]);
  // Today being empty is never a miss.
  assert.deepEqual(planFreezeUse([...act, "2026-09-29"], [], 1, T, "2026-09-01"), []);
  // Two missed days, one token → nothing spent (streak is gone anyway).
  assert.deepEqual(planFreezeUse(act.slice(0, 3), [], 1, T, "2026-09-01"), []);
  assert.deepEqual(planFreezeUse(act.slice(0, 3), [], 2, T, "2026-09-01"), ["2026-09-29", "2026-09-28"]);
  // Four missed days even with 3 tokens → nothing.
  assert.deepEqual(planFreezeUse(["2026-09-24"], [], 3, T, "2026-09-01"), []);
  // An already frozen day continues the run.
  assert.deepEqual(planFreezeUse(["2026-09-27"], ["2026-09-28"], 1, T, "2026-09-01"), ["2026-09-29"]);
  // Nothing before the first ever log.
  assert.deepEqual(planFreezeUse([], [], 3, T, null), []);
  assert.deepEqual(planFreezeUse(["2026-09-28"], [], 3, T, "2026-09-28"), ["2026-09-29"]); // day 2 missed right after the first log
  assert.deepEqual(planFreezeUse([], [], 3, T, "2026-09-29"), []); // the first-log day itself is never frozen
  // Streak with a frozen day counts through it.
  const lists = withFrozen([act], ["2026-09-29"]);
  const s0 = activityDayStreak(act);
  const s1 = activityDayStreak(...lists);
  assert.ok(s1 >= s0);

  // simulateSync: earn then use.
  const all = [...week("2026-09-21"), "2026-09-28"];
  const r = simulateSync({ tokens: 0, earnedWeeks: [], usedDays: [], active: all, firstDay: "2026-09-21" }, T);
  assert.deepEqual(r.earnedNow, ["2026-09-21"]);
  assert.deepEqual(r.usedNow, ["2026-09-29"]);
  assert.equal(r.tokens, 0);
  // Already earned → not again; at 3 → recorded but not added.
  const r2 = simulateSync({ tokens: 3, earnedWeeks: [], usedDays: [], active: [...week("2026-09-21"), "2026-09-29"], firstDay: "2026-09-21" }, T);
  assert.equal(r2.tokens, MAX_FREEZES);
  assert.deepEqual(r2.earnedNow, []);
  assert.deepEqual(r2.earnedWeeks, ["2026-09-21"]);

  // Gifts
  const now = new Date("2026-09-30T10:00:00Z");
  assert.deepEqual(canGift(1, 0, null, now), { ok: true });
  assert.deepEqual(canGift(0, 0, null, now), { ok: false, reason: "none" });
  assert.deepEqual(canGift(2, 3, null, now), { ok: false, reason: "full" });
  assert.deepEqual(canGift(2, 1, "2026-09-26T10:00:00Z", now), { ok: false, reason: "cooldown" });
  assert.deepEqual(canGift(2, 1, "2026-09-22T10:00:00Z", now), { ok: true });
  assert.deepEqual(canGift(2, 1, null, now, true), { ok: false, reason: "self" });
  assert.equal(freezeCountText(0), "No freezes");
  assert.equal(freezeCountText(1), "1 freeze");
  assert.equal(freezeCountText(3), "3 freezes");
  assert.equal(earnHint(3, [], T), "You're at the max of 3. Use one, then earn it back.");
  assert.equal(earnHint(0, ["2026-09-28", "2026-09-29"], T), "Log every day to Sunday (5 to go) to earn one.");
  assert.equal(earnHint(0, ["2026-09-28", "2026-09-29", T], T), "Log every day to Sunday (4 to go) to earn one.");
  assert.equal(earnHint(0, ["2026-09-29"], T), "Log all 7 days of a week (Mon to Sun) to earn one.");
  const ev = parseFreezeEvents([
    { kind: "use", ref: "2026-09-20" },
    { kind: "use", ref: "2026-09-29" },
    { kind: "earn", ref: "2026-09-14" },
    { kind: "gift_out", ref: "x:1", other_user: "u2", created_at: "2026-09-10T00:00:00Z" },
    { kind: "gift_out", ref: "x:2", other_user: "u2", created_at: "2026-09-25T00:00:00Z" },
    { kind: "use", ref: "garbage" },
  ]);
  assert.deepEqual(ev.usedDays, ["2026-09-29", "2026-09-20"]);
  assert.deepEqual(ev.earnedWeeks, ["2026-09-14"]);
  assert.equal(ev.lastGiftTo.u2, "2026-09-25T00:00:00Z");
});

// ---------------------------------------------------------------- D2 referrals
ok("referrals", () => {
  assert.equal(normalizeCode("abc23x"), "ABC23X");
  assert.equal(normalizeCode("ABC10X"), null); // 1 and 0 aren't in the alphabet
  assert.equal(normalizeCode("ABCDE"), null);
  assert.equal(normalizeCode(42), null);
  assert.equal(inviteUrl("https://x.app/", "ABC23X"), "https://x.app/r/ABC23X");
  const now = new Date("2026-09-30T00:00:00Z");
  assert.deepEqual(referralGrant("beta", null, now), { kind: "banked", plan: "beta", pro_until: null, bankedDays: 7 });
  assert.deepEqual(referralGrant("beta", null, now, 7), { kind: "banked", plan: "beta", pro_until: null, bankedDays: 14 });
  assert.equal(referralGrant("free", null, now).plan, "pro");
  assert.equal(referralGrant("free", null, now).pro_until, "2026-10-07T00:00:00.000Z");
  assert.equal(referralGrant("pro", "2026-10-10T00:00:00Z", now).pro_until, "2026-10-17T00:00:00.000Z"); // extends the future end
  assert.equal(referralGrant("pro", "2026-09-01T00:00:00Z", now).pro_until, "2026-10-07T00:00:00.000Z"); // expired → from now
  assert.equal(referralGrant("beta", "2026-12-31T00:00:00Z", now).kind, "extended"); // a dated beta
  assert.equal(claimMessage({ ok: true, referrer_name: "Ayan" }), "You and Ayan both get 1 week of Pro.");
  assert.equal(claimMessage({ ok: false, reason: "self" }), "That's your own invite.");
  assert.equal(claimMessage({ ok: false, reason: "weird" }), "Couldn't use that invite right now.");
  assert.equal(bankedText(0), null);
  assert.equal(bankedText(7), "1 week of Pro banked");
  assert.equal(bankedText(21), "3 weeks of Pro banked");
  assert.equal(bankedText(10), "10 days of Pro banked");
});
assert.equal(normalizeCode(" ab-c 23x "), "ABC23X");

// ---------------------------------------------------------------- D6 stamps + reactions
ok("stamps", () => {
  let s = EMPTY_STAMPS;
  let r = toggleStamp(s, "clean");
  assert.deepEqual(r, { state: { clean: 1, cheat: 0, mine: "clean" }, save: "clean" });
  s = r.state;
  r = toggleStamp(s, "cheat");
  assert.deepEqual(r, { state: { clean: 0, cheat: 1, mine: "cheat" }, save: "cheat" });
  r = toggleStamp(r.state, "cheat");
  assert.deepEqual(r, { state: { clean: 0, cheat: 0, mine: null }, save: null });
  assert.equal(stampVerdict({ clean: 3, cheat: 1, mine: null }), "clean");
  assert.equal(stampVerdict({ clean: 1, cheat: 2, mine: null }), "cheat");
  assert.equal(stampVerdict({ clean: 2, cheat: 2, mine: null }), null);
  assert.equal(stampVerdict(EMPTY_STAMPS), null);
  assert.equal(stampable({ kind: "meal", photo_path: "a.jpg" }), true);
  assert.equal(stampable({ kind: "meal", photo_path: null }), false);
  assert.equal(stampable({ kind: "message", photo_path: "a.jpg" }), false);
  assert.deepEqual(parseStampRows([{ post_id: "p", clean: "2", cheat: null, mine: "clean" }, { post_id: 3 }]), { p: { clean: 2, cheat: 0, mine: "clean" } });
  assert.equal(REACTIONS.length, 13);
  assert.deepEqual(REACTIONS.slice(6), ["🥗", "🍗", "🏋️", "🙌", "💯", "😤", "🫡"]);
  assert.equal(normalizeReaction("🏋"), "🏋️"); // no variation selector
  assert.deepEqual(parseCounts({ "🫡": 2, "🤡": 5 }), { "🫡": 2 });
});

// ---------------------------------------------------------------- D7 live
ok("live", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  assert.equal(isLiveFresh("2026-09-30T09:45:00Z", "2026-09-30T09:00:00Z", now), true);
  assert.equal(isLiveFresh("2026-09-30T09:30:00Z", "2026-09-30T09:00:00Z", now), false);
  assert.equal(isLiveFresh("2026-09-30T09:59:00Z", "2026-09-30T05:00:00Z", now), false);
  assert.equal(liveLine("Ayan Kapoor"), "Ayan is training now 🔥");
  assert.equal(liveLine("Ayan", "Leg day"), "Ayan is on leg day now 🔥");
  assert.equal(liveLine(""), "Someone is training now 🔥");
  assert.equal(liveElapsed("2026-09-30T09:48:00Z", now), "12 min in");
  assert.equal(liveElapsed("2026-09-30T08:55:00Z", now), "1 h 05 min in");
  assert.equal(parseLiveRows([{ user_id: "me" }, { user_id: "u2", cheers: "3" }], "me")[0].cheers, 3);
});

// ---------------------------------------------------------------- D8 pledges
ok("pledges", () => {
  const T = "2026-09-30";
  const base = { goal: "Log every day", kind: "log_days" as const, target: 6, stake: "chai", stake_inr: 200, starts_on: T, days: 7 };
  assert.equal(validatePledge(base, T), null);
  assert.equal(validatePledge({ ...base, goal: "x" }, T), "Say what you're pledging");
  assert.equal(validatePledge({ ...base, target: 8 }, T), "That's more days than the pledge has (7)");
  assert.equal(validatePledge({ ...base, starts_on: "2026-09-29" }, T), "Start today or later");
  assert.equal(validatePledge({ ...base, days: 0 }, T), "Pick 1 to 90 days");
  assert.equal(validatePledge({ ...base, kind: "custom", target: null }, T), null);
  assert.equal(endsOn(T, 7), "2026-10-06");
  assert.equal(goalText("train_days", 4, 7, ""), "Train on 4 of 7 days");
  assert.equal(goalText("custom", null, 7, " No sugar "), "No sugar");
  const p = { kind: "log_days" as const, target: 5, starts_on: "2026-09-28", ends_on: "2026-10-04", status: "active" as const };
  assert.deepEqual(pledgeProgress(p, ["2026-09-28", "2026-09-29"], T), { done: 2, needed: 5, daysLeft: 5, outcome: "active", onTrack: true });
  assert.equal(pledgeProgress(p, ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"], "2026-10-02").outcome, "kept");
  assert.equal(pledgeProgress(p, [], "2026-10-02").outcome, "broken"); // 0 done + 3 left < 5
  assert.equal(pledgeProgress({ ...p, kind: "custom" }, [], T).outcome, "active");
  assert.equal(pledgeProgress({ ...p, status: "kept" }, [], T).outcome, "kept");
  assert.equal(stakeLine("chai for the squad", 200), "Stake: chai for the squad · ₹200 into the squad pot");
  assert.equal(stakeLine("", 0), "No stake, just pride");
  assert.equal(parsePledge({ id: 1, kind: "zzz", status: "odd", stake_inr: "-4" }).kind, "custom");
  assert.equal(parsePledge({ status: "odd" }).status, "active");
});

// ---------------------------------------------------------------- D9 seasonal
ok("seasonal", () => {
  assert.equal(DIWALI[2026], "2026-11-08");
  const ev26 = eventsForYear(2026);
  assert.deepEqual(ev26.map((e) => e.id), ["diwali-protein-2026", "monsoon-steps-2026", "new-year-2026"]);
  const diwali = ev26[0];
  assert.equal(diwali.from, "2026-10-29");
  assert.equal(diwali.to, "2026-11-12");
  const around = eventsAround("2026-09-30");
  assert.deepEqual(around.live.map((e) => e.id), ["monsoon-steps-2026"]);
  assert.deepEqual(around.soon.map((e) => e.id), ["diwali-protein-2026"]);
  assert.equal(eventById("new-year-2027")?.from, "2027-01-01");
  assert.equal(eventById("nope"), null);
  const pr = eventProgress(diwali, { proteinDays: ["2026-10-28", "2026-10-29", "2026-10-30"], stepsByDay: {}, logDays: [], trainDays: [] });
  assert.equal(pr.value, 2);
  assert.equal(pr.done, false);
  const monsoon = ev26[1];
  const steps: Record<string, number> = {};
  for (let i = 0; i < 30; i++) steps[addDays("2026-07-01", i)] = 8000;
  steps["2026-06-30"] = 20000;
  assert.equal(eventProgress(monsoon, { proteinDays: [], stepsByDay: steps, logDays: [], trainDays: [] }).done, true);
  steps["2026-07-01"] = 7999;
  assert.equal(eventProgress(monsoon, { proteinDays: [], stepsByDay: steps, logDays: [], trainDays: [] }).value, 29);
  const ny = ev26[2];
  const logs = Array.from({ length: 25 }, (_, i) => addDays("2026-01-01", i));
  const trains = logs.slice(0, 11);
  assert.equal(eventProgress(ny, { proteinDays: [], stepsByDay: {}, logDays: logs, trainDays: trains }).done, false);
  assert.equal(eventProgress(ny, { proteinDays: [], stepsByDay: {}, logDays: logs, trainDays: logs.slice(0, 12) }).done, true);
  assert.equal(eventWhen(monsoon, "2026-09-29"), "Ends in 1 day");
  assert.equal(eventWhen(monsoon, "2026-09-30"), "Ends today");
  assert.equal(eventWhen(diwali, "2026-09-30"), "Starts 29 Oct");
});

// ---------------------------------------------------------------- D11 packs
ok("packs", () => {
  assert.equal(GOLD_COVERS.length, 17);
  assert.equal(GOLD_COVERS[0].id, "plates-gold");
  assert.equal(GOLD_COVERS[0].darkIndex, 1);
  assert.equal(isGoldCover("summit-gold"), true);
  assert.equal(isGoldCover("summit-dark"), false);
  assert.equal(goldHex("#000000"), "#0b0906");
  assert.equal(goldHex("#ffffff"), "#fbe7a8");
  assert.equal(goldHex("#fff"), "#fbe7a8");
  assert.equal(goldHex("nope"), "nope");
  assert.equal(goldifySvg('<rect fill="#000"/><stop stop-color="#FFFFFF"/>'), '<rect fill="#0b0906"/><stop stop-color="#fbe7a8"/>');
  assert.equal(priceLabel(PACKS[0], true), "₹149 · free in the beta");
  assert.equal(priceLabel(PACKS[0], false), "₹149");
  assert.equal(parseSkin("rose"), "rose");
  assert.equal(parseSkin("x"), "classic");
  assert.equal(skinAllowed("classic", []), true);
  assert.equal(skinAllowed("rose", []), false);
  assert.equal(skinAllowed("rose", ["skin-rose"]), true);
});

// ---------------------------------------------------------------- D12 leagues (flag OFF)
ok("leagues", () => {
  assert.equal(leaguesOn(true), false); // client flag off
  assert.equal(tierName(1), "Diamond");
  assert.equal(tierName(9), "Bronze");
  assert.equal(movers(4), 0);
  assert.equal(movers(5), 1);
  assert.equal(movers(10), 2);
  const st = Array.from({ length: 5 }, (_, i) => ({ group_id: `g${i}`, points: [10, 50, 30, 50, 5][i] }));
  const res = closeWeek(st, 3);
  assert.deepEqual(res.map((r) => [r.group_id, r.movement]), [["g1", "up"], ["g3", "stay"], ["g2", "stay"], ["g0", "stay"], ["g4", "down"]]);
  assert.equal(closeWeek(st, 1)[0].movement, "stay"); // top tier can't go up
  assert.equal(closeWeek(st, 5).at(-1)!.movement, "stay"); // bottom can't go down
});

// ---------------------------------------------------------------- D4 coach view
ok("coach view", () => {
  assert.equal(normalizeUsername(" @Ayan_K "), "ayan_k");
  assert.equal(normalizeUsername("ab"), null);
  assert.equal(normalizeUsername("a.b.c"), null);
  const o = parseOverview({
    profile: { name: "Riya", protein_target_g: 100 },
    days: [
      { date: "2026-09-30", meals: 3, protein_g: 95, trained: true },
      { date: "2026-09-29", meals: 2, protein_g: 60, trained: false },
      { date: "2026-09-20", meals: 2, protein_g: 120, trained: true },
    ],
  });
  assert.equal(o.name, "Riya");
  assert.equal(adherenceLine(o, "2026-09-30"), "Logged 2 of 7 days · protein hit 1 · trained 1");
  assert.deepEqual(parseOverview(null).days, []);
});

// ---------------------------------------------------------------- D1 Wrapped
ok("wrapped", () => {
  assert.equal(parseWrappedKind("year"), "year");
  assert.equal(parseWrappedKind("weekly"), null);
  assert.deepEqual(
    (({ from, to }) => ({ from, to }))(wrappedPeriod("week", "2026-09-30")),
    { from: "2026-09-21", to: "2026-09-27" },
  );
  assert.equal(wrappedPeriod("month", "2026-09-30").from, "2026-08-01");
  const y = wrappedPeriod("year", "2026-09-30");
  assert.deepEqual([y.from, y.to, y.label], ["2026-01-01", "2026-09-29", "2026 so far"]);
  const y2 = wrappedPeriod("year", "2027-01-10");
  assert.deepEqual([y2.from, y2.to, y2.label], ["2026-01-01", "2026-12-31", "2026"]);
  const period = wrappedPeriod("week", "2026-09-30");
  const recap = buildRecap(period, { meals: [], workouts: [], exercises: [], weights: [], proteinTarget: 120, weeklyTarget: 3, streak: 0 });
  const slides = wrappedSlides(recap, "week", "Ayan Kapoor");
  assert.deepEqual(slides.map((s) => s.key), ["cover", "days", "next"]);
  assert.equal(slides[0].line, "Locked in, Ayan.");
  assert.ok(slides.every((s) => !/kcal/i.test(s.big + s.line)));
  const r2 = { ...recap, workouts: 4, minutes: 180, proteinDays: 5, streak: 12, topFoods: [{ name: "Dal", count: 6 }], weight: { start: 80, end: 79.2, delta: -0.8 }, squad: { name: "Iron", rank: 2, of: 6 } };
  const s2 = wrappedSlides(r2, "week");
  assert.deepEqual(s2.map((s) => s.key), ["cover", "days", "training", "protein", "weight", "food", "streak", "squad", "next"]);
  assert.equal(s2.find((s) => s.key === "weight")!.big, "−0.8 kg");
});

// ---------------------------------------------------------------- E2 language + regional foods
ok("i18n", () => {
  assert.equal(parseLang("hi"), "hi");
  assert.equal(parseLang("xx"), "en");
  assert.equal(t("nav.home", "hi"), "होम");
  assert.equal(t("dial.food", "hinglish"), "Khana");
  assert.equal(t("sync.waiting", "en", { n: 3 }), "3 waiting to sync");
  assert.equal(syncLabel(0), null);
  assert.equal(syncLabel(1, "hinglish"), "1 sync hona baaki");
  assert.equal(syncLabel(3, "hi"), "3 सिंक होना बाकी");
  for (const [k, v] of Object.entries(STRINGS)) assert.ok(v.every((s: string) => s.length > 0), k);
  assert.equal(regionalQuery("macher jhol"), "fish curry");
  assert.equal(regionalQuery("2 poli"), "2 chapati");
  assert.equal(regionalQuery("Thayir Sadam"), "curd rice");
  assert.equal(regionalQuery("mishti doi"), "mishti doi");
  assert.equal(regionalQuery("pav bhaji"), "pav bhaji"); // Hindi dish untouched
  assert.equal(regionalQuery("paneer tikka"), "paneer tikka");
  assert.equal(regionalMatch("luchi aur alu posto")?.canonical, "aloo posto");
});

// ---------------------------------------------------------------- E1 offline queue
ok("offline queue", () => {
  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError(new Error("Load failed")), true);
  assert.equal(isNetworkError(new Error("Pick a valid date")), false);
  assert.equal(shouldQueue(false), true);
  assert.equal(shouldQueue(true, new Error("NetworkError when attempting to fetch resource.")), true);
  assert.equal(shouldQueue(true, new Error("Add at least one exercise")), false);
  const now = new Date("2026-09-30T10:00:00Z");
  let q = enqueue([], { kind: "meal", payload: { raw_text: "2 roti" } }, now);
  q = enqueue(q, { kind: "water", payload: { ml: 250 } }, new Date("2026-09-30T09:00:00Z"));
  assert.deepEqual(ordered(q).map((x) => x.kind), ["water", "meal"]);
  const first = ordered(q)[0];
  let r = afterAttempt(q, first.id, "network");
  assert.equal(r.stop, true);
  assert.equal(r.queue.length, 2);
  r = afterAttempt(q, first.id, "ok");
  assert.equal(r.queue.length, 1);
  let qq = q;
  let dropped = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const a = afterAttempt(qq, first.id, "error", "bad");
    qq = a.queue;
    dropped = a.dropped;
  }
  assert.equal(qq.length, 1);
  assert.equal(dropped?.tries, MAX_TRIES);
});

// ---------------------------------------------------------------- E5 export + safety
ok("export + safety", () => {
  assert.equal(toCsv({ header: ["a", "b"], rows: [["x,y", 'say "hi"'], [1.234, null]] }, false), 'a,b\r\n"x,y","say ""hi"""\r\n1.23,\r\n');
  assert.equal(toCsv({ header: ["f"], rows: [["=SUM(A1)"], ["-5"]] }, false), "f\r\n'=SUM(A1)\r\n-5\r\n");
  assert.ok(toCsv({ header: ["a"], rows: [] }).startsWith("﻿"));
  assert.deepEqual(mealRows([{ date: "2026-09-30", raw_text: "dal", meal_type: "lunch", items: [{ name: "Dal", grams: 150, calories: 180, protein_g: 9 }] }])[0], ["2026-09-30", "lunch", "Dal", 150, 180, 9, null, null, "dal"]);
  assert.equal(mealRows([{ date: "2026-09-30", items: [] }]).length, 1);
  assert.ok(combinedCsv([{ name: "weights", header: ["date"], rows: [["2026-09-30"]] }]).includes("# weights\r\ndate"));
  assert.equal(deleteConfirmed(" delete "), true);
  assert.equal(deleteConfirmed("DELET"), false);
  assert.equal(parseReason("spam"), "spam");
  assert.equal(parseReason("x"), null);
  assert.equal(passwordProblem("12345", "12345"), "At least 6 characters");
  assert.equal(passwordProblem("123456", "123457"), "The two passwords don't match");
  assert.equal(passwordProblem("123456", "123456"), null);
  assert.deepEqual(withoutBlocked([{ user_id: "a" }, { user_id: "b" }], ["b"]), [{ user_id: "a" }]);
  assert.ok(reportSnapshot({ kind: "message", body: "hi", author_name: "Z", created_at: "2026-09-30T10:00:00Z" }).startsWith("by Z [message]"));
});

console.log(`check-v218-social: ${n} groups passed`);
