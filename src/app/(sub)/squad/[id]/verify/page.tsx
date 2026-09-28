import SubPage from "@/components/SubPage";
import { SCard, SoonCard } from "@/components/social/kit";
import VerifyForm from "@/components/social/VerifyForm";
import { getSquadsLite, getVerification } from "@/lib/social/data";

export const dynamic = "force-dynamic";

/** v2.18 D3: the squad owner asks for a verified gym / college tick; an admin approves it. */
export default async function VerifySquadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ me, squads, verifiedColumns }, v] = await Promise.all([getSquadsLite(), getVerification(id)]);
  const squad = squads.find((s) => s.id === id);
  const back = `/squad/${id}`;
  if (!verifiedColumns || !v.available)
    return (
      <SubPage title="Get verified" back={back}>
        <SoonCard what="Verified squads" />
      </SubPage>
    );
  if (!squad)
    return (
      <SubPage title="Get verified" back="/squad">
        <SCard>
          <p className="text-[14px] muted">You&rsquo;re not in that squad.</p>
        </SCard>
      </SubPage>
    );
  return (
    <SubPage title="Get verified" back={back}>
      {squad.verified ? (
        <SCard label="Verified">
          <p className="text-[17px] font-bold">{squad.name} is verified</p>
          <p className="text-[13.5px] muted">{squad.org_name ? `Verified ${squad.org_kind ?? "squad"}: ${squad.org_name}.` : "The tick shows next to the squad name."}</p>
        </SCard>
      ) : squad.owner_id !== me ? (
        <SCard>
          <p className="text-[14px] muted">Only the squad owner can ask for verification.</p>
        </SCard>
      ) : (
        <VerifyForm squadId={id} squadName={squad.name} latest={v.latest} />
      )}
    </SubPage>
  );
}
