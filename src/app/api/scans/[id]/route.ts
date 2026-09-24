import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

/** The full stored report of one scan (History → open). Photo scans get a 1-hour signed URL. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const { data } = await admin.from("label_scans").select("id, kind, lens, report, image_path, thumb_path, image_url, created_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const report: Record<string, unknown> = { id: data.id, kind: data.kind, lens: data.lens, created_at: data.created_at, ...(data.report as Record<string, unknown>) };
  if (data.image_url && !report.image_url) report.image_url = data.image_url;
  if (data.thumb_path) {
    report.thumb_path = data.thumb_path;
    const { data: t } = await admin.storage.from("scan-photos").createSignedUrl(data.thumb_path as string, 3600);
    if (t?.signedUrl) report.thumb_url = t.signedUrl;
  }
  if (data.image_path) {
    const { data: s } = await admin.storage.from("meal-photos").createSignedUrl(data.image_path as string, 3600);
    if (s?.signedUrl) report.photo_url = s.signedUrl;
  }
  return NextResponse.json(report);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const { error } = await admin.from("label_scans").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
