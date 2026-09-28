/**
 * `npx tsx scripts/check-v216.ts` — offline checks for v2.16: the BMI reading on Progress (bug:
 * 74.5 kg at 166 cm showed 19.0), the cover preset list and the jewellery badge taxonomy that
 * Android shares (docs/v216-shared.md).
 */
import assert from "node:assert/strict";
import { bmi, bmiCategoryIndia, bmiReading } from "../src/lib/bmi";
import { COVER_PRESETS, DEFAULT_COVER, coverPreset, isCoverId } from "../src/lib/covers";
import { COVER_ART } from "../src/lib/coverArt";
import { ALL_BADGES } from "../src/lib/badges";
import { CATEGORY_SHAPE, GEM, METAL, badgeId, jewelCategory, jewelTier, newlyEarned, nextJewel, streakJewel, topJewel, unlockLine, UNLOCK_LINES } from "../src/lib/jewels";

// ---- BMI: the reported case, and every Indian cut-off edge
const r = bmiReading(74.5, 166)!;
assert.equal(r.value, 27.0);
assert.equal(r.category, "Obese");
assert.equal(r.words, "Above healthy");
assert.equal(Math.round(bmi(74.5, 166)! * 10) / 10, 27.0);
assert.equal(bmiReading(null, 166), null);
assert.equal(bmiReading(70, 0), null);
assert.equal(bmiCategoryIndia(18.4), "Underweight");
assert.equal(bmiCategoryIndia(18.5), "Normal");
assert.equal(bmiCategoryIndia(22.9), "Normal");
assert.equal(bmiCategoryIndia(23.0), "Overweight");
assert.equal(bmiCategoryIndia(24.9), "Overweight");
assert.equal(bmiCategoryIndia(25.0), "Obese");
// The chip and the number come from the same rounded value: 22.96 rounds to 23.0 → Overweight.
const edge = bmiReading(22.96 * 1.7 * 1.7, 170)!;
assert.equal(edge.value, 23.0);
assert.equal(edge.category, "Overweight");
assert.equal(bmiReading(55, 166)!.words, "Healthy"); // 20.0
assert.equal(bmiReading(48, 166)!.words, "Below healthy"); // 17.4
assert.equal(bmiReading(66, 166)!.words, "A little above healthy"); // 24.0

// ---- covers: 34 = 17 motifs x light/dark, #01 plates-light is the default, art for every one
assert.equal(COVER_PRESETS.length, 34);
assert.equal(COVER_ART.length, 34);
assert.equal(new Set(COVER_PRESETS.map((c) => c.id)).size, 34);
assert.deepEqual(
  COVER_PRESETS.map((c) => c.n),
  Array.from({ length: 34 }, (_, i) => i + 1),
);
assert.equal(COVER_PRESETS[0].id, DEFAULT_COVER);
assert.equal(DEFAULT_COVER, "plates-light");
assert.equal(coverPreset("nope").id, "plates-light");
assert.equal(coverPreset(null).n, 1);
assert.equal(coverPreset("ember-dark").n, 34);
assert.ok(isCoverId("court-light") && !isCoverId("court") && !isCoverId(5));
for (const c of COVER_PRESETS) assert.equal(c.tone, c.n % 2 ? "light" : "dark");
for (const svg of COVER_ART) assert.ok(!/id="[^"]*"/.test(svg.replace(/id="[^"]*__U"/g, "")), "every cover id is instance-scoped");

// ---- jewels: shapes / gems by category, fixed tiers, stable ids
assert.equal(CATEGORY_SHAPE.streak, "shield");
assert.equal(CATEGORY_SHAPE.nutrition, "hexagon");
assert.equal(CATEGORY_SHAPE.training, "diamond");
assert.equal(CATEGORY_SHAPE.squad, "round");
assert.equal(CATEGORY_SHAPE.special, "octagon");
assert.equal(Object.keys(METAL).join(), "bronze,silver,gold,platinum");
assert.equal(GEM.streak[1], "#FF5B1F");
const ids = ALL_BADGES.map(badgeId);
assert.deepEqual(ids, ["rookie", "getting-serious", "locked-in", "triple-threat", "no-days-off", "immortal", "forking-around", "mission-nutrition", "the-logfather", "one-hit-wonder", "loyalty-iii", "bullseye"]);
assert.deepEqual(ALL_BADGES.map(jewelTier), ["bronze", "silver", "gold", "gold", "platinum", "platinum", "bronze", "silver", "gold", "bronze", "silver", "gold"]);
assert.deepEqual([...new Set(ALL_BADGES.map(jewelCategory))], ["streak", "nutrition", "special"]);

const p = { streakDays: 12, meals: 60, goalDays: 0 };
assert.equal(topJewel(p)!.id, "mission-nutrition"); // tier tie (silver) → the harder need wins
assert.equal(nextJewel(p)!.id, "locked-in"); // 12 of 50 is the closest locked one
assert.equal(topJewel({ streakDays: 0, meals: 0, goalDays: 0 }), null);
assert.deepEqual(newlyEarned(p, null), []); // first run on a device: nothing floods in
assert.deepEqual(
  newlyEarned(p, ["rookie"]).map((x) => x.id),
  ["getting-serious", "forking-around", "mission-nutrition"],
);
assert.equal(streakJewel(2), null);
assert.equal(streakJewel(3)!.tier, "bronze");
assert.equal(streakJewel(19)!.name, "Getting Serious");
assert.ok((UNLOCK_LINES as readonly string[]).includes(unlockLine("rookie")));
assert.equal(unlockLine("rookie"), unlockLine("rookie"));

console.log("check-v216: all good");
