/**
 * v2.18 D1 Wrapped: weekly, monthly and yearly story cards (Instagram 9:16, 1080 x 1920). Builds on
 * the v2.13 recap numbers (lib/recap.ts buildRecap); this file picks the period and turns a recap
 * into slides. Pure (the canvas drawing is in wrappedCard.ts). Android: util/Wrapped.kt.
 *
 *   week   the previous Monday-Sunday (same as the weekly recap)
 *   month  the previous calendar month (same as the monthly recap)
 *   year   1 Jan to yesterday ("2026 so far"); in the first 15 days of January, last year in full
 *
 * Calories are never on a slide (hide_numbers-safe); protein grams and counts are fine.
 */
import { addDays, parseIso } from "../dates";
import { recapPeriod, type Period, type Recap } from "../recap";

export type WrappedKind = "week" | "month" | "year";
export const WRAPPED_KINDS: WrappedKind[] = ["week", "month", "year"];

export function parseWrappedKind(v: unknown): WrappedKind | null {
  return v === "week" || v === "month" || v === "year" ? v : null;
}

export function wrappedPeriod(kind: WrappedKind, today: string): Period {
  if (kind === "week") return recapPeriod("weekly", today);
  if (kind === "month") return recapPeriod("monthly", today);
  const d = parseIso(today);
  const y = d.getFullYear();
  const early = d.getMonth() === 0 && d.getDate() <= 15;
  if (early) return { kind: "monthly", from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1), key: `y-${y - 1}` };
  return { kind: "monthly", from: `${y}-01-01`, to: addDays(today, -1), label: `${y} so far`, key: `y-${y}` };
}

export type Slide = { key: string; eyebrow: string; big: string; line: string; tone: "ink" | "ember" | "bone" };

const WORD: Record<WrappedKind, string> = { week: "week", month: "month", year: "year" };

function daysLine(logged: number, days: number): string {
  const pct = days > 0 ? logged / days : 0;
  if (pct >= 1) return `of ${days}. Every single day.`;
  if (pct >= 0.85) return `of ${days}. Barely missed one.`;
  if (pct >= 0.5) return `of ${days}. More in than out.`;
  return `of ${days}. Every log counts.`;
}

/** The slides for one Wrapped, in order. Empty stats are skipped (no "0 workouts" slide). */
export function wrappedSlides(r: Recap, kind: WrappedKind, name?: string | null): Slide[] {
  const out: Slide[] = [];
  const who = name?.trim() ? name.trim().split(/\s+/)[0] : null;
  const title = kind === "week" ? "Your week" : kind === "month" ? r.period.label.split(" ")[0] : r.period.label.replace(" so far", "");
  out.push({ key: "cover", eyebrow: `${kind === "week" ? "Weekly" : kind === "month" ? "Monthly" : "Yearly"} wrapped`, big: title, line: who ? `Locked in, ${who}.` : "Locked in.", tone: "ember" });
  out.push({ key: "days", eyebrow: "Days logged", big: String(r.daysLogged), line: daysLine(r.daysLogged, r.days), tone: "ink" });
  if (r.workouts > 0) out.push({ key: "training", eyebrow: "Sessions", big: String(r.workouts), line: r.minutes > 0 ? `${r.minutes.toLocaleString("en-IN")} minutes moving.` : "Showed up. That's the job.", tone: "ink" });
  if (r.proteinTarget > 0 && r.proteinDays > 0) out.push({ key: "protein", eyebrow: "Protein days", big: String(r.proteinDays), line: `days at ${r.proteinTarget} g or close.`, tone: "bone" });
  if (r.bestLift) {
    const big = r.bestLift.kg != null ? `${r.bestLift.kg} kg` : `${r.bestLift.reps} reps`;
    out.push({ key: "lift", eyebrow: r.bestLift.pr ? "New PR" : "Best lift", big, line: r.bestLift.kg != null ? `${r.bestLift.name} × ${r.bestLift.reps}` : r.bestLift.name, tone: "ink" });
  }
  if (r.weight && r.weight.delta !== 0) out.push({ key: "weight", eyebrow: "Weight", big: `${r.weight.delta > 0 ? "+" : "−"}${Math.abs(r.weight.delta)} kg`, line: `${r.weight.start} → ${r.weight.end} kg this ${WORD[kind]}.`, tone: "bone" });
  if (r.topFoods.length) out.push({ key: "food", eyebrow: "On repeat", big: r.topFoods[0].name, line: `logged ${r.topFoods[0].count} ${r.topFoods[0].count === 1 ? "time" : "times"}.`, tone: "ink" });
  if (r.streak > 0) out.push({ key: "streak", eyebrow: "Day streak", big: String(r.streak), line: r.streak >= 7 ? "and counting." : "Keep it going.", tone: "ember" });
  if (r.squad) out.push({ key: "squad", eyebrow: r.squad.name, big: `#${r.squad.rank}`, line: `of ${r.squad.of} in the squad.`, tone: "ink" });
  out.push({ key: "next", eyebrow: `Next ${WORD[kind]}`, big: "Next", line: r.nextGoal + ".", tone: "bone" });
  return out;
}

export function wrappedFilename(kind: WrappedKind, period: Period, slide: Slide): string {
  return `locked-in-${kind}-${period.from}-${slide.key}.png`;
}
