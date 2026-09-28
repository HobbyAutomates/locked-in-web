import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { USER_BUCKETS, deleteConfirmed } from "@/lib/social/safety";

export const dynamic = "force-dynamic";

/**
 * v2.18 E5 account deletion (web and Android). POST { confirm: "DELETE" } as the signed-in user
 * (cookie or bearer). Steps: bandlog.wipe_user (schema_v45: hands owned squads to another member,
 * deletes every bandlog row; skipped when missing), the person's storage files ("<uid>/…" in each
 * bucket), then the auth user itself (every bandlog table cascades from auth.users). Irreversible.
 */
export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: false, error: "Deletion isn't set up on this server. Email sohumai.team@gmail.com." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (!deleteConfirmed(String(body.confirm ?? ""))) return NextResponse.json({ ok: false, error: "Type DELETE to confirm" }, { status: 400 });

  const uid = user.id;
  const wipe = await admin.rpc("wipe_user", { u: uid });
  const wiped = !wipe.error;

  let files = 0;
  for (const bucket of USER_BUCKETS) {
    try {
      for (let page = 0; page < 20; page++) {
        const { data, error } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
        if (error || !data?.length) break;
        const paths = data.map((f) => `${uid}/${f.name}`);
        const { error: e2 } = await admin.storage.from(bucket).remove(paths);
        if (e2) break;
        files += paths.length;
        if (data.length < 1000) break;
      }
    } catch {
      // A missing bucket is fine.
    }
  }

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.error("[account/delete] auth delete failed", { uid, error: error.message });
    return NextResponse.json({ ok: false, error: "Couldn't finish deleting the account. Email sohumai.team@gmail.com and we'll do it by hand." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, wiped, files });
}
