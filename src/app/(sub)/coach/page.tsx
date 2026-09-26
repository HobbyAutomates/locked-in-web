import CoachChat from "@/components/coach/CoachChat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach · Locked In" };

/** v2.14 coach chat. `?q=` pre-fills the box (Home note's "Reply", the Log breakfast chip). */
export default async function CoachPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  return <CoachChat prompt={typeof sp.q === "string" ? sp.q.slice(0, 200) : undefined} />;
}
