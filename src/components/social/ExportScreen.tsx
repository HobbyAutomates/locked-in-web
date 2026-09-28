"use client";

import { EXPORT_KINDS } from "@/lib/social/exportData";
import { shortDate } from "@/lib/dates";

const LABEL: Record<(typeof EXPORT_KINDS)[number], string> = { meals: "Meals and items", workouts: "Workouts", activities: "Activities and steps", weights: "Weights", water: "Water" };

/**
 * CSV downloads, and a printable 90-day report. "Save as PDF" is the browser's print dialog
 * (every phone and desktop browser can print to PDF); buttons hide in print.
 */
export default function ExportScreen({ name, today, hideNumbers, targets, days, weights, workouts }: { name: string; today: string; hideNumbers: boolean; targets: { kcal: number; protein: number }; days: { date: string; kcal: number; protein: number; meals: number }[]; weights: { date: string; kg: number }[]; workouts: { date: string; kind: string; minutes: number | null }[] }) {
  const cell = "border-b px-2 py-1.5 text-left";
  return (
    <>
      <section className="flex flex-col gap-2 print:hidden" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[16px] font-bold">Spreadsheet (CSV)</p>
        <p className="text-[12.5px] muted">Opens in Excel, Google Sheets or Numbers. Everything you&rsquo;ve logged, oldest first.</p>
        <a href="/api/export?kind=all" download className="press flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
          Download everything
        </a>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_KINDS.map((k) => (
            <a key={k} href={`/api/export?kind=${k}`} download className="press flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)" }}>
              {LABEL[k]}
            </a>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2 print:hidden" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[16px] font-bold">Report (PDF)</p>
        <p className="text-[12.5px] muted">The last 90 days on one page. Tap below, then choose &ldquo;Save as PDF&rdquo;.</p>
        <button type="button" onClick={() => window.print()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "var(--ink)", color: "var(--bg)", border: 0 }}>
          Save as PDF
        </button>
      </section>

      <article className="flex flex-col gap-4 rounded-[22px] p-4 text-[12.5px] print:rounded-none print:p-0" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
        <header>
          <p className="display text-[20px] font-extrabold">locked in</p>
          <p className="text-[14px] font-semibold">
            {name || "My"} report · {shortDate(days[days.length - 1]?.date ?? today)} to {shortDate(today)}
          </p>
          {!hideNumbers ? (
            <p className="muted">
              Targets: {targets.kcal} kcal · {targets.protein} g protein
            </p>
          ) : null}
        </header>
        <div>
          <p className="mb-1 font-bold">Food by day ({days.length} days logged)</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cell}>Date</th>
                {!hideNumbers ? <th className={cell}>kcal</th> : null}
                <th className={cell}>Protein</th>
                <th className={cell}>Meals</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td className={cell}>{shortDate(d.date)}</td>
                  {!hideNumbers ? <td className={cell}>{d.kcal}</td> : null}
                  <td className={cell}>{d.protein} g</td>
                  <td className={cell}>{d.meals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {weights.length ? (
          <div>
            <p className="mb-1 font-bold">Weight</p>
            <p>{weights.map((w) => `${shortDate(w.date)}: ${w.kg} kg`).join(" · ")}</p>
          </div>
        ) : null}
        {workouts.length ? (
          <div>
            <p className="mb-1 font-bold">Workouts ({workouts.length})</p>
            <p>{workouts.map((w) => `${shortDate(w.date)} ${w.kind}${w.minutes ? ` ${w.minutes} min` : ""}`).join(" · ")}</p>
          </div>
        ) : null}
      </article>
    </>
  );
}
