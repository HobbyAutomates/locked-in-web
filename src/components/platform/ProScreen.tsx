"use client";

import { FREE_FOREVER, PRO_FEATURES, priceText, proButton, type ProState } from "@/lib/pro";
import SubPage from "../SubPage";
import { MRise, STAGGER } from "../motion";
import { LineIcon } from "../lineIcons";
import { ProChip } from "./kit";

/**
 * v2.13 Locked In Pro (spec §1): what Pro includes, the price, and the beta banner. Payments
 * aren't wired, so the button is a disabled "You're in the beta".
 */
export default function ProScreen({ state }: { state: ProState }) {
  const btn = proButton(state);
  const beta = state.plan === "beta" && state.pro;
  return (
    <SubPage title="Locked In Pro" back="/profile">
      <MRise delay={0}>
        <section className="relative flex flex-col items-center gap-2 overflow-hidden rounded-[26px] px-5 pb-6 pt-7 text-center" style={{ background: "linear-gradient(160deg, var(--cover-a), var(--cover-b))", color: "var(--bg)", boxShadow: "var(--shadow-lg)" }}>
          <span className="m-pop grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--bg) 14%, transparent)", animationDelay: "250ms" }}>
            <LineIcon name="trophy" size={28} stroke={1.8} />
          </span>
          <h2 className="mt-1 flex items-center gap-2 text-[26px] font-semibold" style={{ letterSpacing: "-0.8px" }}>
            Locked In <ProChip style={{ height: 22, fontSize: 12 }} />
          </h2>
          <p className="num text-[15px]" style={{ opacity: 0.8 }}>
            {priceText(state.config)}
          </p>
        </section>
      </MRise>

      {beta ? (
        <MRise delay={STAGGER}>
          <div className="flex items-start gap-3 rounded-[22px] p-4" style={{ background: "var(--green-bg)", color: "var(--green-ink)" }}>
            <LineIcon name="spark" size={20} />
            <p className="text-[14px] font-semibold leading-snug">Beta tester: every Pro feature is free for you.</p>
          </div>
        </MRise>
      ) : null}

      <MRise delay={STAGGER * 2}>
        <section aria-label="What Pro includes" className="overflow-hidden rounded-[22px]" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
          <p className="px-4 pb-1 pt-4 text-[13px] font-semibold muted">What Pro includes</p>
          <ul className="m-0 list-none p-0">
            {PRO_FEATURES.map((f, i) => (
              <li key={f.key} className="m-rise flex items-start gap-3 px-4 py-3" style={{ animationDelay: `${STAGGER * 2 + 120 + i * 60}ms`, borderTop: i ? "1px solid var(--hair)" : 0 }}>
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
                  <LineIcon name="check" size={14} stroke={2.4} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold">{f.title}</span>
                  <span className="text-[13px] muted">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </MRise>

      <MRise delay={STAGGER * 3}>
        <section aria-label="Free forever" className="rounded-[22px] p-4" style={{ background: "var(--card2)" }}>
          <p className="text-[13px] font-semibold muted">Free forever</p>
          <p className="mt-1 text-[14px] leading-relaxed">{FREE_FOREVER.join(" · ")}</p>
        </section>
      </MRise>

      <MRise delay={STAGGER * 4}>
        <button type="button" disabled={btn.disabled} className="press h-[54px] w-full rounded-2xl text-[16px] font-semibold" style={{ background: btn.disabled ? "var(--card2)" : "var(--accent)", color: btn.disabled ? "var(--muted)" : "var(--accent-ink)", border: 0 }}>
          {btn.label}
        </button>
        {!state.config.payments_enabled ? <p className="mt-2 text-center text-[12px] muted">Payments aren&rsquo;t open yet. We&rsquo;ll tell you before anything changes.</p> : null}
      </MRise>
    </SubPage>
  );
}
