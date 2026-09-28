"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logWater, saveExercise, saveMeal, saveWorkout } from "@/lib/actions";
import { claimReferral, syncFreezes } from "@/lib/social/actions";
import { cachedCount, flushQueue, readQueue } from "@/lib/social/offlineStore";
import { OFFLINE_EVENT, type QueueItem } from "@/lib/social/offlineQueue";
import { FREEZE_SYNC_KEY } from "@/lib/social/freezes";
import { REF_STORAGE_KEY, claimMessage } from "@/lib/social/referrals";
import { syncLabel, t, type Lang } from "@/lib/social/i18n";
import { today } from "@/lib/dates";

/**
 * v2.18 social + platform boot, mounted once by the tab layout:
 *   - E1: the "3 waiting to sync" chip; replays the offline queue on `online`, on focus and on load;
 *     registers the service worker so the app shell opens offline.
 *   - D5: runs freeze_sync once a day (earns perfect-week tokens, auto-uses one for yesterday).
 *   - D2: claims an invite code stored by /r/<code>, once, after sign-in.
 * Everything here is best effort: a missing v44 table just means nothing happens.
 */

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // Private mode: skip.
  }
};

async function replay(item: QueueItem): Promise<void> {
  const p = item.payload as Record<string, unknown>;
  switch (item.kind) {
    case "meal":
      await saveMeal(p as Parameters<typeof saveMeal>[0]);
      return;
    case "workout": {
      const r = await saveWorkout(p as Parameters<typeof saveWorkout>[0]);
      if (!r.ok) throw new Error(r.error);
      return;
    }
    case "exercise":
      await saveExercise(p as Parameters<typeof saveExercise>[0]);
      return;
    case "water":
      await logWater(Number(p.ml) || 250, typeof p.date === "string" ? p.date : undefined, (p.vessel as Parameters<typeof logWater>[2]) ?? null);
      return;
  }
}

export default function SocialBoot({ lang = "en" }: { lang?: Lang }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const q = await readQueue();
    setCount(q.length);
    if (!q.length) return;
    setBusy(true);
    try {
      const r = await flushQueue(replay);
      setCount(r.left);
      if (r.synced > 0) {
        say(t("sync.done", lang));
        router.refresh();
      }
      if (r.dropped.length) say(`Couldn't sync ${r.dropped.length === 1 ? "one log" : `${r.dropped.length} logs`}: ${r.dropped[0].last_error ?? "server error"}`);
    } finally {
      setBusy(false);
    }
  }, [lang, router, say]);

  // Offline queue: count, replay on online / focus / load, live updates from withQueue().
  useEffect(() => {
    setCount(cachedCount());
    void flush();
    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    const onQueue = (e: Event) => {
      const n = Number((e as CustomEvent).detail?.count ?? 0) || 0;
      setCount((prev) => {
        if (n > prev && typeof navigator !== "undefined" && navigator.onLine === false) say(t("sync.queued", lang));
        return n;
      });
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(OFFLINE_EVENT, onQueue);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(OFFLINE_EVENT, onQueue);
    };
  }, [flush, lang, say]);

  // Service worker (offline app shell). Same /sw.js the notifications use; registering twice is a no-op.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Unsupported (http, private mode): the queue still works while the tab stays open.
    });
  }, []);

  // D5 freeze sync, once a day per device.
  useEffect(() => {
    const d = today();
    if (get(FREEZE_SYNC_KEY) === d) return;
    void syncFreezes()
      .then((r) => {
        if (!r.ok) {
          if (r.missing) set(FREEZE_SYNC_KEY, d);
          return;
        }
        set(FREEZE_SYNC_KEY, d);
        if (r.data.used_now > 0) {
          say(r.data.used_now === 1 ? "A streak freeze covered yesterday. Streak safe." : `${r.data.used_now} streak freezes covered the missed days.`);
          router.refresh();
        } else if (r.data.earned_now > 0) say("Perfect week: +1 streak freeze.");
      })
      .catch(() => {
        // Offline: try again next open.
      });
  }, [router, say]);

  // D2 invite code from /r/<code>.
  useEffect(() => {
    const code = get(REF_STORAGE_KEY);
    if (!code) return;
    void claimReferral(code)
      .then((r) => {
        if (!r.ok) {
          if (!r.missing) set(REF_STORAGE_KEY, null);
          return;
        }
        set(REF_STORAGE_KEY, null);
        say(claimMessage(r.data));
      })
      .catch(() => {
        // Keep the code for the next open.
      });
  }, [say]);

  const label = syncLabel(count, lang);
  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={() => void flush()}
          aria-live="polite"
          className="press fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold"
          style={{ bottom: "calc(104px + env(safe-area-inset-bottom, 0px))", height: 32, background: "var(--ink)", color: "var(--bg)", border: 0, boxShadow: "var(--shadow-lg)" }}
        >
          <span aria-hidden="true" className={busy ? "animate-spin" : undefined} style={{ display: "inline-flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
            </svg>
          </span>
          {busy ? t("sync.syncing", lang) : label}
        </button>
      ) : null}
      {toast ? (
        <div role="status" className="fixed inset-x-0 z-50 mx-auto w-[calc(100%-32px)] max-w-[448px] rounded-2xl px-4 py-3 text-[14px] font-medium" style={{ bottom: "calc(142px + env(safe-area-inset-bottom, 0px))", background: "var(--ink)", color: "var(--bg)", boxShadow: "var(--shadow-lg)" }}>
          {toast}
        </div>
      ) : null}
    </>
  );
}
