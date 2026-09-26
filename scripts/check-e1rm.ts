/**
 * `npx tsx scripts/check-e1rm.ts` — offline check of src/lib/e1rm.ts (spec §12 PR charts).
 * Epley: e1RM = w × (1 + reps / 30). Android's util/E1rm.kt must match these vectors.
 */
import { bestSet, epley, exerciseHistory, isNewPr, loggedExercises, personalBest, round1 } from "../src/lib/e1rm";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

check("100 kg × 5 → 116.7", round1(epley(100, 5)), 116.7);
check("100 kg × 1 → 103.3", round1(epley(100, 1)), 103.3);
check("60 kg × 10 → 80", round1(epley(60, 10)), 80);
check("80 kg × 8 → 101.3", round1(epley(80, 8)), 101.3);
check("zero weight → 0", epley(0, 10), 0);
check("zero reps → 0", epley(100, 0), 0);

check("best set by e1RM", bestSet([{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }, { kg: 105, reps: 2 }]), { kg: 100, reps: 5, e1rm: 116.7 });
check("tie on e1RM → heavier", bestSet([{ kg: 60, reps: 10 }, { kg: 75, reps: 2 }]), { kg: 75, reps: 2, e1rm: 80 });
check("bodyweight sets → most reps", bestSet([{ kg: null, reps: 8 }, { kg: null, reps: 12 }]), { kg: null, reps: 12, e1rm: 0 });
check("no reps → null", bestSet([{ kg: 50, reps: 0 }]), null);

const W = (id: string, date: string, sets: { kg: number | null; reps: number }[], name = "Bench press") => ({ id, date, exercises_json: [{ name, sets }] });
const hist = [
  W("a", "2026-09-01", [{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }]),
  W("b", "2026-09-04", [{ kg: 62.5, reps: 8 }]),
  W("c", "2026-09-08", [{ kg: 60, reps: 6 }]),
  W("d", "2026-09-11", [{ kg: 65, reps: 8 }]),
  W("e", "2026-09-12", [{ kg: 20, reps: 10 }], "Dumbbell curl"),
];
const h = exerciseHistory(hist, "bench press");
check("history sessions", h.points.map((p) => p.workoutId), ["a", "b", "c", "d"]);
check("history e1RM", h.points.map((p) => p.best.e1rm), [76, 79.2, 72, 82.3]);
check("PR flags (first session is the baseline)", h.points.map((p) => p.pr), [false, true, false, true]);
check("volume of session a", h.points[0].volume, 960);
check("personal best", personalBest(h)?.workoutId, "d");
check("new PR beats 82.3", isNewPr(hist, "Bench press", [{ kg: 70, reps: 6 }]), true);
check("not a PR", isNewPr(hist, "Bench press", [{ kg: 60, reps: 8 }]), false);
check("first ever session is not a PR", isNewPr([], "Bench press", [{ kg: 60, reps: 8 }]), false);
check("logged exercises by sessions", loggedExercises(hist), [{ name: "Bench press", sessions: 4 }, { name: "Dumbbell curl", sessions: 1 }]);

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
