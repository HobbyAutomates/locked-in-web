"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadHomeEntries, type HomeEntries } from "@/lib/platformActions";
import { recapDue } from "@/lib/recap";
import { dayMinutes, daySets } from "@/lib/training";
import { enablePush, pushSupport, registerSw, currentSubscription } from "@/lib/pushClient";
import { LineIcon } from "../lineIcons";
import { Bell } from "../icons";
import { ProChip } from "./kit";

/**
 * v2.13 Home entry points, self-contained so HomeScreen only gains an import and three JSX lines:
 *   <InboxBell />        the header bell with the unread count
 *   <HomeBanner />       Monday / 1st-of-month recap prompt, else the one-time push prompt
 *   <TodaySessionCard /> the active routine's session for today
 * All three share one server round trip (loadHomeEntries), cached for 30 s.
 */

let cache: { at: number; p: Promise<HomeEntries> } | null = null;
function useHome(): HomeEntries | null {
  const [data, setData] = useState<HomeEntries | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), p: loadHomeEntries() };
    cache.p.then((d) => alive && setData(d)).catch(() => {
      cache = null;
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // Private mode: the card just comes back next time.
  }
};

export function InboxBell() {
  const d = useHome();
  // Keep the service worker current for people who already turned push on.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") void registerSw();
  }, []);
  if (!d || d.unread == null) return null;
  return (
    <Link href="/notifications" aria-label={d.unread ? `Notifications, ${d.unread} unread` : "Notifications"} className="press relative grid h-9 w-9 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--ink)", marginLeft: "auto", marginRight: 8 }}>
      <Bell size={19} />
      {d.unread ? (
        <span className="num m-pop absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
          {d.unread > 9 ? "9+" : d.unread}
        </span>
      ) : null}
    </Link>
  );
}

export function TodaySessionCard() {
  const d = useHome();
  if (!d?.session || !d.pro) return null;
  const s = d.session;
  return (
    <Link href={`/train/session?routine=${s.routineId}&day=${s.dayIndex}`} className="card press m-rise flex items-center gap-3.5" style={{ padding: "14px 14px 14px 16px", color: "var(--ink)" }} aria-label={`Today's session: ${s.day.name}. Start workout`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
        <LineIcon name="flame" size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-xs font-semibold muted">
          Today&rsquo;s session <ProChip />
        </span>
        <span className="truncate text-[17px] font-extrabold leading-tight">{s.day.name}</span>
        <span className="num truncate text-xs muted">
          {s.day.exercises.length} exercises · {daySets(s.day)} sets · ~{dayMinutes(s.day)} min · {s.routineName}
        </span>
      </span>
      <span className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold" style={{ background: "var(--ink)", color: "var(--bg)" }}>
        Start
      </span>
    </Link>
  );
}

/** Recap prompt on Mondays / the 1st; otherwise a one-time "turn on notifications" card. */
export function HomeBanner() {
  const d = useHome();
  const [gone, setGone] = useState<string | null>(null);
  const [push, setPush] = useState<"ask" | "hidden">("hidden");
  const [msg, setMsg] = useState<string | null>(null);
  const due = d ? recapDue(d.today) : null;
  const recapKey = d && due ? `lockedin-recap-${due}-${d.today}` : null;

  useEffect(() => {
    if (!d || d.unread == null) return;
    const s = pushSupport();
    if (read("lockedin-push-prompt") || (s.state !== "ready" && s.state !== "ios-browser")) return;
    if (s.state === "ready" && s.permission !== "default") return;
    let alive = true;
    void currentSubscription().then((sub) => alive && !sub && setPush("ask"));
    return () => {
      alive = false;
    };
  }, [d]);

  if (!d) return null;

  if (due && d.pro && recapKey && gone !== recapKey && !read(recapKey)) {
    const word = due === "weekly" ? "week" : "month";
    return (
      <div className="card m-rise flex items-center gap-3" style={{ padding: "14px 12px 14px 16px", background: "linear-gradient(135deg, var(--cover-a), var(--cover-b))", color: "var(--bg)" }}>
        <Link href={`/recap/${due}`} className="press flex min-w-0 flex-1 items-center gap-3" style={{ color: "inherit" }} onClick={() => write(recapKey, "1")}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
            <LineIcon name="spark" size={20} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 text-[16px] font-extrabold">
              Your {word} in review <ProChip />
            </span>
            <span className="truncate text-xs" style={{ opacity: 0.75 }}>
              Tap to watch your {word === "week" ? "weekly" : "monthly"} recap
            </span>
          </span>
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-[18px]"
          style={{ background: "transparent", color: "inherit", border: 0, opacity: 0.7 }}
          onClick={() => {
            write(recapKey, "1");
            setGone(recapKey);
          }}
        >
          ×
        </button>
      </div>
    );
  }

  if (push !== "ask") return null;
  const ios = pushSupport().state === "ios-browser";
  const close = () => {
    write("lockedin-push-prompt", "1");
    setPush("hidden");
  };
  return (
    <div className="card m-rise flex flex-col gap-2.5" style={{ padding: 16 }}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--card2)" }}>
          <Bell size={19} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-extrabold">Know when your squad nudges you</span>
          <span className="text-xs muted">{ios ? "On iPhone: Share → Add to Home Screen, then open Locked In from there to turn notifications on." : "Nudges, a protein check in the afternoon, and your weekly check-in."}</span>
        </span>
      </div>
      {msg ? <span className="text-xs muted">{msg}</span> : null}
      <div className="flex gap-2">
        {ios ? null : (
          <button
            type="button"
            className="press h-10 flex-1 rounded-full text-[14px] font-bold"
            style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }}
            onClick={() =>
              void enablePush().then((r) => {
                if (r.ok) close();
                else setMsg(r.error);
              })
            }
          >
            Turn on
          </button>
        )}
        <button type="button" className="press h-10 flex-1 rounded-full text-[14px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} onClick={close}>
          {ios ? "Got it" : "Not now"}
        </button>
      </div>
    </div>
  );
}
