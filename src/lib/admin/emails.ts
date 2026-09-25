/** ADMIN_EMAILS: comma-separated, case-insensitive. Unset or empty means nobody is an admin. */
export function isAdminEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  if (!e) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}
