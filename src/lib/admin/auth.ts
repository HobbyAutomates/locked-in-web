import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/apiAuth";
import { isAdminEmail } from "./emails";

/**
 * The gate for everything under /admin. Every admin page (and any future /admin route handler)
 * calls this first, on the server. Anyone who isn't a signed-in, email-confirmed address listed
 * in ADMIN_EMAILS gets a plain 404, never a 403, so the panel's existence isn't revealed.
 * Returns the service-role client (bandlog schema), which never leaves the server.
 */
export const requireAdmin = cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email_confirmed_at || !isAdminEmail(user.email)) notFound();
  return { user, db: adminClient() };
});

export type AdminDb = ReturnType<typeof adminClient>;
