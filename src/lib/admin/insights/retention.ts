import type { ActiveDays } from "./types";
import { addDays, lastNWeeks, weekStart } from "./time";

/**
 * Weekly retention by signup week. Cohort = users whose sign-up day falls in that Monday-start
 * week. Cell k = share of the cohort active on any day of the k-th week after it (week 0 = the
 * signup week itself). Weeks that haven't started yet are null.
 */

export type RetentionCohort = { week: string; size: number; counts: (number | null)[]; rates: (number | null)[] };
export type Retention = { weeks: number; cohorts: RetentionCohort[] };

export function weeklyRetention(users: { id: string; signupDay: string }[], active: ActiveDays, today: string, nWeeks = 8): Retention {
  const weeks = lastNWeeks(today, nWeeks);
  const current = weeks[weeks.length - 1];
  const cohorts: RetentionCohort[] = weeks.map((week) => {
    const members = users.filter((u) => u.signupDay && weekStart(u.signupDay) === week);
    const counts: (number | null)[] = [];
    for (let k = 0; k < nWeeks; k++) {
      const from = addDays(week, 7 * k);
      if (from > current) {
        counts.push(null);
        continue;
      }
      const to = addDays(from, 6);
      let n = 0;
      for (const m of members) {
        const days = active.get(m.id);
        if (days && [...days].some((d) => d >= from && d <= to)) n++;
      }
      counts.push(n);
    }
    return { week, size: members.length, counts, rates: counts.map((c) => (c == null ? null : members.length ? Math.round((c / members.length) * 1000) / 1000 : null)) };
  });
  return { weeks: nWeeks, cohorts: cohorts.reverse() };
}
