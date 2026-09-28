/**
 * v2.18 D8 accountability pledges (schema_v44 pledges + RPC squad_pledges). Honour system: no
 * money moves. The stake is text ("chai for the squad") and an optional rupee amount people
 * promise to "pay into the squad pot"; the in-app money step is "coming soon". Pure.
 * Android: util/Pledges.kt.
 */
import { addDays, daysBetween } from "../dates";

export const PLEDGE_PAYMENTS_LIVE = false;
export const PLEDGE_KINDS = ["log_days", "train_days", "protein_days", "custom"] as const;
export type PledgeKind = (typeof PLEDGE_KINDS)[number];
export type PledgeStatus = "active" | "kept" | "broken" | "cancelled";

export type Pledge = {
  id: string;
  user_id: string;
  name?: string;
  goal: string;
  kind: PledgeKind;
  target: number | null;
  stake: string;
  stake_inr: number;
  starts_on: string;
  ends_on: string;
  status: PledgeStatus;
  created_at: string;
};

export const PLEDGE_KIND_LABEL: Record<PledgeKind, string> = {
  log_days: "Log food on",
  train_days: "Train on",
  protein_days: "Hit protein on",
  custom: "My own goal",
};

export function parsePledgeKind(v: unknown): PledgeKind {
  return (PLEDGE_KINDS as readonly string[]).includes(v as string) ? (v as PledgeKind) : "custom";
}

export function parsePledge(r: Record<string, unknown>): Pledge {
  const st = r.status;
  return {
    id: String(r.id ?? ""),
    user_id: String(r.user_id ?? ""),
    name: typeof r.name === "string" ? r.name : undefined,
    goal: String(r.goal ?? ""),
    kind: parsePledgeKind(r.kind),
    target: r.target == null ? null : Math.max(1, Math.floor(Number(r.target)) || 1),
    stake: String(r.stake ?? ""),
    stake_inr: Math.max(0, Math.floor(Number(r.stake_inr ?? 0)) || 0),
    starts_on: String(r.starts_on ?? ""),
    ends_on: String(r.ends_on ?? ""),
    status: st === "kept" || st === "broken" || st === "cancelled" ? st : "active",
    created_at: String(r.created_at ?? ""),
  };
}

export type PledgeDraft = { goal: string; kind: PledgeKind; target: number | null; stake: string; stake_inr: number; starts_on: string; days: number };

/** Returns an error message, or null when the draft can be saved. */
export function validatePledge(d: PledgeDraft, today: string): string | null {
  if (d.goal.trim().length < 2) return "Say what you're pledging";
  if (d.goal.trim().length > 120) return "Keep the goal under 120 characters";
  if (!Number.isFinite(d.days) || d.days < 1 || d.days > 90) return "Pick 1 to 90 days";
  if (d.starts_on < today) return "Start today or later";
  if (d.kind !== "custom") {
    if (!d.target || d.target < 1) return "Set how many days";
    if (d.target > d.days) return `That's more days than the pledge has (${d.days})`;
  }
  if (d.stake.length > 120) return "Keep the stake under 120 characters";
  if (!Number.isFinite(d.stake_inr) || d.stake_inr < 0 || d.stake_inr > 100000) return "Stake between ₹0 and ₹1,00,000";
  return null;
}

export const endsOn = (starts: string, days: number) => addDays(starts, Math.max(1, Math.floor(days)) - 1);

/** Default goal line for a tracked kind: "Log food on 6 of 7 days". Custom keeps the typed text. */
export function goalText(kind: PledgeKind, target: number | null, days: number, custom: string): string {
  if (kind === "custom") return custom.trim();
  return `${PLEDGE_KIND_LABEL[kind]} ${target ?? days} of ${days} days`;
}

export type PledgeProgress = { done: number; needed: number; daysLeft: number; outcome: "active" | "kept" | "broken"; onTrack: boolean };

/**
 * Progress for a pledge from the days that counted (dates inside the window, up to today). A
 * tracked pledge is kept as soon as the target is reached and broken once it can't be reached any
 * more. Custom pledges are self-reported: "active" until their owner marks them.
 */
export function pledgeProgress(p: Pick<Pledge, "kind" | "target" | "starts_on" | "ends_on" | "status">, countedDays: Iterable<string>, today: string): PledgeProgress {
  const total = daysBetween(p.starts_on, p.ends_on) + 1;
  const needed = p.kind === "custom" ? 0 : Math.min(total, p.target ?? total);
  const set = new Set<string>();
  for (const d of countedDays) if (d >= p.starts_on && d <= p.ends_on && d <= today) set.add(d);
  const done = set.size;
  // Days still able to count: from today (unless today already counted) to the end.
  const from = today < p.starts_on ? p.starts_on : today;
  const daysLeft = today > p.ends_on ? 0 : daysBetween(from, p.ends_on) + 1 - (set.has(today) ? 1 : 0);
  if (p.status === "kept" || p.status === "broken") return { done, needed, daysLeft, outcome: p.status, onTrack: p.status === "kept" };
  if (p.kind === "custom") return { done, needed, daysLeft, outcome: "active", onTrack: true };
  if (done >= needed) return { done, needed, daysLeft, outcome: "kept", onTrack: true };
  if (done + daysLeft < needed) return { done, needed, daysLeft, outcome: "broken", onTrack: false };
  const elapsed = today < p.starts_on ? 0 : Math.min(total, daysBetween(p.starts_on, today) + 1);
  const pace = total > 0 ? (needed * elapsed) / total : 0;
  return { done, needed, daysLeft, outcome: "active", onTrack: done + 1 >= pace };
}

/** "Stake: chai for the squad · ₹200 into the squad pot". */
export function stakeLine(stake: string, inr: number): string {
  const parts = [stake.trim() ? stake.trim() : null, inr > 0 ? `₹${inr.toLocaleString("en-IN")} into the squad pot` : null].filter(Boolean);
  return parts.length ? `Stake: ${parts.join(" · ")}` : "No stake, just pride";
}

export const MONEY_STEP_NOTE = "Paying into the pot in the app is coming soon. For now it's on your honour.";
