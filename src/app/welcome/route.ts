import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

/**
 * v2.14: the public landing page ("Fitness is a group project", canvas board L3b), dark + light.
 * The pages are generated from the design canvas into public/landing/{dark,light}.html; this route
 * picks one from ?theme=, then the li-theme cookie, then dark (the dark page switches itself to light
 * on a first visit when the device prefers light). Logged-in users never need it; it's for sharing.
 */
const cache = new Map<string, string>();

async function page(theme: "dark" | "light") {
  const hit = cache.get(theme);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const html = await readFile(path.join(process.cwd(), "public", "landing", `${theme}.html`), "utf8");
  cache.set(theme, html);
  return html;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("theme");
  const c = request.cookies.get("li-theme")?.value;
  const theme = q === "light" || q === "dark" ? q : c === "light" ? "light" : "dark";
  const res = new NextResponse(await page(theme), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
  if (q === "light" || q === "dark") res.cookies.set("li-theme", q, { path: "/welcome", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
