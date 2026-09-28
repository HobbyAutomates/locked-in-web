/**
 * v2.18 D4 trainer / dietitian view (schema_v44 coach_links, coach_comments, RPCs coach_grant,
 * coach_revoke, my_coaches, my_clients, client_overview). Pure parsing + small helpers.
 * Android: util/CoachView.kt. Coach tools are "part of a paid tier later"; free in the beta.
 */
export const COACH_TIER_NOTE = "Coach tools will be part of a paid plan later. Free during the beta.";

/** "@Ayan_K " → "ayan_k"; null when it can't be a username (3-20 of a-z, 0-9 and _, as schema_v26). */
export function normalizeUsername(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(u) ? u : null;
}

export type ClientRow = { client_id: string; name: string; username: string | null; avatar_path: string | null; since: string; last_active: string | null; streak: number; weight_kg: number | null };
export type CoachRow = { coach_id: string; name: string; username: string | null; avatar_path: string | null; since: string };

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function parseClient(r: Record<string, unknown>): ClientRow {
  return {
    client_id: String(r.client_id ?? ""),
    name: String(r.name ?? "Client"),
    username: (r.username as string | null) ?? null,
    avatar_path: (r.avatar_path as string | null) ?? null,
    since: String(r.since ?? ""),
    last_active: (r.last_active as string | null) ?? null,
    streak: Math.max(0, Math.floor(Number(r.streak ?? 0)) || 0),
    weight_kg: num(r.weight_kg),
  };
}

export function parseCoach(r: Record<string, unknown>): CoachRow {
  return { coach_id: String(r.coach_id ?? ""), name: String(r.name ?? "Coach"), username: (r.username as string | null) ?? null, avatar_path: (r.avatar_path as string | null) ?? null, since: String(r.since ?? "") };
}

export type OverviewDay = { date: string; calories: number; protein_g: number; meals: number; trained: boolean; burned: number };
export type Overview = {
  name: string;
  calorie_target: number | null;
  protein_target_g: number | null;
  goal_type: string | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  days: OverviewDay[];
  meals: { date: string; text: string; calories: number; protein_g: number }[];
  weights: { date: string; kg: number }[];
  workouts: { date: string; kind: string; minutes: number | null; muscles: string[] }[];
};

export function parseOverview(v: unknown): Overview {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const p = (o.profile && typeof o.profile === "object" ? o.profile : {}) as Record<string, unknown>;
  const arr = (x: unknown) => (Array.isArray(x) ? (x as Record<string, unknown>[]) : []);
  return {
    name: String(p.name ?? "Client"),
    calorie_target: num(p.calorie_target),
    protein_target_g: num(p.protein_target_g),
    goal_type: (p.goal_type as string | null) ?? null,
    weight_kg: num(p.weight_kg),
    goal_weight_kg: num(p.goal_weight_kg),
    days: arr(o.days).map((d) => ({ date: String(d.date), calories: num(d.calories) ?? 0, protein_g: num(d.protein_g) ?? 0, meals: num(d.meals) ?? 0, trained: d.trained === true, burned: num(d.burned) ?? 0 })),
    meals: arr(o.meals).map((m) => ({ date: String(m.date), text: String(m.text ?? ""), calories: num(m.calories) ?? 0, protein_g: num(m.protein_g) ?? 0 })),
    weights: arr(o.weights).map((w) => ({ date: String(w.date), kg: num(w.kg) ?? 0 })),
    workouts: arr(o.workouts).map((w) => ({ date: String(w.date), kind: String(w.kind ?? "gym"), minutes: num(w.minutes), muscles: Array.isArray(w.muscles) ? (w.muscles as string[]) : [] })),
  };
}

/** The coach's one-line read of the last days: "Logged 6 of 7 days · protein hit 4 · trained 3". */
export function adherenceLine(o: Overview, today: string, days = 7): string {
  const from = new Date(Date.parse(today) - (days - 1) * 864e5).toISOString().slice(0, 10);
  const recent = o.days.filter((d) => d.date >= from && d.date <= today);
  const logged = recent.filter((d) => d.meals > 0).length;
  const trained = recent.filter((d) => d.trained).length;
  const target = o.protein_target_g ?? 0;
  const protein = target > 0 ? recent.filter((d) => d.protein_g >= target * 0.9).length : null;
  return [`Logged ${logged} of ${days} days`, protein != null ? `protein hit ${protein}` : null, `trained ${trained}`].filter(Boolean).join(" · ");
}
