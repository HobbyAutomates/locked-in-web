import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDays, today } from "@/lib/dates";
import { recomputeRollup } from "@/lib/rollup";
import { checkChallengeCompletions } from "@/lib/challenges";

export const runtime = "nodejs";

/**
 * POST /api/rollup  { date?: "yyyy-MM-dd", dates?: string[], yesterday?: boolean }
 * Recomputes the caller's `daily_stats` row(s) from workouts / meals / exercise_log and upserts
 * them. Works with the browser session cookie or an `Authorization: Bearer <access token>`; the
 * write goes through the user's own client so RLS ("stats own") applies.
 */
export async function POST(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
  const supabase = bearer
    ? createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        db: { schema: "bandlog" },
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      })
    : await createClient();
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { date?: string; dates?: string[]; yesterday?: boolean };
  const t = today();
  const dates = [...(body.dates ?? []), ...(body.date ? [body.date] : [])];
  if (!dates.length) dates.push(t);
  if (body.yesterday) dates.push(addDays(t, -1));
  // Only the recent past is worth recomputing; anything else is a typo or a replay.
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= t && d >= addDays(t, -14));
  if (!valid.length) return NextResponse.json({ error: "No valid dates" }, { status: 400 });

  try {
    const rows = await recomputeRollup(supabase, user.id, valid);
    // v2.7: post "🏆 completed" for any squad challenge these rows just finished (idempotent).
    await checkChallengeCompletions(supabase, user.id);
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Rollup failed" }, { status: 500 });
  }
}
