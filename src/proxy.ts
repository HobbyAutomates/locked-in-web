import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/admin/emails";

/**
 * v2.10: /admin for non-admins is rewritten, before routing, to a path that doesn't exist, so the
 * response is the app's ordinary 404, byte-for-byte the same shape as any unknown URL. (A notFound()
 * thrown from the admin pages alone still carries the matched "admin" segment in the RSC payload.)
 * This is only the outer layer: every admin page still calls requireAdmin() itself.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let ok = false;
  try {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    ok = !!user?.email_confirmed_at && isAdminEmail(user.email);
  } catch {
    ok = false;
  }
  if (ok) return response;
  const url = request.nextUrl.clone();
  url.pathname = `/${crypto.randomUUID()}`;
  url.search = "";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
