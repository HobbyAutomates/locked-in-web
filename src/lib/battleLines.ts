/**
 * One-liners for a squad Snap post (docs/food-battle-spec.md: "Snap-to-squad flow"). No LLM call —
 * a local template bank keyed on goal_type and progress (r = eaten / target, from src/lib/battle.ts).
 * Hype only. Never body- or food-shaming, never "you ate too much" — under-fuelled cutting days get
 * gentler, still-supportive lines, never praise for eating less.
 */
import { isUnderFuelled, ratio, type BattleGoal } from "./battle";

type Band = "under" | "low" | "band" | "high" | "over";

function bandFor(goal: BattleGoal, r: number): Band {
  const [lo, hi] = goal === "gain" ? [1.0, 1.1] : goal === "lose" ? [0.9, 1.0] : [0.95, 1.05];
  if (r < lo - 0.15) return "under";
  if (r < lo) return "low";
  if (r <= hi) return "band";
  if (r <= hi + 0.15) return "high";
  return "over";
}

const GAIN_LINES: Record<Band, string[]> = {
  under: ["Bulk needs fuel — next plate closes the gap 💪", "A quiet start. The next meal is where gains happen.", "Under target for a bulk — stack the next one up."],
  low: ["Warming up the bulk arc 📈", "Building toward target, one plate at a time.", "Gains loading… keep the plates coming."],
  band: ["Bulk arc loading 📈", "Right in the growth zone. Textbook.", "Surplus secured. Muscles say thanks 💪", "On-target and stacking — this is the way.", "Perfect bulking rep. Next plate, same energy."],
  high: ["Big appetite today — the gym earns it 🔥", "Surplus and then some. Let's put it to work.", "Feasting arc. Log the lift to match."],
  over: ["Serious hunger today — hydrate and roll with it.", "Big numbers on the board. Balance it out tomorrow.", "That's a heavy plate — no stress, keep logging."],
};

const MAINTAIN_LINES: Record<Band, string[]> = {
  under: ["A light one — your body still needs fuel to maintain.", "Under target today. The next meal can even it out.", "Running light — no need to force it, just keep tracking."],
  low: ["Close to the mark, nice control.", "Nearly dialed in — one more solid plate does it.", "Steady tracking. Maintenance mode, activated."],
  band: ["Clean plate, clean stats ✅", "Right on the number. Consistency wins.", "Maintenance mode: locked in 🎯", "Dialed in perfectly today.", "Textbook maintenance rep."],
  high: ["A little over, totally normal — keep the streak going.", "Slightly above target. One day doesn't move the needle.", "Bigger plate today, no drama — tomorrow's another rep."],
  over: ["Big day on the plate — balance finds itself over the week.", "Well above target, that's alright. Zoom out, not one day.", "A hearty one today. Stay consistent tomorrow."],
};

const LOSE_LINES: Record<Band, string[]> = {
  under: [
    "Under-fuelled — your body needs food, not less of it. Eat the next meal.",
    "That's too low for a cut. Add a proper meal, this isn't the goal.",
    "Running on empty isn't progress — refuel properly next plate.",
  ],
  low: ["Lean plate, on pace for the cut 🔥", "Nice discipline — right at the edge of the band.", "Solid cutting rep, staying sharp."],
  band: ["Protein check: passed ✅", "Clean cut, on target 🎯", "Right in the cutting band — that's the move.", "Deficit done right. Textbook cutting day.", "Locked in on the cut, no shortcuts needed."],
  high: ["A bit over today — totally fine, cuts aren't a straight line.", "Slightly above target. One plate, not a pattern.", "A little extra today, the week still adds up in your favor."],
  over: ["Bigger plate today — the deficit still works over the week, don't stress.", "Well over target, no big deal. Reset with the next meal.", "That's a hearty one — balance it out tomorrow, no rush."],
};

const LINES: Record<BattleGoal, Record<Band, string[]>> = { gain: GAIN_LINES, maintain: MAINTAIN_LINES, lose: LOSE_LINES };

// Deterministic-ish pick so re-renders of the same meal don't flicker between lines; callers that
// want variety across posts can pass a changing seed (e.g. Date.now() or the meal id's hash).
function pick(lines: string[], seed: number): string {
  const i = ((seed % lines.length) + lines.length) % lines.length;
  return lines[i];
}

/** A hype one-liner for a Snap post, given the member's goal and today's ratio after this meal. */
export function battleLine(goal: BattleGoal, eaten: number, target: number, seed = Date.now()): string {
  const r = ratio(eaten, target);
  const band = bandFor(goal, r);
  return pick(LINES[goal][band], seed);
}

/** True when the line context is an under-fuelled cutting day — callers can pair this with a gentler tone/CTA, never praise. */
export function isUnderFuelledLine(goal: BattleGoal, eaten: number, target: number): boolean {
  return isUnderFuelled(goal, ratio(eaten, target));
}
