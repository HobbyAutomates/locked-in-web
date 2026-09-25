"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track";

/** The six screens the beta dashboard counts, by route. Anything else (login, admin, sub-pages) isn't a screen_view. */
function screenOf(path: string): string | null {
  if (path === "/") return "Home";
  if (path === "/log" || path === "/meal") return "Log";
  if (path === "/scan") return "Scan";
  if (path === "/squad" || path.startsWith("/squad/")) return "Squad";
  if (path === "/progress") return "Progress";
  if (path === "/profile" || path.startsWith("/profile/")) return "Profile";
  return null;
}

/** v2.10: app_open once per browser session, then a screen_view per route change (see src/lib/track.ts). */
export default function ScreenTracker() {
  const path = usePathname();
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("li.opened")) {
        sessionStorage.setItem("li.opened", "1");
        track("app_open", { standalone: window.matchMedia("(display-mode: standalone)").matches });
      }
    } catch {
      // storage blocked: skip app_open
    }
  }, []);
  useEffect(() => {
    const screen = screenOf(path);
    if (screen) track("screen_view", { screen });
  }, [path]);
  return null;
}
