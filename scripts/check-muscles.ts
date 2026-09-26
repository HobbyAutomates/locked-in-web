/**
 * `npx tsx scripts/check-muscles.ts` — the canonical exercise → muscle table (src/lib/muscles.ts)
 * and the weekly sets count / routine helpers (src/lib/training.ts). Android copies the table
 * verbatim; these checks keep it complete and consistent.
 */
import { EXERCISES } from "../src/lib/exercises";
import { EXERCISE_MUSCLES, REGIONS, musclesForExercise } from "../src/lib/muscles";
import { TEMPLATES, dayMinutes, heat, isoWeekday, normalizeDays, regionSets, regionsFor, templateNamesMissing, todaysDay, volumeBand } from "../src/lib/training";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

check("18 regions", REGIONS.length, 18);
const lib = EXERCISES.map((e) => e.name);
check("every library exercise is mapped", lib.filter((n) => !EXERCISE_MUSCLES[n]), []);
check("no mapping for a non-library name", Object.keys(EXERCISE_MUSCLES).filter((n) => !lib.includes(n)), []);
const bad: string[] = [];
for (const [n, s] of Object.entries(EXERCISE_MUSCLES)) {
  if (!s.primary.length) bad.push(`${n}: no primary`);
  for (const r of [...s.primary, ...s.secondary]) if (!(REGIONS as readonly string[]).includes(r)) bad.push(`${n}: ${r}`);
  if (s.primary.some((r) => s.secondary.includes(r))) bad.push(`${n}: primary also secondary`);
}
check("every mapping has a primary and valid, non-overlapping regions", bad, []);
const used = new Set(Object.values(EXERCISE_MUSCLES).flatMap((s) => [...s.primary, ...s.secondary]));
check("every region is trained by something", REGIONS.filter((r) => !used.has(r)), []);

check("lookup ignores case / punctuation", musclesForExercise("  bench PRESS "), { primary: ["chest"], secondary: ["front_delts", "triceps"] });
check("Pull-up", regionsFor("Pull-up").primary, ["lats"]);
check("unknown exercise → nothing", regionsFor("Underwater basket weaving"), { primary: [], secondary: [] });

const week = [
  { date: "2026-09-21", muscles: [], kind: "gym" as const, exercises_json: [{ name: "Bench press", sets: [{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }, { kg: 60, reps: 0 }] }, { name: "Pull-up", sets: [{ kg: null, reps: 8 }] }] },
  { date: "2026-09-23", muscles: ["Chest", "Back"], kind: "bands" as const, exercises_json: null },
  { date: "2026-09-10", muscles: [], kind: "gym" as const, exercises_json: [{ name: "Squat", sets: [{ kg: 80, reps: 5 }] }] },
];
const sets = regionSets(week, "2026-09-21", "2026-09-27");
check("chest = 2 bench sets + 3 band sets", sets.chest, 5);
check("triceps = 2 × 0.5", sets.triceps, 1);
check("lats = 1 pull-up + 3 band", sets.lats, 4);
check("biceps = 0.5 (pull-up secondary)", sets.biceps, 0.5);
check("squat outside the week not counted", sets.quads, 0);
check("volume bands", [volumeBand(0), volumeBand(4), volumeBand(10), volumeBand(20), volumeBand(21)], ["none", "low", "good", "good", "high"]);
check("heat", [heat(0), heat(10), heat(30)], [0, 0.5, 1]);

check("templates use library names only", templateNamesMissing(), []);
check("4 templates", TEMPLATES.map((t) => t.key), ["ppl", "upper_lower", "full_body", "bro_split"]);
check("ISO weekday of Mon 2026-09-21", isoWeekday("2026-09-21"), 1);
check("ISO weekday of Sun 2026-09-27", isoWeekday("2026-09-27"), 7);
const ppl = { days: TEMPLATES[0].days };
check("PPL Monday = Push", todaysDay(ppl, "2026-09-21")?.day.name, "Push");
check("PPL Sunday = rest", todaysDay(ppl, "2026-09-27"), null);
check("normalize clamps sets and drops blank names", normalizeDays([{ weekday: 9, name: "", exercises: [{ name: "Squat", sets: 99, reps: 0, rest_s: 5 }, { name: " " }] }]), [
  { weekday: 7, name: "Day 1", exercises: [{ name: "Squat", sets: 10, reps: 1, rest_s: 15, muscles: ["quads", "glutes"] }] },
]);
check("PPL push day ≈ minutes", dayMinutes(TEMPLATES[0].days[0]), 40);

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
