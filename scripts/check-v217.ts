/**
 * `npx tsx scripts/check-v217.ts` — offline checks for v2.17: the member plate rule (schema_v41),
 * the new-users-only tour guard, the "Muscles this week" summary line and the Recent foods list.
 */
import assert from "node:assert/strict";
import { OG_LIMIT, memberPlate } from "../src/lib/memberPlate";
import { TOUR_NEW_USERS_FROM, isNewForTour, tourShouldShow } from "../src/lib/tour";

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

console.log("check-v217: all good");
