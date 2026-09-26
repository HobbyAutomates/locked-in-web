/**
 * `npx tsx scripts/check-coach.ts` — the v2.14 coach's pure rules (src/lib/coach.ts) against
 * fixtures: the three style prompts, the under-18 cap, the safety switch, the output guard, the
 * no-AI fallback notes, note timing and memory cleaning.
 */
import { cleanMemory, detectSafety, eveningDue, fallbackEvening, fallbackNote, guardReply, hhmmToMin, inQuietHours, noteDue, safetyReply, systemPrompt, violatesRules, type NoteFacts } from "../src/lib/coach";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

// ---- style prompts
const calm = systemPrompt("calm", { teen: false, kind: "chat" });
const balanced = systemPrompt("balanced", { teen: false, kind: "chat" });
const tough = systemPrompt("no_excuses", { teen: false, kind: "chat" });
check("calm: warm, no guilt", /CALM/.test(calm) && /zero guilt/i.test(calm), true);
check("balanced: one concrete ask", /BALANCED/.test(balanced) && /ONE concrete ask/.test(balanced), true);
check("no excuses: names the miss, one command, short", /NO EXCUSES/.test(tough) && /Name the missed behaviour/.test(tough) && /ONE command/.test(tough) && /short/i.test(tough), true);
for (const [name, p] of [["calm", calm], ["balanced", balanced], ["no_excuses", tough]] as const) {
  check(`${name}: habits, never appearance`, /NEVER comment on appearance/.test(p), true);
  check(`${name}: no medication advice`, /medication/.test(p) && /doctor/.test(p), true);
}
const teenTough = systemPrompt("no_excuses", { teen: true, kind: "chat" });
check("teen: no-excuses capped to balanced", /BALANCED/.test(teenTough) && !/NO EXCUSES/.test(teenTough), true);
check("teen: no deficit rule", /UNDER 18/.test(teenTough) && /No calorie deficit/.test(teenTough), true);
check("note task is short", /max 55 words/.test(systemPrompt("balanced", { teen: false, kind: "note" })), true);
check("roast is about habits", /habits only/.test(systemPrompt("no_excuses", { teen: false, kind: "roast" })), true);

// ---- safety switch fixtures
const safety: [string, string | null][] = [
  ["i want to kill myself", "self_harm"],
  ["honestly I hate my body", "body_hate"],
  ["i've stopped eating to lose weight faster", "not_eating"],
  ["I make myself throw up after dinner", "purging"],
  ["khana nahi khaya aaj, diet pe hu", "not_eating"],
  ["what should i eat for dinner, mess has rajma chawal", null],
  ["I'm starving after gym lol", null],
  ["been starving myself all week", "not_eating"],
  ["killed it at the gym today", null],
  ["this protein bar is fat free?", null],
];
for (const [text, want] of safety) check(`safety: "${text}"`, detectSafety(text), want);
check("safety reply mentions helplines", /helpline/i.test(safetyReply("not_eating")) && /helpline/i.test(safetyReply("self_harm")), true);

// ---- output guard
check("guard: looks comment replaced", guardReply("You're fat, skip dinner.", "no_excuses") !== "You're fat, skip dinner.", true);
check("guard: skip meals to lose → replaced", violatesRules("Skip dinner to lose it faster"), true);
check("guard: dosing → replaced", violatesRules("Take 500 mg of caffeine before gym"), true);
check("guard: normal reply kept", guardReply("118 g protein yesterday. 2 eggs at breakfast. Go.", "no_excuses"), "118 g protein yesterday. 2 eggs at breakfast. Go.");
check("guard: empty → fallback", guardReply("", "calm").length > 10, true);

// ---- fallback notes
const facts: NoteFacts = { proteinYesterday: 118, proteinTarget: 140, loggedYesterday: true, workoutsThisWeek: 1, workoutTarget: 4, dayStreak: 5, obstacles: ["exam_stress"] };
check("no-excuses names the gap", fallbackNote("no_excuses", facts).includes("22 g left on the table"), true);
check("calm mentions exams gently", fallbackNote("calm", facts).startsWith("Busy week"), true);
check("balanced gives one ask", /short on protein/.test(fallbackNote("balanced", facts)), true);
check("no log yesterday, calm = no guilt", /okay/.test(fallbackNote("calm", { ...facts, loggedYesterday: false })), true);
check("protein hit → training ask", /sessions this week/.test(fallbackNote("no_excuses", { ...facts, proteinYesterday: 140 })), true);
for (const s of ["calm", "balanced", "no_excuses"] as const) {
  for (const f of [facts, { ...facts, loggedYesterday: false }, { ...facts, proteinYesterday: 150, workoutsThisWeek: 5 }]) check(`${s} note never breaks rules`, violatesRules(fallbackNote(s, f)), false);
  check(`${s} evening never breaks rules`, violatesRules(fallbackEvening(s)), false);
}

// ---- timing
check("hh:mm parse", [hhmmToMin("08:00:00", 0), hhmmToMin("23:30", 0), hhmmToMin(null, 480), hhmmToMin("25:00", 60)], [480, 1410, 480, 60]);
check("quiet 23→7 covers 1 am", inQuietHours(60, 1380, 420), true);
check("quiet 23→7 not at noon", inQuietHours(720, 1380, 420), false);
check("note due after 8", noteDue(8 * 60 + 5, 480, { from: 1380, to: 420 }), true);
check("note not due at 7:59", noteDue(479, 480, { from: 1380, to: 420 }), false);
check("note at 6 am inside quiet hours waits", noteDue(360, 300, { from: 1380, to: 420 }), false);
check("evening nudge at 8:10 pm when nothing logged", eveningDue(20 * 60 + 10, false, { from: 1380, to: 420 }), true);
check("no evening nudge when logged", eveningDue(20 * 60 + 10, true, { from: 1380, to: 420 }), false);
check("no evening nudge when quiet from 20:00", eveningDue(20 * 60 + 10, false, { from: 1200, to: 420 }), false);

// ---- memory cleaning
check("memory ok", cleanMemory({ kind: "food", text: "loves paneer." }), { kind: "food", text: "Loves paneer" });
check("memory bad kind", cleanMemory({ kind: "secret", text: "x y z" }), null);
check("memory about looks dropped", cleanMemory({ kind: "body", text: "thinks they look fat" }), null);
check("memory too long dropped", cleanMemory({ kind: "life", text: "x".repeat(130) }), null);

console.log(`\n${total - failures}/${total} passed`);
if (failures) process.exit(1);
