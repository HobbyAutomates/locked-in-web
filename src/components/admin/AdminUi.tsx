import Link from "next/link";

/** Server-rendered bits for /admin: stat tiles, a tiny inline-SVG bar chart, and date formatting (IST). */

export function when(ts: string | null | undefined, withTime = true): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
}

export function usd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export function num(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("en-IN");
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <p className="text-xs font-semibold muted">{label}</p>
      <p className="num mt-1 text-[26px] font-extrabold leading-none">{value}</p>
      {hint ? <p className="mt-1 text-[11px] muted">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-bold">{title}</h2>
        {note ? <p className="mt-0.5 text-xs muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Bars for a day series (oldest → newest). Pure SVG, scales to its container; each bar has a
 * <title> for the exact value. Colour is a design token (var(--…)).
 */
export function Bars({ data, color = "var(--ink)", height = 72, format = (v: number) => String(v) }: { data: { day: string; value: number }[]; color?: string; height?: number; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 10;
  const gap = 3;
  const width = data.length * (w + gap) - gap;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={`${format(total)} over ${data.length} days, peak ${format(max)}`}>
        <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--hair)" strokeWidth={1} />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * (height - 4)) : 0;
          return (
            <rect key={d.day} x={i * (w + gap)} y={height - h} width={w} height={h} rx={2} fill={color}>
              <title>{`${d.day}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-[10px] muted">
        <span>{data[0]?.day.slice(5)}</span>
        <span>peak {format(max)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars for a small category breakdown (scan kinds, event names). */
export function HBars({ rows, color = "var(--blue)" }: { rows: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm muted">Nothing yet.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[13px]">
          <span className="w-32 shrink-0 truncate">{r.label}</span>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 flex-1" aria-hidden>
            <rect x={0} y={0} width={100} height={8} rx={4} fill="var(--track)" />
            <rect x={0} y={0} width={Math.max(1, (r.value / max) * 100)} height={8} rx={4} fill={color} />
          </svg>
          <span className="num w-12 shrink-0 text-right font-semibold">{num(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A scroll-inside-the-card table, so wide tables never scroll the page sideways on a phone. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse text-left text-[13px] [&_td]:border-t [&_td]:border-[var(--hair)] [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-[var(--muted)]">{children}</table>
    </div>
  );
}

export function AdminNav({ active }: { active: "overview" | "users" }) {
  const tab = (href: string, key: typeof active, label: string) => (
    <Link href={href} className="chip press" aria-current={active === key ? "page" : undefined} style={active === key ? { height: 32, background: "var(--btn)", color: "var(--btn-ink)" } : { height: 32 }}>
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-2">
      {tab("/admin", "overview", "Overview")}
      {tab("/admin/users", "users", "Users")}
    </nav>
  );
}
