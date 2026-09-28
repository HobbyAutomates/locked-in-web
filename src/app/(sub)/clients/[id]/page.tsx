import SubPage from "@/components/SubPage";
import { SCard, SoonCard } from "@/components/social/kit";
import ClientView from "@/components/social/ClientView";
import { getClientOverview } from "@/lib/social/data";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** v2.18 D4 /clients/<id>: one client's last two weeks for their coach, plus notes. */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getClientOverview(id, 14);
  if (!res.available)
    return (
      <SubPage title="Client" back="/clients">
        <SoonCard what="The coach view" />
      </SubPage>
    );
  if (!res.allowed || !res.overview)
    return (
      <SubPage title="Client" back="/clients">
        <SCard>
          <p className="text-[14px] muted">This person hasn&rsquo;t given you access, or removed it.</p>
        </SCard>
      </SubPage>
    );
  return (
    <SubPage title={res.overview.name} back="/clients">
      <ClientView clientId={id} today={today()} o={res.overview} comments={res.comments} />
    </SubPage>
  );
}
