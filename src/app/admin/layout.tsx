import { requireAdmin } from "@/lib/admin/auth";
import { ANALYTICS_ON } from "@/lib/analytics";

/**
 * /admin shell. The gate runs here AND in every page (requireAdmin is cached per request), since a
 * layout alone isn't re-run on every navigation. Non-admins get a 404. No admin-specific metadata:
 * it would render on that 404 too and give the page away (notFound() already adds noindex).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4" style={{ paddingTop: "calc(16px + env(safe-area-inset-top, 0px))", paddingBottom: 40 }}>
      <header>
        <h1 className="screen-title">Admin</h1>
        <p className="text-xs muted">
          {user.email} · beta analytics {ANALYTICS_ON ? "on" : "off"}
        </p>
      </header>
      {children}
    </main>
  );
}
