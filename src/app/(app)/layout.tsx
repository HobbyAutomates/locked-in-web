import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="min-h-full flex items-center justify-center px-4 py-10">
        <div className="card max-w-sm">
          <p className="label">Setup needed</p>
          <h1 className="text-2xl font-extrabold mb-2">Add your Supabase keys</h1>
          <p className="text-sm muted">
            Fill <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, run the SQL in
            <code> supabase/schema.sql</code>, then restart the dev server. Steps are in the README.
          </p>
        </div>
      </main>
    );
  }
  const { user } = await requireUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 w-full max-w-lg mx-auto px-4 pt-[calc(16px+env(safe-area-inset-top,0px))] pb-28">{children}</main>
      <Nav />
    </div>
  );
}
