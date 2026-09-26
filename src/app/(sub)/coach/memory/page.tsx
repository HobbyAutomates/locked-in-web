import SubPage from "@/components/SubPage";
import CoachMemory from "@/components/coach/CoachMemory";

export const dynamic = "force-dynamic";

/** v2.14 "What your coach knows". */
export default function CoachMemoryPage() {
  return (
    <SubPage title="What your coach knows">
      <CoachMemory />
    </SubPage>
  );
}
