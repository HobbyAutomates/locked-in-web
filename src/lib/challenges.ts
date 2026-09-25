import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysBetween, today } from "./dates";
import type { Challenge, ChallengeBoardRow, ChallengeKind, ChallengeStatus } from "./types";

/**
 * v2.7 squad challenges (see CHALLENGES_SPEC.md): the create-sheet defaults, the copy on the cards,
 * and the completion check that posts "🏆 completed" once a member hits the target. Scoring lives in
 * `bandlog.challenge_board`; the completion check repeats it for the caller alone.
 */

export const MAX_OPEN_CHALLENGES = 3;
export const CHALLENGE_LENGTHS = [7, 14, 30] as const;
export const PROTEIN_MIN = 40;
export const PROTEIN_MAX = 300;

/** v2.10: each kind's tag icon is ChallengeKindIcon (components/icons.tsx), not an emoji. */
export const CHALLENGE_TEMPLATES: { kind: ChallengeKind; label: string }[] = [
  { kind: "train_days", label: "Train days" },
  { kind: "protein_days", label: "Protein days" },
  { kind: "log_days", label: "Log every day" },
];

/** Log days: every day. Train days: 70% of the length. Protein days: 5 of every 7. */
export function defaultTarget(kind: ChallengeKind, length: number): number {
  const t = kind === "log_days" ? length : kind === "train_days" ? Math.round(length * 0.7) : Math.round((length * 5) / 7);
  return Math.max(1, Math.min(length, t));
}

/** "Train 10 of 14 days", "Hit 100 g protein 5 of 7 days", "Log food every day for 7 days" (≤ 60 chars). */
export function defaultTitle(kind: ChallengeKind, target: number, length: number, protein: number): string {
  const t =
    kind === "train_days"
      ? `Train ${target} of ${length} days`
      : kind === "protein_days"
        ? `Hit ${protein} g protein ${target} of ${length} days`
        : target === length
          ? `Log food every day for ${length} days`
          : `Log food ${target} of ${length} days`;
  return t.slice(0, 60);
}

/** The user's own protein goal when it fits the 40–300 g range, else 100. */
export function defaultProtein(goal: number | null | undefined): number {
  const g = Math.round(Number(goal ?? 0));
  return g >= PROTEIN_MIN && g <= PROTEIN_MAX ? g : 100;
}

export function challengeStatus(c: Pick<Challenge, "starts_on" | "ends_on">, t: string): ChallengeStatus {
  return t < c.starts_on ? "upcoming" : t > c.ends_on ? "ended" : "active";
}

export const challengeLength = (c: Pick<Challenge, "starts_on" | "ends_on">) => daysBetween(c.starts_on, c.ends_on) + 1;

/** "3 days left", "last day 👀", "starts tomorrow", "starts in 4 days", "ended". */
export function timeLabel(c: Pick<Challenge, "starts_on" | "ends_on">, t: string): string {
  const s = challengeStatus(c, t);
  if (s === "upcoming") {
    const n = daysBetween(t, c.starts_on);
    return n === 1 ? "starts tomorrow" : `starts in ${n} days`;
  }
  if (s === "ended") return "ended";
  const left = daysBetween(t, c.ends_on) + 1;
  return left === 1 ? "last day 👀" : `${left} days left`;
}

/** What counts as a day, in one line under the title. */
export function ruleLabel(kind: ChallengeKind, protein: number | null): string {
  return kind === "train_days" ? "Any workout counts" : kind === "protein_days" ? `${protein ?? 100} g+ protein counts` : "Any logged meal counts";
}

/** "12/14 days" (v2.10: the UI draws a Flame icon beside it once it's done, no emoji). */
export function progressLabel(progress: number, target: number): string {
  return `${progress}/${target} days`;
}

export const completionPostBody = (title: string) => `🏆 completed "${title}"`;

export function normalizeChallenge(r: Challenge): Challenge {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    ...r,
    target_days: n(r.target_days),
    protein_target: r.protein_target == null ? null : n(r.protein_target),
    my_progress: n(r.my_progress),
    leader_progress: n(r.leader_progress),
    participants: n(r.participants),
    completed_count: n(r.completed_count),
    status: r.status === "upcoming" || r.status === "ended" ? r.status : "active",
  };
}

export function normalizeBoard(rows: ChallengeBoardRow[]): ChallengeBoardRow[] {
  return rows.map((r) => ({ ...r, progress: Number(r.progress ?? 0) || 0, rank: Number(r.rank ?? 0) || 0, completed: !!r.completed }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

type OpenChallenge = { id: string; group_id: string; kind: ChallengeKind; title: string; target_days: number; protein_target: number | null; starts_on: string; ends_on: string };
type StatRow = { date: string; trained: boolean; protein_g: number | string; meals: number };

function qualifies(kind: ChallengeKind, s: StatRow, protein: number | null): boolean {
  if (kind === "train_days") return !!s.trained;
  if (kind === "protein_days") return Number(s.protein_g) >= Number(protein ?? Infinity);
  return Number(s.meals) > 0;
}

/**
 * After a save that touched daily_stats (and when the Challenges tab opens): for every active
 * challenge in my squads, if my qualifying days have reached the target and I haven't posted yet,
 * post "🏆 completed "<title>"" to that squad. ref_id = challenge id, so a repeat is a unique
 * violation that's ignored. Returns the ids it posted for. Never throws.
 */
export async function checkChallengeCompletions(supabase: AnyClient, userId: string): Promise<string[]> {
  try {
    const t = today();
    const { data: open, error } = await supabase
      .from("group_challenges")
      .select("id, group_id, kind, title, target_days, protein_target, starts_on, ends_on")
      .lte("starts_on", t)
      .gte("ends_on", t);
    if (error || !open?.length) return [];
    const list = open as OpenChallenge[];
    const { data: posted } = await supabase
      .from("group_posts")
      .select("ref_id")
      .eq("user_id", userId)
      .eq("kind", "challenge")
      .in(
        "ref_id",
        list.map((c) => c.id),
      );
    const done = new Set(((posted ?? []) as { ref_id: string | null }[]).map((p) => p.ref_id));
    const todo = list.filter((c) => !done.has(c.id));
    if (!todo.length) return [];
    const from = todo.reduce((a, c) => (c.starts_on < a ? c.starts_on : a), t);
    const { data: stats } = await supabase.from("daily_stats").select("date, trained, protein_g, meals").eq("user_id", userId).gte("date", from).lte("date", t);
    const rows = (stats ?? []) as StatRow[];
    const out: string[] = [];
    for (const c of todo) {
      const hi = c.ends_on < t ? c.ends_on : t;
      const progress = rows.filter((s) => s.date >= c.starts_on && s.date <= hi && qualifies(c.kind, s, c.protein_target)).length;
      if (progress < Number(c.target_days)) continue;
      const { error: e } = await supabase.from("group_posts").insert({ group_id: c.group_id, user_id: userId, kind: "challenge", body: completionPostBody(c.title), ref_id: c.id });
      if (!e) out.push(c.id);
      else if (e.code !== "23505") console.error("[checkChallengeCompletions]", e);
    }
    return out;
  } catch (e) {
    console.error("[checkChallengeCompletions] threw", e);
    return [];
  }
}

/** The create sheet's two start options. */
export const startOptions = (t: string) => [
  { key: "today" as const, label: "Today", date: t },
  { key: "tomorrow" as const, label: "Tomorrow", date: addDays(t, 1) },
];
