import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Service-role client bound to the bandlog schema. */
export function adminClient() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "bandlog" },
    auth: { persistSession: false },
  });
}
export type AdminClient = ReturnType<typeof adminClient>;

/**
 * Resolves the caller of an /api route. Browser calls carry the session cookie; the Android app
 * sends its Supabase access token as a bearer. Also hands back a service-role client (schema
 * bandlog) for writes that must not depend on which client produced the token.
 */
export async function apiUser(req: Request): Promise<{ user: { id: string; email?: string } | null; admin: AdminClient; bearer: string | null }> {
  const supabase = await createClient();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  const admin = adminClient();
  return { user: user ? { id: user.id, email: user.email } : null, admin, bearer };
}
