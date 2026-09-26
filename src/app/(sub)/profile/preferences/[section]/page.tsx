import { notFound } from "next/navigation";
import { getProfile } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";
import PreferencesScreen from "@/components/PreferencesScreen";
import { PREF_SECTIONS, type PrefSection } from "@/lib/preferences";
import { getNotificationPrefs } from "@/lib/platform-data";

export const dynamic = "force-dynamic";

/** One Preferences category: /profile/preferences/appearance | tracking | privacy | account. */
export default async function PreferenceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!PREF_SECTIONS.includes(section as PrefSection)) notFound();
  const [profile, { user }, notif] = await Promise.all([getProfile(), requireUser(), section === "notifications" ? getNotificationPrefs() : Promise.resolve(null)]);
  return <PreferencesScreen profile={profile} email={user?.email ?? ""} section={section as PrefSection} notificationPrefs={notif} />;
}
