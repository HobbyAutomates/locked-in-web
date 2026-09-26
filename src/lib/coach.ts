import { effectiveCoachStyle, type CoachStyle } from "./onboardingV2";

/**
 * v2.14 AI coach: the pure rules (docs/v214-spec.md, plan §2). Style prompts, the safety switch,
 * the output guard and the no-AI fallback notes. scripts/check-coach.ts runs fixtures against all
 * of it; the server (coachServer.ts) only wires these to the model and the database.
 */

export type { CoachStyle };
export type MemoryKind = "goal" | "food" | "life" | "body" | "style";
export const MEMORY_KINDS: MemoryKind[] = ["goal", "food", "life", "body", "style"];
export const isMemoryKind = (v: unknown): v is MemoryKind => typeof v === "string" && (MEMORY_KINDS as string[]).includes(v);

export type Memory = { id: string; kind: MemoryKind; text: string; source: "onboarding" | "chat" | "inferred"; pinned: boolean; kept: boolean; created_at: string };

export type CoachCard =
  | { type: "meal_logged"; meal_id: string; meal_type: string; title: string; kcal: number; protein_g: number }
  | { type: "water_logged"; ml: number }
  | { type: "remaining"; kcal: number; protein: number; carbs: number; fat: number }
  | { type: "suggestions"; items: { name: string; portion: string; kcal: number; protein: number }[] }
  | { type: "fast_started"; hours: number }
  | { type: "memory"; id: string; kind: MemoryKind; text: string }
  | { type: "helpline" };

export type CoachMessage = { id: string; role: "user" | "coach"; text: string; tool: { cards?: CoachCard[]; safety?: true } | null; created_at: string };

// ---------------------------------------------------------------- style prompts

/** The voice for each style. All three share the same hard rules (RULES below). */
export const STYLE_RULES: Record<CoachStyle, string> = {
  calm: "Voice: CALM. Warm and encouraging, zero guilt. Acknowledge the effort first. Suggest at most one small, easy next step. Never use words like 'failed', 'excuse', 'lazy' or 'no excuses'.",
  balanced: "Voice: BALANCED. Honest and supportive. Say plainly where they stand (one number is fine), then give exactly ONE concrete ask for today.",
  no_excuses:
    "Voice: NO EXCUSES (tough love). Direct and short. Name the missed behaviour plainly (a skipped workout, a missed protein target, no logs), then give ONE command with a time or a number. No cushioning, no emojis. Tough on habits only.",
};

/** Rules every style follows, whatever the user asks. */
export const RULES = [
  "Talk about habits (food, protein, training, sleep, water, logging, consistency). NEVER comment on appearance, looks or body shape, and never shame weight.",
  "Never give medication, supplement-dose or medical advice. For anything medical, say to check with their doctor.",
  "Never suggest eating under their calorie floor, skipping meals as punishment, purging, or 'earning' food with exercise.",
  "Keep replies short: 1 to 4 sentences for chat, no headings, no bullet lists unless asked. Use Indian food examples (dal, paneer, curd, eggs, roti, poha, chana, soya) and plain English; Hinglish is fine if they write in Hinglish.",
  "Use the numbers in CONTEXT; don't invent logs. If they ask you to log food or water, use the tools.",
];

export const TEEN_RULE = "The user is UNDER 18. Maximum tone is Balanced. No calorie deficit, no weight-loss targets, no fasting, no keto or low-carb. Focus on protein, regular meals, sleep, training and consistency.";

/** The system prompt for one style (teen accounts are capped at Balanced here too). */
export function systemPrompt(style: CoachStyle, opts: { teen: boolean; name?: string; kind: "chat" | "note" | "roast" | "evening" }): string {
  const s = effectiveCoachStyle(style, opts.teen ? 15 : 30);
  const parts = [
    `You are the Locked In coach${opts.name ? ` for ${opts.name}` : ""}: an AI fitness and nutrition coach inside an Indian fitness app for students and young adults.`,
    STYLE_RULES[s],
    "HARD RULES:",
    ...RULES.map((r, i) => `${i + 1}. ${r}`),
  ];
  if (opts.teen) parts.push(TEEN_RULE);
  if (opts.kind === "note") parts.push("TASK: write today's morning note: 2 to 3 sentences, max 55 words. Reference one real number from yesterday or this week in CONTEXT, then the one thing to do today. No greeting line, no sign-off.");
  if (opts.kind === "evening") parts.push("TASK: it's 8 pm and nothing is logged today. Write ONE short nudge (max 25 words) to log something or have a protein-rich dinner. No guilt for Calm.");
  if (opts.kind === "roast") parts.push("TASK: the Sunday weekly roast: 3 to 4 short punchy sentences about THIS WEEK'S habits from CONTEXT (logs, protein, workouts). Funny and blunt about habits only, then one command for next week. Never about looks or weight.");
  return parts.join("\n");
}

// ---------------------------------------------------------------- safety

export type SafetyKind = "not_eating" | "purging" | "self_harm" | "body_hate";

const SAFETY: [SafetyKind, RegExp][] = [
  ["self_harm", /\b(kill myself|end (it|my life)|suicid\w*|self[- ]?harm|cut(ting)? myself|want to die|don'?t want to live|marna chahta|marna chahti|mar jaana)\b/i],
  ["purging", /\b(purg\w*|throw(ing)? up (after|on purpose)|make myself (throw up|vomit|sick)|vomit\w* (after|on purpose)|laxatives? to lose|ulti kar)/i],
  ["not_eating", /\b(stop(ped)? eating|not eating (anything|at all|for)|haven'?t eaten (in|for) (\d+|two|three|four|five) days|starv(e|ing) myself|skip(ping)? all (my )?meals|khana (nahi|nahin) kha(ya|ta|ti|unga|ungi)|bhookh? (reh|rah))/i],
  ["body_hate", /\b(hate (my|this) body|i'?m (so )?(fat|ugly|disgusting)|disgusted (with|by) (my ?self|my body)|apne body se nafrat)\b/i],
];

/** Does this message need the safety switch (calm voice + helpline card + a flag)? */
export function detectSafety(text: string): SafetyKind | null {
  for (const [kind, re] of SAFETY) if (re.test(text)) return kind;
  return null;
}

/** The fixed calm reply when the safety switch trips (no model call; the helpline card follows). */
export function safetyReply(kind: SafetyKind): string {
  if (kind === "self_harm") return "I'm really glad you told me. You deserve support from a real person right now: please reach out to one of the helplines below, or someone you trust. You don't have to handle this alone.";
  if (kind === "body_hate") return "That sounds heavy, and you're not alone in feeling it. Your worth isn't a number or a shape. If this keeps coming up, talking to someone helps: the helplines below are free and kind. I'm here for the small wins whenever you want.";
  return "Thanks for telling me. Your body needs fuel, and no goal is worth going without food or hurting yourself. Please talk to someone who can help: the helplines below are free. When you're ready, one simple meal is a great start.";
}

// ---------------------------------------------------------------- output guard

/** Phrases the coach must never say, whatever the model produced. */
const BANNED: RegExp[] = [
  /\b(you('re| are) (fat|ugly|chubby|obese|disgusting))\b/i,
  /\b(your (belly|thighs|arms|face|body) (is|looks) (fat|huge|big|flabby))\b/i,
  /\bskip (dinner|lunch|breakfast|meals?) (to|and) (lose|burn|make up)/i,
  /\b(purge|make yourself (sick|throw up))\b/i,
  /\b(take|try) \d+\s?(mg|mcg|iu)\b/i,
];

export function violatesRules(text: string): boolean {
  return BANNED.some((re) => re.test(text));
}

/** Trims the reply and swaps anything that breaks the rules for a safe line. */
export function guardReply(text: string, style: CoachStyle): string {
  const t = text.replace(/\s+\n/g, "\n").trim().slice(0, 1500);
  if (!t || violatesRules(t)) return fallbackChat(style);
  return t;
}

export function fallbackChat(style: CoachStyle): string {
  if (style === "no_excuses") return "Let's keep it about the habits. Log your next meal, hit your protein, move today. That's the job.";
  if (style === "calm") return "Let's keep it simple and kind: one good meal and a little movement today is plenty.";
  return "Let's focus on what moves the needle: your next meal with some protein in it, and logging it.";
}

// ---------------------------------------------------------------- notes without a model

export type NoteFacts = {
  name?: string;
  proteinYesterday: number | null;
  proteinTarget: number;
  loggedYesterday: boolean;
  workoutsThisWeek: number;
  workoutTarget: number;
  dayStreak: number;
  obstacles: string[];
};

/** A deterministic morning note (used when the model call fails or there's no API key). */
export function fallbackNote(style: CoachStyle, f: NoteFacts): string {
  const short = f.proteinYesterday != null ? Math.max(0, Math.round(f.proteinTarget - f.proteinYesterday)) : null;
  const exams = f.obstacles.includes("exam_stress");
  if (!f.loggedYesterday) {
    if (style === "no_excuses") return "Nothing logged yesterday. That's a blind spot, not a day off. Log breakfast before 10. Then keep going.";
    if (style === "calm") return "Yesterday slipped by without a log, and that's okay. Today, just log your first meal. That's the whole task.";
    return "No logs yesterday, so let's restart the easy way: log breakfast this morning and aim for protein at every meal.";
  }
  if (short != null && short > 10) {
    if (style === "no_excuses") return `${Math.round(f.proteinYesterday!)} g protein yesterday. Target was ${f.proteinTarget}. That's ${short} g left on the table: 2 eggs or a bowl of curd at breakfast fixes it. Go.`;
    if (style === "calm") return `${exams ? "Busy week, so let's keep it simple: " : ""}protein at every meal today. You got ${Math.round(f.proteinYesterday!)} g yesterday, and a katori of curd or dal gets you closer.`;
    return `You were ${short} g short on protein yesterday. Add eggs, paneer or curd to breakfast and you'll close most of it.`;
  }
  if (f.workoutsThisWeek < f.workoutTarget) {
    const left = f.workoutTarget - f.workoutsThisWeek;
    if (style === "no_excuses") return `${f.workoutsThisWeek} of ${f.workoutTarget} sessions this week. ${left} to go. Pick the time now and show up.`;
    if (style === "calm") return `Protein was on point yesterday. If you can, fit in some movement today: even a 20-minute walk counts.`;
    return `Protein's on track. You've trained ${f.workoutsThisWeek} of ${f.workoutTarget} times this week, so plan one session today.`;
  }
  if (style === "no_excuses") return `${f.dayStreak}-day streak. Don't get comfortable. Same standard today: log everything, hit protein.`;
  if (style === "calm") return `${f.dayStreak > 1 ? `${f.dayStreak} days in a row. ` : ""}You're doing well. Keep the same easy rhythm today.`;
  return `Solid yesterday. Keep the streak going: log every meal and hit ${f.proteinTarget} g protein again.`;
}

/** The 8 pm "nothing logged" nudge without a model. */
export function fallbackEvening(style: CoachStyle): string {
  if (style === "no_excuses") return "8 pm and nothing logged. Log dinner now. Streaks don't keep themselves.";
  if (style === "calm") return "Quiet day? No stress. Log dinner when you eat and today still counts.";
  return "Nothing logged yet today. Log dinner to keep your streak alive.";
}

// ---------------------------------------------------------------- timing

/** "HH:MM[:SS]" → minutes after midnight. */
export function hhmmToMin(v: unknown, fallback: number): number {
  const m = typeof v === "string" ? v.match(/^(\d{1,2}):(\d{2})/) : null;
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : fallback;
}

/** Inside quiet hours? Handles windows over midnight (23:00 → 07:00). */
export function inQuietHours(nowMin: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false;
  return fromMin < toMin ? nowMin >= fromMin && nowMin < toMin : nowMin >= fromMin || nowMin < toMin;
}

/** Is the morning note due now (the note time has passed today, and not in quiet hours)? */
export function noteDue(nowMin: number, noteMin: number, quiet: { from: number; to: number }): boolean {
  return nowMin >= noteMin && !inQuietHours(nowMin, quiet.from, quiet.to);
}

/** The 8 pm nudge window (20:00–22:59), unless quiet hours cover it. */
export function eveningDue(nowMin: number, loggedToday: boolean, quiet: { from: number; to: number }): boolean {
  return !loggedToday && nowMin >= 20 * 60 && nowMin < 23 * 60 && !inQuietHours(nowMin, quiet.from, quiet.to);
}

// ---------------------------------------------------------------- memory proposals

/** Cleans a model-proposed memory; null when it's junk, too long, or about looks / weight shaming. */
export function cleanMemory(m: { kind?: unknown; text?: unknown }): { kind: MemoryKind; text: string } | null {
  const text = typeof m.text === "string" ? m.text.replace(/\s+/g, " ").trim().replace(/[.]$/, "") : "";
  if (text.length < 3 || text.length > 120) return null;
  if (!isMemoryKind(m.kind)) return null;
  if (violatesRules(text) || /\b(ugly|fat|disgusting|hate (my|their) body)\b/i.test(text)) return null;
  return { kind: m.kind, text: text[0].toUpperCase() + text.slice(1) };
}
