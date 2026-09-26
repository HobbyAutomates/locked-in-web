/**
 * `npx tsx scripts/check-milestones.ts` — v2.14 milestone flood (src/lib/milestones.ts) and the
 * "day warms up" glow (src/components/home/DayGlow.tsx warmth()).
 */
import { currentMilestones, nextMilestone, type MilestoneInput } from "../src/lib/milestones";
import { warmth } from "../src/components/home/DayGlow";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
}

const base: MilestoneInput = { today: "2026-09-26", dayStreak: 3, weightKg: 70, goalWeightKg: 66, goalType: "lose", workouts: [] };
check("nothing yet", currentMilestones(base).fire.length, 0);
check("7-day streak fires", nextMilestone({ ...base, dayStreak: 7 }, []).show?.key, "streak_7");
check("7-day streak only once", nextMilestone({ ...base, dayStreak: 8 }, ["streak_7"]).show, null);
check("a 45-day streak on first run doesn't flood 30", nextMilestone({ ...base, dayStreak: 45 }, []).show, null);
check("... but marks 7 and 30 seen", nextMilestone({ ...base, dayStreak: 45 }, []).silent.sort(), ["streak_30", "streak_7"]);
check("30 fires and silences 7", [nextMilestone({ ...base, dayStreak: 31 }, []).show?.key, nextMilestone({ ...base, dayStreak: 31 }, []).silent], ["streak_30", ["streak_7"]]);
check("100 fires", nextMilestone({ ...base, dayStreak: 100 }, ["streak_7", "streak_30"]).show?.big, "100");
check("goal reached (lose)", nextMilestone({ ...base, weightKg: 65.8 }, []).show?.key, "goal_reached:66");
check("goal reached beats a streak", nextMilestone({ ...base, weightKg: 66, dayStreak: 7 }, []).show?.share, "goal");
check("gain goal", nextMilestone({ ...base, goalType: "gain", goalWeightKg: 75, weightKg: 75.2 }, []).show?.key, "goal_reached:75");
check("maintain never floods for weight", nextMilestone({ ...base, goalType: "maintain", weightKg: 60 }, []).show, null);
const w = (id: string, date: string, kg: number, reps = 5) => ({ id, date, exercises_json: [{ name: "Bench Press", sets: [{ kg, reps }] }] });
const prs = { ...base, workouts: [w("a", "2026-09-10", 60), w("b", "2026-09-17", 62.5), w("c", "2026-09-25", 65)] };
check("fresh PR fires", nextMilestone(prs, []).show?.key, "pr:bench press:2026-09-25");
check("PR big number", nextMilestone(prs, []).show?.big, "65");
check("old PR doesn't", nextMilestone({ ...prs, today: "2026-10-05" }, []).show, null);
check("first session isn't a PR", nextMilestone({ ...base, workouts: [w("a", "2026-09-25", 60)] }, []).show, null);

const g = (o: Partial<Parameters<typeof warmth>[0]>) => warmth({ calories: 0, calorieTarget: 2000, protein: 0, proteinTarget: 140, trainedToday: false, loggedToday: false, ...o });
check("cold at 8 am", g({}), 0);
check("logged only = a quarter", g({ loggedToday: true }), 0.25);
check("everything hit = 1", g({ calories: 1950, protein: 140, trainedToday: true, loggedToday: true }), 1);
check("way over calories earns half", g({ calories: 3000 }), 0.125);
check("protein partial", g({ protein: 70 }), 0.125);

console.log(`\n${total - failures}/${total} passed`);
if (failures) process.exit(1);
