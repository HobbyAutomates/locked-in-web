/**
 * `npx tsx scripts/check-battle.ts` — offline check of src/lib/battle.ts's scoring against the
 * table in docs/food-battle-spec.md. No DB access. Mirrors bandlog.battle_score in
 * supabase/schema_v28.sql, so any change to either must keep both files in sync with these cases.
 */
import { battleScore, isEligible, isUnderFuelled, pointsToLead, rankBattle, ratio, scoreRow, type BattleGoal, type ScoredBattleRow } from "../src/lib/battle";

type Case = { name: string; goal: BattleGoal; eaten: number; target: number; meals: number; expectScore: number; expectEligible: boolean; expectUnderFuelled?: boolean };

const cases: Case[] = [
  // Bulking (gain): 100 at 1.00-1.10, under: -200*(1-r), over: -150*(r-1.10)
  { name: "bulk over band (r=1.20, +10% past 1.10)", goal: "gain", eaten: 2640, target: 2200, meals: 3, expectScore: 100 - 150 * (1.2 - 1.1), expectEligible: true },
  { name: "bulk under band (r=0.90, 10% short)", goal: "gain", eaten: 1980, target: 2200, meals: 3, expectScore: 100 - 200 * (1 - 0.9), expectEligible: true },

  // Maintain: 100 at 0.95-1.05, penalty -200*(|r-1|-0.05)
  { name: "maintain in band (r=1.02)", goal: "maintain", eaten: 2244, target: 2200, meals: 3, expectScore: 100, expectEligible: true },
  { name: "maintain out of band (r=1.15)", goal: "maintain", eaten: 2530, target: 2200, meals: 3, expectScore: 100 - 200 * (0.15 - 0.05), expectEligible: true },

  // Cutting (lose): 100 at 0.90-1.00, over -250*(r-1), under -200*(0.90-r), capped 40 when r<0.75
  { name: "cutting at 95% (in band)", goal: "lose", eaten: 1900, target: 2000, meals: 3, expectScore: 100, expectEligible: true },
  { name: "cutting at 60% (capped, under-fuelled)", goal: "lose", eaten: 1200, target: 2000, meals: 2, expectScore: 40, expectEligible: true, expectUnderFuelled: true },

  // Eligibility: fewer than 2 meals never scores, regardless of how good the ratio looks.
  { name: "1 meal is ineligible even at a perfect ratio", goal: "lose", eaten: 1900, target: 2000, meals: 1, expectScore: 0, expectEligible: false },
];

let failures = 0;
function almostEqual(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

for (const c of cases) {
  const r = ratio(c.eaten, c.target);
  const eligible = isEligible(c.meals);
  const got = eligible ? battleScore(c.goal, r) : 0;
  const okScore = almostEqual(got, c.expectScore);
  const okEligible = eligible === c.expectEligible;
  const underFuelled = isUnderFuelled(c.goal, r);
  const okUnder = c.expectUnderFuelled === undefined || underFuelled === c.expectUnderFuelled;
  const ok = okScore && okEligible && okUnder;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}: r=${r.toFixed(3)} score=${got.toFixed(1)} (want ${c.expectScore.toFixed(1)}) eligible=${eligible} (want ${c.expectEligible}) underFuelled=${underFuelled}${c.expectUnderFuelled !== undefined ? ` (want ${c.expectUnderFuelled})` : ""}`,
  );
}

// Cap sanity: the safety cap for cutting never lets an extremely under-fuelled day score above 40.
{
  const r = ratio(400, 2000); // r = 0.20, wildly under
  const score = battleScore("lose", r);
  const ok = score <= 40;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  cutting extreme under-fuel (r=0.20) stays capped: score=${score.toFixed(1)} (<=40)`);
}

// Ties: more meals wins; if still tied, the earlier last-log time wins.
{
  const base = { avatarPath: null, private: false };
  const a: ScoredBattleRow = { ...base, userId: "a", name: "A", goalType: "maintain", eaten: 2200, target: 2200, meals: 3, r: 1, score: 100, eligible: true, underFuelled: false, canWin: true, tieBreakTime: "2026-01-01T08:00:00Z" } as ScoredBattleRow & { tieBreakTime: string };
  const b: ScoredBattleRow = { ...base, userId: "b", name: "B", goalType: "maintain", eaten: 2200, target: 2200, meals: 4, r: 1, score: 100, eligible: true, underFuelled: false, canWin: true, tieBreakTime: "2026-01-01T09:00:00Z" } as ScoredBattleRow & { tieBreakTime: string };
  const c: ScoredBattleRow = { ...base, userId: "c", name: "C", goalType: "maintain", eaten: 2200, target: 2200, meals: 4, r: 1, score: 100, eligible: true, underFuelled: false, canWin: true, tieBreakTime: "2026-01-01T07:30:00Z" } as ScoredBattleRow & { tieBreakTime: string };
  const ranked = rankBattle([a, b, c]);
  // b and c both have 4 meals (beat a's 3); c logged earlier than b, so c should lead.
  const ok = ranked[0].userId === "c" && ranked[1].userId === "b" && ranked[2].userId === "a";
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  tie-break: same score -> more meals wins (b,c over a); same meals -> earlier log wins (c over b). Order: ${ranked.map((x) => x.userId).join(",")}`);
}

// Private members can't win even with a great score.
{
  const winner = scoreRow({ userId: "priv", name: "Private", avatarPath: null, goalType: "maintain", eaten: 2200, target: 2200, meals: 3, private: true });
  const ok = winner.score === 100 && winner.eligible && !winner.canWin;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  private member scores normally but canWin=false (score=${winner.score}, canWin=${winner.canWin})`);
}

// pointsToLead: the leader gets no gap; a trailing eligible member gets a positive gap.
{
  const leader = scoreRow({ userId: "lead", name: "Lead", avatarPath: null, goalType: "maintain", eaten: 2200, target: 2200, meals: 3, private: false });
  const trailing = scoreRow({ userId: "trail", name: "Trail", avatarPath: null, goalType: "maintain", eaten: 2600, target: 2200, meals: 3, private: false });
  const rows = [leader, trailing];
  const leadGap = pointsToLead(leader, rows);
  const trailGap = pointsToLead(trailing, rows);
  const ok = leadGap === null && trailGap !== null && trailGap > 0;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  pointsToLead: leader=${leadGap}, trailing=${trailGap} (want null, >0)`);
}

console.log(`\n${cases.length + 4 - failures}/${cases.length + 4} passed.`);
if (failures) process.exit(1);
