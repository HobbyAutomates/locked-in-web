import SubPage from "@/components/SubPage";
import CoachStyleSettings from "@/components/coach/CoachStyleSettings";
import { getCoachSettings } from "@/lib/coachActions";

export const dynamic = "force-dynamic";

/** v2.14 Coach → Style: voice, morning note time, quiet hours, Sunday roast. */
export default async function CoachStylePage() {
  return (
    <SubPage title="Coach style">
      <CoachStyleSettings initial={await getCoachSettings()} />
    </SubPage>
  );
}
