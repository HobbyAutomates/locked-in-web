import { requireUser } from "@/lib/supabase/server";
import CreateSquadFlow from "@/components/CreateSquadFlow";

export const dynamic = "force-dynamic";

export default async function NewSquadPage() {
  const { user } = await requireUser();
  return <CreateSquadFlow userId={user?.id ?? ""} />;
}
