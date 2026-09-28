/**
 * v2.17 member plate (schema_v41: profiles.member_no, profiles.is_founder). Replaces v2.16's
 * "everyone is a founder" rule. In order:
 *   1. is_founder          → the gold "FOUNDER" plate (the owner's accounts only);
 *   2. member_no 1..50     → "OG #07" (two digits), same plate in a gunmetal / silver finish;
 *   3. otherwise           → no plate.
 * Before v41 the columns are missing (null / undefined here) → no plate at all, never FOUNDER.
 * Android: util/MemberPlate.kt, same rule. Pure, checked by scripts/check-v217.ts.
 */
export const OG_LIMIT = 50;

export type MemberPlate = { kind: "founder"; label: "FOUNDER" } | { kind: "og"; label: string; no: number };

export function memberPlate(isFounder: boolean | null | undefined, memberNo: number | null | undefined): MemberPlate | null {
  if (isFounder === true) return { kind: "founder", label: "FOUNDER" };
  const n = typeof memberNo === "number" && Number.isInteger(memberNo) ? memberNo : null;
  if (n != null && n >= 1 && n <= OG_LIMIT) return { kind: "og", label: `OG #${String(n).padStart(2, "0")}`, no: n };
  return null;
}
