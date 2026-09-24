import { getProfile, getWater } from "@/lib/data";
import { today } from "@/lib/dates";
import SubPage from "@/components/SubPage";
import WaterScreen from "@/components/WaterScreen";
import WaterReminderClock from "@/components/WaterReminderClock";

export const dynamic = "force-dynamic";

/** v2.6: the Water page (FAB dial → Water, Home's water tile). `?date=` logs to an earlier day. */
export default async function WaterPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const t = today();
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= t ? sp.date : t;
  const [profile, entries] = await Promise.all([getProfile(), getWater(date, date)]);
  return (
    <SubPage title="Water" back="/">
      <WaterReminderClock from={profile.water_reminder_from} to={profile.water_reminder_to} every={profile.water_reminder_every_min} />
      <WaterScreen
        date={date}
        isToday={date === t}
        entries={entries}
        goalMl={profile.water_goal_ml}
        glassMl={profile.water_glass_ml}
        reminder={{ from: profile.water_reminder_from, to: profile.water_reminder_to, every: profile.water_reminder_every_min }}
      />
    </SubPage>
  );
}
