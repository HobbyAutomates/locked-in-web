import SubPage from "@/components/SubPage";
import BuddyScreen from "@/components/BuddyScreen";

export const dynamic = "force-dynamic";

/** v2.14 buddy streaks. `?invite=1` opens the share sheet (the onboarding's "Invite a buddy"). */
export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await searchParams;
  return (
    <SubPage title="Buddy streak" back="/">
      <BuddyScreen autoInvite={sp.invite === "1"} />
    </SubPage>
  );
}
