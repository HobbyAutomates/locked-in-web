import { getDashboard, totalsFor } from "@/lib/data";
import { addDays, shortDate } from "@/lib/dates";
import { MUSCLE_COLOR } from "@/lib/muscles";
import { restByMuscle, workoutDayStreak, workoutWeekStreak } from "@/lib/streaks";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { today, profile, workouts, meals } = await getDashboard();
  const rest = restByMuscle(workouts);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const proteinByDay = last7.map((d) => ({ d, p: totalsFor(meals, d).protein }));
  const maxP = Math.max(profile.protein_target_g, ...proteinByDay.map((x) => x.p), 1);
  const cutoff = addDays(today, -29);
  const minutes30 = workouts.filter((w) => w.date >= cutoff).reduce((a, w) => a + (w.minutes ?? 0), 0);
  const sessions30 = workouts.filter((w) => w.date >= cutoff).length;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="label">Last 30 days</p>
        <h1 className="text-4xl font-extrabold">Progress</h1>
      </header>

      <section className="card grid grid-cols-3 gap-2 text-center">
        <div><div className="num text-2xl font-extrabold">{sessions30}</div><div className="text-[11px] muted uppercase font-bold tracking-wide">Sessions</div></div>
        <div><div className="num text-2xl font-extrabold">{minutes30}</div><div className="text-[11px] muted uppercase font-bold tracking-wide">Minutes</div></div>
        <div><div className="num text-2xl font-extrabold">{workoutDayStreak(workouts.map((w) => w.date))}</div><div className="text-[11px] muted uppercase font-bold tracking-wide">Day streak</div></div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold mb-1">Rest by muscle group</h2>
        <p className="text-sm muted mb-3">
          Longest rested: <strong className="text-ink">{rest[0].muscle}</strong>
          {rest[0].last ? ` (${rest[0].days} day${rest[0].days === 1 ? "" : "s"})` : " (never logged)"}.
        </p>
        <div className="flex flex-col gap-2">
          {rest.map((r) => (
            <div key={r.muscle} className="grid grid-cols-[96px_1fr_80px] items-center gap-3 text-sm">
              <span className={r === rest[0] ? "font-bold" : ""}>{r.muscle}</span>
              <div className="h-2 rounded bg-surface-2 overflow-hidden">
                <i className="block h-full rounded" style={{ width: `${r.last ? (Math.min(r.days, 14) / 14) * 100 : 100}%`, background: MUSCLE_COLOR[r.muscle] }} />
              </div>
              <span className="muted text-right num">{!r.last ? "never" : r.days === 0 ? "today" : `${r.days} d ago`}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold mb-3">Protein, last 7 days</h2>
        <div className="grid grid-cols-7 gap-2 items-end h-36">
          {proteinByDay.map(({ d, p }) => (
            <div key={d} className="flex flex-col items-center gap-1 h-full justify-end">
              <span className="num text-xs">{Math.round(p)}</span>
              <div className="w-full rounded-t-md" style={{ height: `${(p / maxP) * 100}%`, background: p >= profile.protein_target_g ? "var(--ok)" : "var(--accent)", minHeight: p > 0 ? 4 : 0 }} />
              <span className="text-[10px] muted">{shortDate(d).slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs muted mt-2">Target {profile.protein_target_g} g. Green days hit it.</p>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold mb-1">Week streak</h2>
        <p className="text-sm muted">
          <strong className="text-ink num text-xl">{workoutWeekStreak(workouts.map((w) => w.date), profile.weekly_workout_target)}</strong> consecutive weeks with {profile.weekly_workout_target}+ sessions.
        </p>
      </section>
    </div>
  );
}
