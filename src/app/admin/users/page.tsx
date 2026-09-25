import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { buildAdminUsers, type AdminUser } from "@/lib/admin/data";
import { loadDataset } from "@/lib/admin/insights/load";
import { buildUserUsage, RISK_DAYS, type UserUsage } from "@/lib/admin/insights/build";
import { AdminNav, Section, TableWrap, num, when } from "@/components/admin/AdminUi";

export const dynamic = "force-dynamic";

type UserRow = AdminUser & Omit<UserUsage, "id">;

const COLUMNS: { key: keyof UserRow; label: string }[] = [
  { key: "username", label: "Username" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "created_at", label: "Signed up" },
  { key: "last_sign_in_at", label: "Last sign-in" },
  { key: "atRisk", label: "At risk" },
  { key: "daysActive7", label: "Days active 7d" },
  { key: "meals7", label: "Meals 7d" },
  { key: "topFeature", label: "Top feature 30d" },
  { key: "last_seen", label: "Last event" },
  { key: "lastEventName", label: "Last event name" },
  { key: "lastActive", label: "Last active" },
  { key: "platform", label: "Platform" },
  { key: "app_version", label: "Version" },
  { key: "onboarded", label: "Onboarded" },
  { key: "events", label: "Events 90d" },
];

function sorted(users: UserRow[], key: keyof UserRow, dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    // Blanks always sink to the bottom.
    const ex = x == null || x === "";
    const ey = y == null || y === "";
    if (ex !== ey) return ex ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    if (typeof x === "boolean" && typeof y === "boolean") return (Number(x) - Number(y)) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ sort?: string; dir?: string }> }) {
  const { db } = await requireAdmin();
  const sp = await searchParams;
  const key = COLUMNS.find((c) => c.key === sp.sort)?.key ?? "created_at";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const ds = await loadDataset(db);
  const usage = new Map(buildUserUsage(ds).map((u) => [u.id, u]));
  const users: UserRow[] = buildAdminUsers(ds.users, ds.profiles, ds.events).map((u) => {
    const x = usage.get(u.id);
    return {
      ...u,
      daysActive7: x?.daysActive7 ?? 0,
      meals7: x?.meals7 ?? 0,
      topFeature: x?.topFeature ?? "",
      lastEventName: x?.lastEventName ?? "",
      lastActive: x?.lastActive ?? null,
      daysSinceActive: x?.daysSinceActive ?? null,
      atRisk: x?.atRisk ?? true,
    };
  });
  const rows = sorted(users, key, dir);
  const risky = users.filter((u) => u.atRisk).length;
  return (
    <>
      <AdminNav active="users" />
      <Section
        title={`Users (${num(users.length)}, ${num(risky)} at risk)`}
        note={
          <>
            Every auth user, joined with bandlog.profiles and the last 90 days of app events and logged rows. Active = any app event or logged row. At risk = no
            activity in {RISK_DAYS}+ days. Top feature = most uses in 30 days. {ds.eventsAvailable ? "" : "Platform and version need app events: run supabase/schema_v33.sql. "}
            Tap a header to sort.
          </>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const on = c.key === key;
                const next = on && dir === "desc" ? "asc" : "desc";
                return (
                  <th key={c.key} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <Link href={`/admin/users?sort=${c.key}&dir=${next}`} className="hover:underline" style={on ? { color: "var(--ink)" } : undefined}>
                      {c.label}
                      {on ? (dir === "asc" ? " ↑" : " ↓") : ""}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">
                  <Link href={`/admin/users/${u.id}`} className="underline decoration-[var(--hair)] underline-offset-2">
                    {u.username ? `@${u.username}` : "(no username)"}
                  </Link>
                </td>
                <td>{u.name || "—"}</td>
                <td className="max-w-[220px] truncate">{u.email || "—"}</td>
                <td className="whitespace-nowrap">{when(u.created_at, false)}</td>
                <td className="whitespace-nowrap">{when(u.last_sign_in_at)}</td>
                <td style={u.atRisk ? { color: "var(--red)" } : undefined}>
                  {u.atRisk ? (u.daysSinceActive == null ? "Yes (never)" : `Yes (${u.daysSinceActive}d)`) : "No"}
                </td>
                <td className="num text-right">{num(u.daysActive7)}</td>
                <td className="num text-right">{num(u.meals7)}</td>
                <td className="whitespace-nowrap">{u.topFeature || "—"}</td>
                <td className="whitespace-nowrap">{when(u.last_seen)}</td>
                <td className="whitespace-nowrap">{u.lastEventName || "—"}</td>
                <td className="num whitespace-nowrap">{u.lastActive ?? "—"}</td>
                <td>{u.platform || "—"}</td>
                <td className="whitespace-nowrap">{u.app_version || "—"}</td>
                <td>{u.onboarded ? "Yes" : "No"}</td>
                <td className="num text-right">{num(u.events)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Section>
    </>
  );
}
