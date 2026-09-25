/**
 * `npx tsx scripts/check-sharing.ts` — offline check of src/lib/squadSharing.ts (v2.9 squad
 * sharing: auto-post switches, per-squad mute parsing, who may delete a post, the one-time hint
 * and what an edit re-posts). No DB access. Android mirrors these rules in util/SquadSharing.kt.
 */
import { autoPostAllowed, canDeletePost, editRepostPlan, missingColumn, parseAutoPost, parseAutoShare, shouldShowPostHint, withAutoShareKind } from "../src/lib/squadSharing";

let failures = 0;
let total = 0;
function check(why: string, got: unknown, expect: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${why} -> ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expect)})`}`);
}

// parseAutoShare: column missing / null → all three; unknown kinds dropped; canonical order.
check("auto_share missing (undefined) = all three", parseAutoShare(undefined), ["meal", "workout", "pr"]);
check("auto_share null = all three", parseAutoShare(null), ["meal", "workout", "pr"]);
check("auto_share empty array = nothing", parseAutoShare([]), []);
check("auto_share keeps canonical order, drops junk", parseAutoShare(["pr", "photo", "meal"]), ["meal", "pr"]);

// withAutoShareKind
check("turn workouts off", withAutoShareKind(["meal", "workout", "pr"], "workout", false), ["meal", "pr"]);
check("turn meals back on keeps order", withAutoShareKind(["workout", "pr"], "meal", true), ["meal", "workout", "pr"]);
check("turning on twice doesn't duplicate", withAutoShareKind(["meal"], "meal", true), ["meal"]);

// autoPostAllowed
check("share_stats off stops every kind", autoPostAllowed({ shareStats: false, autoShare: ["meal", "workout", "pr"], kind: "meal" }), false);
check("meal on", autoPostAllowed({ shareStats: true, autoShare: ["meal"], kind: "meal" }), true);
check("workout off", autoPostAllowed({ shareStats: true, autoShare: ["meal", "pr"], kind: "workout" }), false);
check("PR off, workout on", autoPostAllowed({ shareStats: true, autoShare: ["workout"], kind: "pr" }), false);
check("photo is an explicit share, not gated by auto_share", autoPostAllowed({ shareStats: true, autoShare: [], kind: "photo" }), true);

// parseAutoPost: missing column / null = on.
check("auto_post missing = on", parseAutoPost(undefined), true);
check("auto_post null = on", parseAutoPost(null), true);
check("auto_post false = off", parseAutoPost(false), false);

// missingColumn
check("PGRST204 on auto_share", missingColumn({ code: "PGRST204", message: "Could not find the 'auto_share' column of 'profiles' in the schema cache" }, "auto_share"), true);
check("42703 on auto_post", missingColumn({ code: "42703", message: "column group_members.auto_post does not exist" }, "auto_post"), true);
check("a different column isn't this one", missingColumn({ code: "42703", message: "column profiles.foo does not exist" }, "auto_share"), false);
check("RLS error isn't a missing column", missingColumn({ code: "42501", message: "new row violates row-level security policy" }, "auto_share"), false);
check("no error", missingColumn(null, "auto_share"), false);

// canDeletePost
check("my post", canDeletePost({ id: "a", user_id: "me" }, "me", false), true);
check("someone else's post, not owner", canDeletePost({ id: "a", user_id: "them" }, "me", false), false);
check("someone else's post, I own the squad", canDeletePost({ id: "a", user_id: "them" }, "me", true), true);
check("a message still sending can't be deleted", canDeletePost({ id: "temp-3", user_id: "me" }, "me", true), false);

// shouldShowPostHint
check("first post that wrote rows shows the hint", shouldShowPostHint(2, false), true);
check("already seen: never again", shouldShowPostHint(2, true), false);
check("RPC wrote nothing (muted everywhere): no hint", shouldShowPostHint(0, false), false);
check("null count: no hint", shouldShowPostHint(null, false), false);

// editRepostPlan
check("meal edit re-posts the meal it already has", editRepostPlan(["meal"], [{ kind: "meal", body: "Dal · 300 kcal" }]), { repost: [{ kind: "meal", body: "Dal · 300 kcal" }], remove: [] });
check("never-posted meal stays unposted", editRepostPlan([], [{ kind: "meal", body: "Dal · 300 kcal" }]), { repost: [], remove: [] });
check("workout + PR: PR no longer a PR is removed", editRepostPlan(["workout", "pr"], [{ kind: "workout", body: "Gym · 4 exercises" }, { kind: "pr", body: null }]), { repost: [{ kind: "workout", body: "Gym · 4 exercises" }], remove: ["pr"] });
check("edit that becomes a PR doesn't create a PR post", editRepostPlan(["workout"], [{ kind: "workout", body: "Gym · 5 exercises" }, { kind: "pr", body: "Bench 80 kg × 5" }]), { repost: [{ kind: "workout", body: "Gym · 5 exercises" }], remove: [] });

console.log(`\n${total - failures}/${total} passed.`);
if (failures) process.exit(1);
