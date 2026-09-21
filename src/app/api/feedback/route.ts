import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 👍/👎 on a parsed meal (the "How did the AI do?" row). Optional free-text correction. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json()) as { meal_id?: string; raw_text?: string; rating?: string; correction?: string };
  if (body.rating !== "up" && body.rating !== "down") return NextResponse.json({ error: "rating must be up or down" }, { status: 400 });

  // Service role so the insert works regardless of which client produced the bearer.
  const { createClient: createAdmin } = await import("@supabase/supabase-js");
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: "bandlog" } });
  const { error } = await admin.from("meal_feedback").insert({
    user_id: user.id,
    meal_id: body.meal_id ?? null,
    raw_text: body.raw_text ?? "",
    rating: body.rating,
    correction: body.correction ?? "",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
