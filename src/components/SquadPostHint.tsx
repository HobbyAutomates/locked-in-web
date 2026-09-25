"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { POST_HINT_COOKIE, POST_HINT_SEEN_COOKIE, POST_HINT_SEEN_KEY, POST_HINT_TEXT, SQUAD_SHARING_HREF, shouldShowPostHint } from "@/lib/squadSharing";
import { UndoSnackbar } from "./LogBits";

const hasCookie = (name: string) => document.cookie.split(/;\s*/).some((c) => c.startsWith(`${name}=`));

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(POST_HINT_SEEN_KEY) === "1" || hasCookie(POST_HINT_SEEN_COOKIE);
  } catch {
    return hasCookie(POST_HINT_SEEN_COOKIE);
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(POST_HINT_SEEN_KEY, "1");
  } catch {
    // The cookie below still stops the server asking again.
  }
  document.cookie = `${POST_HINT_SEEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
}

/**
 * v2.9: the first time a save auto-posts to a squad, one line: "Posted to your squads · Change",
 * where Change opens Profile → Privacy → Squad sharing. Shown once per browser. The server
 * actions leave a short-lived cookie when the RPC wrote rows (see notePosted in actions.ts);
 * this polls for it once a second until the hint has been seen, then stops for good.
 */
export function SquadPostHint() {
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readSeen()) {
      if (!hasCookie(POST_HINT_SEEN_COOKIE)) markSeen();
      return;
    }
    const check = () => {
      if (!hasCookie(POST_HINT_COOKIE)) return;
      document.cookie = `${POST_HINT_COOKIE}=; path=/; max-age=0`;
      if (!shouldShowPostHint(1, readSeen())) return;
      markSeen();
      clearInterval(every);
      setShow(true);
    };
    const every = setInterval(check, 1000);
    check();
    return () => clearInterval(every);
  }, [pathname]);

  useEffect(() => {
    if (!show) return;
    const hide = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(hide);
  }, [show]);

  return (
    <UndoSnackbar
      text={show ? POST_HINT_TEXT : null}
      actionLabel="Change"
      onUndo={() => {
        setShow(false);
        router.push(SQUAD_SHARING_HREF);
      }}
    />
  );
}
