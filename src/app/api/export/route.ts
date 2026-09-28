import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { EXPORT_HEADERS, combinedCsv, exportFilename, mealRows, parseExportKind, toCsv, type Csv, type ExportKind } from "@/lib/social/exportData";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * v2.18 E5 data export. GET /api/export?kind=all|meals|workouts|activities|weights|water → CSV.
 * Signed-in browser (cookie) or the Android app (bearer). Reads only the caller's own rows, with
 * the service client scoped by user_id (the same way the other /api routes write).
 */
type Admin = Awaited<ReturnType<typeof apiUser>>["admin"];

async function section(admin: Admin, uid: string, kind: ExportKind): Promise<Csv> {
  const header = EXPORT_HEADERS[kind];
  const name = kind;
  if (kind === "meals") {
    let res = await admin.from("meals").select("date, raw_text, meal_type, meal_items(name, grams, calories, protein_g, carbs_g, fat_g)").eq("user_id", uid).order("date", { ascending: true }).limit(20000);
    if (res.error) res = (await admin.from("meals").select("date, raw_text, meal_items(name, grams, calories, protein_g, carbs_g, fat_g)").eq("user_id", uid).order("date", { ascending: true }).limit(20000)) as typeof res;
    const rows = ((res.data ?? []) as { date: string; raw_text: string | null; meal_type?: string | null; meal_items?: Record<string, unknown>[] }[]).map((m) => ({ date: m.date, raw_text: m.raw_text, meal_type: m.meal_type ?? null, items: m.meal_items ?? [] }));
    return { name, header, rows: mealRows(rows) };
  }
  if (kind === "workouts") {
    const { data } = await admin.from("workouts").select("date, kind, minutes, muscles, exercises, notes").eq("user_id", uid).order("date", { ascending: true }).limit(20000);
    return { name, header, rows: ((data ?? []) as Record<string, unknown>[]).map((w) => [w.date as string, (w.kind as string) ?? "", w.minutes as number | null, Array.isArray(w.muscles) ? (w.muscles as string[]).join(" ") : "", (w.exercises as string) ?? "", (w.notes as string) ?? ""]) };
  }
  if (kind === "activities") {
    const { data } = await admin.from("exercise_log").select("date, name, minutes, intensity, kcal, steps, distance_km, source").eq("user_id", uid).order("date", { ascending: true }).limit(20000);
    return { name, header, rows: ((data ?? []) as Record<string, unknown>[]).map((e) => [e.date as string, e.name as string, e.minutes as number, e.intensity as string, e.kcal as number, e.steps as number | null, e.distance_km as number | null, e.source as string]) };
  }
  if (kind === "weights") {
    const { data } = await admin.from("weight_log").select("date, weight_kg, note").eq("user_id", uid).order("date", { ascending: true }).limit(20000);
    return { name, header, rows: ((data ?? []) as Record<string, unknown>[]).map((w) => [w.date as string, w.weight_kg as number, (w.note as string) ?? ""]) };
  }
  const { data } = await admin.from("water_log").select("date, ml, vessel").eq("user_id", uid).order("date", { ascending: true }).limit(40000);
  return { name, header, rows: ((data ?? []) as Record<string, unknown>[]).map((w) => [w.date as string, w.ml as number, (w.vessel as string) ?? ""]) };
}

export async function GET(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Export isn't set up on this server" }, { status: 503 });
  const kind = parseExportKind(new URL(req.url).searchParams.get("kind"));
  const kinds: ExportKind[] = kind === "all" ? ["meals", "workouts", "activities", "weights", "water"] : [kind];
  const parts = await Promise.all(kinds.map((k) => section(admin, user.id, k)));
  const body = kind === "all" ? combinedCsv(parts) : toCsv(parts[0]);
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(kind, today())}"`,
      "cache-control": "no-store",
    },
  });
}
