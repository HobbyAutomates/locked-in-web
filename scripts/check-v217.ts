/**
 * `npx tsx scripts/check-v217.ts` — offline checks for v2.17: the member plate rule (schema_v41),
 * the new-users-only tour guard, the "Muscles this week" summary line and the Recent foods list.
 */
import assert from "node:assert/strict";
import { OG_LIMIT, memberPlate } from "../src/lib/memberPlate";
import { TOUR_NEW_USERS_FROM, isNewForTour, tourShouldShow } from "../src/lib/tour";
import { MUSCLE_GROUPS, musclesWeekLine, trainedGroups } from "../src/lib/musclesWeek";
import { REGIONS } from "../src/lib/muscles";
import { emptyRegionSets } from "../src/lib/training";
import { RECENT_LIMIT, recentFoods, recentKey, type RecentMeal, type RecentScan } from "../src/lib/recents";
import type { MealItem } from "../src/lib/types";

// ---- member plate: founder first, then OG #nn for 1..50, else none; missing columns = none
assert.equal(OG_LIMIT, 50);
assert.deepEqual(memberPlate(true, 1), { kind: "founder", label: "FOUNDER" });
assert.deepEqual(memberPlate(true, 400), { kind: "founder", label: "FOUNDER" });
assert.deepEqual(memberPlate(true, null), { kind: "founder", label: "FOUNDER" });
assert.equal(memberPlate(false, 7)?.label, "OG #07");
assert.equal(memberPlate(false, 1)?.label, "OG #01");
assert.equal(memberPlate(false, 10)?.label, "OG #10");
assert.equal(memberPlate(false, 50)?.label, "OG #50");
assert.equal(memberPlate(null, 7)?.kind, "og");
assert.equal(memberPlate(false, 51), null);
assert.equal(memberPlate(false, 0), null);
assert.equal(memberPlate(false, -3), null);
assert.equal(memberPlate(false, 7.5), null);
assert.equal(memberPlate(false, null), null);
// pre-v41: both columns missing → no plate at all, never FOUNDER
assert.equal(memberPlate(undefined, undefined), null);
assert.equal(memberPlate(null, null), null);

// ---- tour: new accounts only (created after the v2.16 release), replay for anyone
assert.equal(TOUR_NEW_USERS_FROM, "2026-09-28T21:00:00Z");
assert.equal(isNewForTour("2026-09-28T21:00:00Z"), false); // the release instant itself is "existing"
assert.equal(isNewForTour("2026-09-28T21:00:01Z"), true);
assert.equal(isNewForTour("2026-09-29 02:31:00+05:30"), true); // 21:01 UTC
assert.equal(isNewForTour("2026-09-29 02:29:00+05:30"), false); // 20:59 UTC
assert.equal(isNewForTour("2026-09-20T10:00:00Z"), false);
assert.equal(isNewForTour(null), false);
assert.equal(isNewForTour(""), false);
assert.equal(isNewForTour("not a date"), false);
const NEW = "2026-10-01T08:00:00Z";
const OLD = "2026-08-01T08:00:00Z";
assert.equal(tourShouldShow({ done: false, replay: false, serverSeen: false, createdAt: NEW }), true);
assert.equal(tourShouldShow({ done: false, replay: false, serverSeen: false, createdAt: OLD }), false); // existing user: never
assert.equal(tourShouldShow({ done: false, replay: false, serverSeen: false, createdAt: null }), false);
assert.equal(tourShouldShow({ done: true, replay: false, serverSeen: false, createdAt: NEW }), false);
assert.equal(tourShouldShow({ done: false, replay: false, serverSeen: true, createdAt: NEW }), false);
assert.equal(tourShouldShow({ done: true, replay: true, serverSeen: true, createdAt: OLD }), true); // replay works for anyone
assert.equal(tourShouldShow({ done: false, replay: true, serverSeen: false, createdAt: null }), true);

// ---- Muscles this week: every region in exactly one group; the one-line summary
assert.deepEqual([...MUSCLE_GROUPS.flatMap((g) => g.regions)].sort(), [...REGIONS].sort());
const sets = { ...emptyRegionSets(), chest: 6, lats: 4, quads: 9, calves: 1.5 };
assert.deepEqual(trainedGroups(sets), ["Chest", "Back", "Legs"]);
assert.equal(musclesWeekLine(sets, 4), "Chest, back, legs · 4 sessions");
assert.equal(musclesWeekLine({ ...emptyRegionSets(), biceps: 3 }, 1), "Arms · 1 session");
assert.equal(musclesWeekLine(emptyRegionSets(), 0), "Nothing trained yet this week");
assert.equal(musclesWeekLine(emptyRegionSets(), 2), "2 sessions"); // e.g. only cardio / untagged
assert.equal(musclesWeekLine({ ...emptyRegionSets(), abs: 2 }, 0), "Core");

// ---- Recent: deduped by food, newest first, last-used amount, at most 12, scans included
const item = (name: string, over: Partial<MealItem> = {}): MealItem => ({ food_id: null, name, grams: 100, calories: 200, protein_g: 10, carbs_g: 20, fat_g: 5, source: "table", confidence: 1, micros: {}, unit: "g", servings: null, ...over });
const meals: RecentMeal[] = [
  { created_at: "2026-09-29T08:00:00Z", items: [item("Roti", { food_id: "roti", grams: 80, calories: 240, unit: "serving", servings: 2 }), item("Dal", { food_id: "dal", grams: 150, calories: 180 })] },
  { created_at: "2026-09-28T13:00:00Z", items: [item("Roti", { food_id: "roti", grams: 120, calories: 360, unit: "serving", servings: 3 }), item("Whey Bar", { source: "scan", grams: 60, calories: 230, unit: "serving", servings: 1 })] },
  { created_at: "2026-09-27T13:00:00Z", items: [item("  whey   bar ", { source: "scan", grams: 120, calories: 460 }), item("Zero grams", { grams: 0 })] },
];
const scans: RecentScan[] = [
  { id: "s1", kind: "barcode", product: "Whey Bar", created_at: "2026-09-29T10:00:00Z", image_url: "https://x/bar.jpg", per100: { calories: 383, protein_g: 33, carbs_g: 40, fat_g: 10 }, serving_g: 60 },
  { id: "s2", kind: "label", product: "Oats", created_at: "2026-09-26T10:00:00Z", image_url: null, per100: { calories: 389, protein_g: 17, carbs_g: 66, fat_g: 7 }, serving_g: 40 },
  { id: "s3", kind: "label", product: "No numbers", created_at: "2026-09-29T11:00:00Z", image_url: null, per100: null },
  { id: "s4", kind: "photo", product: "Plate", created_at: "2026-09-29T12:00:00Z", image_url: null },
];
const rec = recentFoods(meals, scans);
assert.deepEqual(rec.map((r) => r.name), ["Whey Bar", "Roti", "Dal", "Oats"]);
// the bar was scanned again today but logged before: the newest LOGGED amount (1 serving, 230 kcal) wins, at the scan's time
assert.equal(rec[0].kcal, 230);
assert.equal(rec[0].at, "2026-09-29T10:00:00Z");
assert.equal(rec[0].image, "https://x/bar.jpg");
// roti: the newest log (2 roti, 240 kcal) is the last-used amount
assert.equal(rec[1].kcal, 240);
assert.equal(rec[1].item.servings, 2);
assert.equal(rec[1].food.per100.calories, 300);
// a scan never logged: 1 serving (40 g of 389 kcal / 100 g)
assert.equal(rec[3].qty, "1 serving");
assert.equal(rec[3].kcal, 156);
assert.equal(rec[3].kind, "label");
assert.equal(recentKey(null, "  Whey   BAR "), "n:whey bar");
assert.equal(recentKey("abc", "x"), "f:abc");
const many: RecentMeal[] = Array.from({ length: 20 }, (_, i) => ({ created_at: `2026-09-${String(10 + i).padStart(2, "0")}T08:00:00Z`, items: [item(`Food ${i}`)] }));
const capped = recentFoods(many);
assert.equal(RECENT_LIMIT, 12);
assert.equal(capped.length, 12);
assert.equal(capped[0].name, "Food 19");
assert.deepEqual(recentFoods([], []), []);

console.log("check-v217: all good");
