import type { FeatureUsageRow } from "@/lib/admin/insights/usage";
import type { FunnelStep } from "@/lib/admin/insights/funnel";
import type { Retention } from "@/lib/admin/insights/retention";
import type { Insight } from "@/lib/admin/insights/insights";
import { HBars, HeatCell, TableWrap, num, pct, trendText } from "./AdminUi";

/**
 * Plain renderers for the insights view models (src/lib/admin/insights). Deliberately minimal:
 * each takes one view model and draws a table or the existing tiny SVG bars, so the visuals can be
 * swapped without touching the metric code.
 */

const STATUS: Record<FeatureUsageRow["status"], string> = { core: "Core", used: "Used", rare: "Rare", never: "Never", "not-measured": "Not measured" };
const TONE: Record<Insight["tone"], string> = { good: "var(--green)", warn: "var(--orange)", info: "var(--muted)" };

export function InsightList({ items }: { items: Insight[] }) {
  if (!items.length) return <p className="text-sm muted">Nothing to report yet.</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {items.map((i) => (
        <li key={i.key} className="flex gap-2">
          <span aria-hidden style={{ color: TONE[i.tone] }}>
            ●
          </span>
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function FeatureTable({ rows }: { rows: FeatureUsageRow[] }) {
  return (
    <TableWrap>
      <thead>
        <tr>
          <th className="text-right">#</th>
          <th>Feature</th>
          <th>Group</th>
          <th className="text-right">Adoption 7d</th>
          <th className="text-right">Adoption 30d</th>
          <th className="text-right">Uses / active user / wk</th>
          <th className="text-right">This wk</th>
          <th className="text-right">Last wk</th>
          <th className="text-right">Trend</th>
          <th>Status</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="num text-right muted">{r.rank}</td>
            <td className="whitespace-nowrap font-semibold">{r.label}</td>
            <td className="muted">{r.group}</td>
            <td className="num text-right" title={`${r.users7} of ${r.active7} active users`}>
              {pct(r.adoption7)} <span className="muted">({r.users7}/{r.active7})</span>
            </td>
            <td className="num text-right" title={`${r.users30} of ${r.active30} active users`}>
              {pct(r.adoption30)} <span className="muted">({r.users30}/{r.active30})</span>
            </td>
            <td className="num text-right">{r.perUserWeek ?? "—"}</td>
            <td className="num text-right">{num(r.thisWeek)}</td>
            <td className="num text-right">{num(r.lastWeek)}</td>
            <td className="num text-right">{trendText(r.trend, r.trendPct)}</td>
            <td>{STATUS[r.status]}</td>
            <td className="whitespace-nowrap text-xs muted" title={`30d: ${r.fromEvents30} from events, ${r.fromTables30} from tables`}>
              {r.source}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function FunnelView({ steps }: { steps: FunnelStep[] }) {
  return (
    <div className="flex flex-col gap-2">
      <HBars rows={steps.map((s) => ({ label: s.label, value: s.users }))} color="var(--purple)" />
      <TableWrap>
        <thead>
          <tr>
            <th>Step</th>
            <th className="text-right">Users</th>
            <th className="text-right">Of sign-ups</th>
            <th className="text-right">Of previous step</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td className="num text-right">{num(s.users)}</td>
              <td className="num text-right">{pct(s.ofStart)}</td>
              <td className="num text-right">{pct(s.ofPrev)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}

export function RetentionGrid({ r }: { r: Retention }) {
  const cohorts = r.cohorts.filter((c) => c.size > 0);
  if (!cohorts.length) return <p className="text-sm muted">No sign-ups in the last {r.weeks} weeks.</p>;
  return (
    <TableWrap>
      <thead>
        <tr>
          <th>Signup week</th>
          <th className="text-right">Users</th>
          {Array.from({ length: r.weeks }, (_, k) => (
            <th key={k} className="text-center">
              W{k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.week}>
            <td className="num whitespace-nowrap">{c.week}</td>
            <td className="num text-right">{c.size}</td>
            {c.rates.map((v, k) => (
              <HeatCell key={k} value={v} label={v == null ? "" : `${pct(v)}`} />
            ))}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
