import { notFound } from "next/navigation";
import SubPage from "@/components/SubPage";
import { SCard } from "@/components/social/kit";
import { createClient } from "@/lib/supabase/server";
import { getLeaguesFlag, getSquadsLite } from "@/lib/social/data";
import { closeWeek, leaguesOn, tierName, type Standing } from "@/lib/social/leagues";

export const dynamic = "force-dynamic";

/**
 * v2.18 D12 squad vs squad leagues. UNCONFIRMED: behind LEAGUES_ENABLED (false) and
 * app_config.leagues.enabled (false), so this page 404s until the owner turns both on.
 */
export default async function LeaguesPage() {
  if (!leaguesOn(await getLeaguesFlag())) notFound();
  const { squads } = await getSquadsLite();
  const squad = squads[0];
  if (!squad)
    return (
      <SubPage title="Squad leagues" back="/social">
        <SCard>
          <p className="text-[14px] muted">Join a squad to play in a league.</p>
        </SCard>
      </SubPage>
    );
  const supabase = await createClient();
  const { data } = await supabase.rpc("league_table", { g: squad.id });
  const rows = (data ?? []) as { group_id: string; name: string; verified: boolean; tier: number; points: number; members: number }[];
  const tier = rows[0]?.tier ?? 5;
  const preview = new Map(closeWeek(rows.map((r) => ({ group_id: r.group_id, points: r.points }) satisfies Standing), tier).map((m) => [m.group_id, m]));
  return (
    <SubPage title="Squad leagues" back="/social">
      <SCard>
        <p className="text-[13px] font-bold muted">{tierName(tier)} league · this week</p>
        {rows.map((r) => {
          const m = preview.get(r.group_id);
          return (
            <div key={r.group_id} className="flex items-center gap-3 text-[14px]" style={{ fontWeight: r.group_id === squad.id ? 700 : 500 }}>
              <span className="num w-6 muted">{m?.rank}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="num">{r.points}</span>
              <span className="w-5 text-center">{m?.movement === "up" ? "▲" : m?.movement === "down" ? "▼" : ""}</span>
            </div>
          );
        })}
      </SCard>
    </SubPage>
  );
}
