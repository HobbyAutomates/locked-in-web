import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

/**
 * Pushed pages (Profile sub-pages, Badges): signed-in only, no tab bar, and no onboarding
 * bounce — Personal details is where a skipped profile gets filled in.
 */
export default async function SubLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) redirect("/");
  const { user } = await requireUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
