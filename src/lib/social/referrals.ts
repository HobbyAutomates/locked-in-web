/**
 * v2.18 D2 referrals (schema_v44: profiles.referral_code / referral_pro_days, referrals, RPCs
 * my_referral_code, referral_claim, my_referrals). Pure. Android: util/Referrals.kt.
 *
 * Invite link: <site>/r/<CODE>. Opening it stores the code on the device (web localStorage
 * `li-ref`, Android prefs) and goes to sign-up; once signed in, the app claims it once.
 * Both people get 1 week of Pro (referralGrant below mirrors bandlog.grant_referral_week).
 */
import type { Plan } from "../pro";

export const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REF_STORAGE_KEY = "li-ref";
export const REF_BONUS_DAYS = 7;
/** Only accounts younger than this can claim a code (the server enforces it too). */
export const REF_MAX_ACCOUNT_AGE_DAYS = 30;

/** "ab-c 12x" → "ABC12X"; anything that can't be a code → null. */
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 6) return null;
  for (const ch of c) if (!REF_ALPHABET.includes(ch)) return null;
  return c;
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${code}`;
}

/** The share text that goes with the link. */
export function inviteText(name: string | null | undefined, url: string): string {
  const who = name?.trim() ? `${name.trim()} invited you to Locked In.` : "Join me on Locked In.";
  return `${who} Log food in Hinglish, train with a squad, and we both get a week of Pro. ${url}`;
}

export type Grant = { kind: "extended" | "banked"; plan: Plan; pro_until: string | null; bankedDays: number };

/**
 * 1 week of Pro for one person. Beta with no end date (everyone during the beta) → 7 days banked
 * (plan and pro_until untouched, so nobody's beta gets an end date). Otherwise pro_until =
 * max(now, pro_until) + 7 days, and a free plan becomes pro.
 */
export function referralGrant(plan: Plan, proUntil: string | null, now: Date = new Date(), banked = 0): Grant {
  if (plan === "beta" && !proUntil) return { kind: "banked", plan, pro_until: null, bankedDays: banked + REF_BONUS_DAYS };
  const cur = proUntil ? Date.parse(proUntil) : NaN;
  const base = Number.isFinite(cur) && cur > now.getTime() ? cur : now.getTime();
  return { kind: "extended", plan: plan === "free" ? "pro" : plan, pro_until: new Date(base + REF_BONUS_DAYS * 864e5).toISOString(), bankedDays: banked };
}

export type ClaimReason = "unknown" | "self" | "already" | "too_old" | "missing" | "error";

export function claimMessage(r: { ok: boolean; reason?: string | null; referrer_name?: string | null }): string {
  if (r.ok) return `You and ${r.referrer_name || "your friend"} both get 1 week of Pro.`;
  switch (r.reason as ClaimReason) {
    case "unknown":
      return "That invite code doesn't exist.";
    case "self":
      return "That's your own invite.";
    case "already":
      return "You've already used an invite.";
    case "too_old":
      return "Invites are for new accounts.";
    case "missing":
      return "Invites turn on with the next server update.";
    default:
      return "Couldn't use that invite right now.";
  }
}

/** "1 week of Pro banked" / "3 weeks of Pro banked" / "10 days of Pro banked" / null. */
export function bankedText(days: number | null | undefined): string | null {
  const d = Math.max(0, Math.floor(Number(days ?? 0)) || 0);
  if (!d) return null;
  if (d % 7 === 0) {
    const w = d / 7;
    return `${w} ${w === 1 ? "week" : "weeks"} of Pro banked`;
  }
  return `${d} ${d === 1 ? "day" : "days"} of Pro banked`;
}
