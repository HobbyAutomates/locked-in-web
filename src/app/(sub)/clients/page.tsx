import Link from "next/link";
import SubPage from "@/components/SubPage";
import { Avatar } from "@/components/Avatar";
import { SCard, SoonCard } from "@/components/social/kit";
import { getMyClients } from "@/lib/social/data";
import { COACH_TIER_NOTE } from "@/lib/social/coachView";
import { shortDate, today } from "@/lib/dates";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D4 /clients: everyone who gave me coach access, with their last log and streak. */
export default async function ClientsPage() {
  const [lang, res] = await Promise.all([getLang(), getMyClients()]);
  if (!res.available)
    return (
      <SubPage title={t("clients.title", lang)} back="/social">
        <SoonCard what="The coach view" />
      </SubPage>
    );
  const t0 = today();
  return (
    <SubPage title={t("clients.title", lang)} back="/social">
      <p className="px-1 text-[12.5px]" style={{ color: "#9c7a35" }}>
        {COACH_TIER_NOTE}
      </p>
      {res.clients.length ? (
        <div className="overflow-hidden" style={{ background: "var(--card)", borderRadius: 22, boxShadow: "var(--pcard-ring)" }}>
          {res.clients.map((c, i) => (
            <Link key={c.client_id} href={`/clients/${c.client_id}`} className="press flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? "1px solid var(--hair)" : undefined, color: "var(--ink)" }}>
              <Avatar path={c.avatar_path} name={c.name} size={42} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{c.name}</span>
                <span className="text-[12px] muted">
                  {c.last_active ? (c.last_active === t0 ? "Logged today" : `Last log ${shortDate(c.last_active)}`) : "No logs yet"}
                  {c.weight_kg ? ` · ${c.weight_kg} kg` : ""}
                </span>
              </span>
              <span className="num text-[13px] font-semibold">{c.streak}🔥</span>
            </Link>
          ))}
        </div>
      ) : (
        <SCard>
          <p className="text-[15px] font-semibold">No clients yet</p>
          <p className="text-[13px] muted">Ask a client to open Social → Coach access and add your username.</p>
        </SCard>
      )}
    </SubPage>
  );
}
