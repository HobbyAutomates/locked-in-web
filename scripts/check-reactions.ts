/**
 * `npx tsx scripts/check-reactions.ts` — offline check of src/lib/reactions.ts (v2.11 reactions,
 * chat sender runs and read receipts). No DB access. Android mirrors these rules in
 * util/Reactions.kt.
 */
import { REACTIONS, chatRuns, normalizeReaction, parseCounts, quickHeart, reactionChips, reactionTotal, seenBy, toggleReaction, unreadLabel, type ReadRow } from "../src/lib/reactions";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, expect: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expect)})`}`);
}

// The six, in bar order, with ❤️ carrying its variation selector (the DB check stores it that way).
check("six reactions", REACTIONS.length, 6);
check("heart is U+2764 U+FE0F", [...REACTIONS[0]].map((c) => c.codePointAt(0)!.toString(16)), ["2764", "fe0f"]);
check("bare heart normalizes", normalizeReaction("❤"), "❤️");
check("unknown emoji is null", normalizeReaction("🍕"), null);
check("non-string is null", normalizeReaction(3), null);

// parseCounts: group_feed's jsonb, a pre-v35 row (undefined), junk.
check("counts from jsonb", parseCounts({ "❤️": 3, "🔥": 2 }), { "❤️": 3, "🔥": 2 });
check("pre-v35 row = none", parseCounts(undefined), {});
check("drops junk + zero, merges bare heart", parseCounts({ "❤": 1, "❤️": 2, "🍕": 4, "👍": 0, "😂": "2" }), { "❤️": 3, "😂": 2 });

// toggleReaction: add, same again removes, different replaces.
const empty = { counts: {}, mine: null };
const a = toggleReaction(empty, "🔥");
check("add first reaction", a, { state: { counts: { "🔥": 1 }, mine: "🔥" }, save: "🔥" });
const b = toggleReaction(a.state, "🔥");
check("same emoji removes it", b, { state: { counts: {}, mine: null }, save: null });
const c = toggleReaction({ counts: { "🔥": 2, "❤️": 1 }, mine: "🔥" }, "❤️");
check("different emoji replaces (count moves)", c, { state: { counts: { "🔥": 1, "❤️": 2 }, mine: "❤️" }, save: "❤️" });
check("replace last of a kind drops that key", toggleReaction({ counts: { "😮": 1 }, mine: "😮" }, "💪").state, { counts: { "💪": 1 }, mine: "💪" });
check("unknown emoji changes nothing", toggleReaction({ counts: { "👍": 1 }, mine: "👍" }, "🍕"), { state: { counts: { "👍": 1 }, mine: "👍" }, save: "👍" });
check("one per person: total never grows past members who reacted", reactionTotal(toggleReaction(toggleReaction(empty, "👍").state, "😂").state), 1);

// quickHeart (double-tap on a Feed post)
check("double-tap adds a heart", quickHeart(empty)?.save, "❤️");
check("double-tap replaces another emoji", quickHeart({ counts: { "🔥": 1 }, mine: "🔥" })?.state, { counts: { "❤️": 1 }, mine: "❤️" });
check("double-tap on my heart does nothing (never un-hearts)", quickHeart({ counts: { "❤️": 1 }, mine: "❤️" }), null);

// reactionChips: count desc, ties in bar order, mine flagged.
check(
  "chips order + mine",
  reactionChips({ counts: { "💪": 2, "❤️": 3, "🔥": 2 }, mine: "💪" }),
  [
    { emoji: "❤️", count: 3, mine: false },
    { emoji: "🔥", count: 2, mine: false },
    { emoji: "💪", count: 2, mine: true },
  ],
);
check("no chips when empty", reactionChips(empty), []);

// chatRuns: name on the first of a run, avatar/time on the last; 5 min gap or another sender breaks it.
const t0 = Date.parse("2026-09-25T10:00:00Z");
const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
check(
  "runs",
  chatRuns([
    { user_id: "a", created_at: at(0) },
    { user_id: "a", created_at: at(1) },
    { user_id: "a", created_at: at(2) },
    { user_id: "b", created_at: at(3) },
    { user_id: "a", created_at: at(4) },
    { user_id: "a", created_at: at(20) },
  ]),
  [
    { first: true, last: false },
    { first: false, last: false },
    { first: false, last: true },
    { first: true, last: true },
    { first: true, last: true },
    { first: true, last: true },
  ],
);
check("single message is its own run", chatRuns([{ user_id: "a", created_at: at(0) }]), [{ first: true, last: true }]);

// seenBy
const rows: ReadRow[] = [
  { user_id: "me", name: "Me", avatar_path: null, last_read_at: at(10) },
  { user_id: "b", name: "B", avatar_path: null, last_read_at: at(6) },
  { user_id: "c", name: "C", avatar_path: null, last_read_at: at(9) },
  { user_id: "d", name: "D", avatar_path: null, last_read_at: at(1) },
  { user_id: "e", name: "E", avatar_path: null, last_read_at: null },
];
const s1 = seenBy(rows, "me", at(5));
check("some seen: state + label", [s1.state, s1.label], ["some", "Seen by 2"]);
check("seen newest read first, unseen listed", [s1.seen.map((r) => r.user_id), s1.unseen.map((r) => r.user_id)], [["c", "b"], ["d", "e"]]);
check("read exactly at created_at counts as seen", seenBy(rows, "me", at(9)).seen.map((r) => r.user_id), ["c"]);
check("nobody yet = sent", seenBy(rows, "me", at(11)).label, "Sent");
check("everyone", seenBy(rows.slice(0, 3), "me", at(5)).label, "Seen by everyone");
check("alone in the squad = sent", seenBy(rows.slice(0, 1), "me", at(5)).state, "sent");
check("my own read time never counts", seenBy([{ user_id: "me", name: "Me", avatar_path: null, last_read_at: at(99) }], "me", at(5)).seen.length, 0);

// unreadLabel
check("0 unread = no badge", unreadLabel(0), null);
check("null unread = no badge", unreadLabel(null), null);
check("7 unread", unreadLabel(7), "7");
check("caps at 99+", unreadLabel(140), "99+");

console.log(`\n${total - failures}/${total} passed`);
if (failures) process.exit(1);
