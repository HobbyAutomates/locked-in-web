import Link from "next/link";
import { LineIcon, type LineName } from "../lineIcons";

/**
 * v2.18 social screens: the same premium surface as the v2.13 cards (22 px corners, hairline ring)
 * and the Profile list rows. Server-safe (no hooks), so pages can render it directly.
 */

export function SCard({ children, label, className = "", style }: { children: React.ReactNode; label?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <section aria-label={label} className={`flex flex-col gap-3 ${className}`} style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)", ...style }}>
      {children}
    </section>
  );
}

export function SLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="text-[13px] font-bold muted">{children}</p>
      {right}
    </div>
  );
}

/** A list row that pushes a page: line icon, title + sub, optional value, chevron. */
export function HubRow({ icon, title, sub, href, value, last = false, tint }: { icon: LineName; title: string; sub?: string; href: string; value?: string; last?: boolean; tint?: string }) {
  return (
    <>
      <Link href={href} className="press flex min-h-[56px] w-full items-center gap-3.5 px-4 py-3 text-left" style={{ color: "var(--ink)" }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]" style={{ background: "var(--card2)", color: tint ?? "var(--ink)" }}>
          <LineIcon name={icon} size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15.5px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
            {title}
          </span>
          {sub ? <span className="text-[12.5px] leading-4 muted">{sub}</span> : null}
        </span>
        {value ? <span className="num shrink-0 text-[13px] muted">{value}</span> : null}
        <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
      </Link>
      {last ? null : <div className="h-px" style={{ background: "var(--hair)", marginLeft: 66 }} />}
    </>
  );
}

export function HubGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden" style={{ background: "var(--card)", borderRadius: 22, boxShadow: "var(--pcard-ring)" }}>
      {children}
    </div>
  );
}

/** The "needs the next server update" state for a v2.18 feature (schema_v44 / v45 not applied). */
export function SoonCard({ what, text = "Coming with the next update" }: { what: string; text?: string }) {
  return (
    <SCard label="Coming soon">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <LineIcon name="spark" size={18} style={{ color: "var(--accent)" }} />
        {text}
      </p>
      <p className="text-[13px] muted">{what} needs a server update that&rsquo;s on its way. Nothing you&rsquo;ve logged is affected.</p>
    </SCard>
  );
}

/** Big number + caption, e.g. "2 · freezes". */
export function BigStat({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="display num text-[44px] font-extrabold leading-none" style={{ letterSpacing: "-0.04em" }}>
        {value}
      </span>
      <span className="text-[14px] muted">{caption}</span>
    </div>
  );
}

/** Dark gold "premium" chip (brand v1: dark gold for premium). */
export function GoldChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 text-[10.5px] font-extrabold" style={{ height: 20, letterSpacing: "0.06em", color: "#1a1206", background: "linear-gradient(135deg, #fbe7a8, #D9B872 55%, #9c7a35)" }}>
      {children}
    </span>
  );
}
