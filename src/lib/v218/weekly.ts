/**
 * v2.18 B2 weekly check-in. Once a week the coach reviews food, training, sleep and weight, then
 * gives ONE plan for the next week. The facts and the plan are deterministic (so it works with no
 * model and the plan is always sane); the model only words the review. Pure; Android reads the
 * result from /api/coach/insights.
 */

export type WeekFacts = {
  weekStart: string;
  loggedDays: number;
  avgKcal: number | null;
  kcalTarget: number;
  avgProtein: number | null;
  proteinTarget: number;
  proteinDays: number;
  workouts: number;
  workoutTarget: number;
  avgSleep: number | null;
  checkins: number;
  weightChange: number | null;
  goal: string;
};

export type WeekPlan = { focus: "logging" | "protein" | "training" | "sleep" | "calories" | "keep"; title: string; plan: string };

/** The one thing to work on next week: the biggest gap, in priority order. */
export function weekPlan(f: WeekFacts): WeekPlan {
  if (f.loggedDays < 5) return { focus: "logging", title: "Log 6 of 7 days", plan: `You logged ${f.loggedDays} of 7 days. Next week: log at least one meal every day, 6 of 7 days. Rough entries count.` };
  if (f.avgProtein != null && f.proteinDays < 4) {
    const gap = Math.max(0, Math.round(f.proteinTarget - f.avgProtein));
    return { focus: "protein", title: `Protein on 5 days`, plan: `You hit protein on ${f.proteinDays} of ${f.loggedDays} logged days${gap ? ` (about ${gap} g short on average)` : ""}. Next week: protein at every meal and ${f.proteinTarget} g on 5 days. Curd, eggs, paneer, soya or chana at breakfast closes most of it.` };
  }
  if (f.workouts < f.workoutTarget) {
    return { focus: "training", title: `${f.workoutTarget} sessions`, plan: `${f.workouts} of ${f.workoutTarget} sessions this week. Next week: put ${f.workoutTarget} sessions in your calendar now, same time each day. A 25-minute home workout counts.` };
  }
  if (f.avgSleep != null && f.checkins >= 3 && f.avgSleep < 7) {
    return { focus: "sleep", title: "7 hours of sleep", plan: `You averaged ${f.avgSleep.toFixed(1)} h of sleep. Next week: lights out 30 minutes earlier on 5 nights. Better sleep = fewer cravings and better sessions.` };
  }
  if (f.avgKcal != null && f.goal === "lose" && f.avgKcal > f.kcalTarget + 150) {
    return { focus: "calories", title: "Stay near target", plan: `You averaged ${Math.round(f.avgKcal)} kcal against a ${f.kcalTarget} target. Next week: pre-log dinner at lunch time so the day's total is planned.` };
  }
  return { focus: "keep", title: "Same again", plan: "Everything's on track. Next week: same habits, and add one small step up (an extra set, 1,000 more steps a day)." };
}

/** The fallback review text (no model): the week in 2 sentences, then the plan. */
export function fallbackReview(f: WeekFacts, p: WeekPlan): string {
  const bits = [`${f.loggedDays}/7 days logged`, f.avgProtein != null ? `avg protein ${Math.round(f.avgProtein)} g` : null, `${f.workouts}/${f.workoutTarget} workouts`, f.avgSleep != null ? `sleep ${f.avgSleep.toFixed(1)} h` : null, f.weightChange != null ? `weight ${f.weightChange > 0 ? "+" : ""}${f.weightChange.toFixed(1)} kg` : null].filter(Boolean);
  const good = f.loggedDays >= 6 ? "Solid logging week." : f.workouts >= f.workoutTarget ? "Training was on point." : "A mixed week, and that's fine.";
  return `${good} This week: ${bits.join(", ")}. ${p.plan}`;
}

/** The week under review for `today`: last Monday–Sunday, or this week from Sunday 5 pm. */
export function reviewWeek(today: string, minutesNow: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const thisMonday = new Date(d.getTime() - (wd - 1) * 86_400_000).toISOString().slice(0, 10);
  if (wd === 7 && minutesNow >= 17 * 60) return thisMonday;
  return new Date(Date.parse(`${thisMonday}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
}

export function factsLine(f: WeekFacts): string {
  return [
    `WEEK ${f.weekStart} (Mon–Sun):`,
    `logged ${f.loggedDays}/7 days; avg ${f.avgKcal != null ? Math.round(f.avgKcal) : "?"} kcal vs target ${f.kcalTarget};`,
    `avg protein ${f.avgProtein != null ? Math.round(f.avgProtein) : "?"} g vs ${f.proteinTarget} g, hit on ${f.proteinDays} days;`,
    `workouts ${f.workouts}/${f.workoutTarget};`,
    `sleep ${f.avgSleep != null ? `${f.avgSleep.toFixed(1)} h avg over ${f.checkins} check-ins` : "not tracked"};`,
    `weight change ${f.weightChange != null ? `${f.weightChange.toFixed(1)} kg` : "no weigh-ins"}; goal ${f.goal}.`,
  ].join(" ");
}
