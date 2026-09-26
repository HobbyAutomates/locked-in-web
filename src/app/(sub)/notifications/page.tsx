import { createClient } from "@/lib/supabase/server";
import { loadInbox } from "@/lib/platform-data";
import InboxScreen from "@/components/platform/InboxScreen";

export const dynamic = "force-dynamic";

/** v2.13 notifications inbox (the Home bell). */
export default async function NotificationsPage() {
  const { available, items, at } = await loadInbox(await createClient());
  return <InboxScreen available={available} items={items} now={at} />;
}
