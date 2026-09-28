import { adminClient } from "../apiAuth";
import { createClient } from "../supabase/server";
import { today as todayIso } from "../dates";
import { dayBump, streakProtected } from "./coachPlusServer";

/**
 * v2.18 Home extras (schema_v43), server side: today's calorie bump (check-in buffer or festival
 * maintenance) and the festival dates that protect the day streak. Both fall back to "nothing"
 * without v43 or on any error, so Home renders exactly as before.
 */
export async function getV218Home(): Promise<{ bump: number; protectedDates: string[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { bump: 0, protectedDates: [] };
    const admin = adminClient();
    const [b, dates] = await Promise.all([dayBump(admin, user.id), streakProtected(admin, user.id, todayIso())]);
    return { bump: b.kcal, protectedDates: dates };
  } catch {
    return { bump: 0, protectedDates: [] };
  }
}
