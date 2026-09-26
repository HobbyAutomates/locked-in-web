"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/lib/platformActions";
import type { InboxItem, NotificationKind } from "@/lib/notify";
import SubPage from "../SubPage";
import { MRise } from "../motion";
import { LineIcon, type LineName } from "../lineIcons";
import { ComingSoon, PCard } from "./kit";
import { invalidateHomeEntries } from "./HomeEntries";

const ICON: Record<NotificationKind, LineName> = { nudge: "users", protein: "drop", fasting: "flame", checkin: "chart", system: "bell", coach: "spark", buddy: "flame" };

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** v2.13 in-app notifications inbox (spec §2). */
export default function InboxScreen({ available, items, now }: { available: boolean; items: InboxItem[]; now: number }) {
  const router = useRouter();
  const [read, setRead] = useState<Set<string>>(() => new Set(items.filter((i) => i.read_at).map((i) => i.id)));
  const unread = items.filter((i) => !read.has(i.id)).length;

  async function open(i: InboxItem) {
    if (!read.has(i.id)) {
      setRead((r) => new Set(r).add(i.id));
      invalidateHomeEntries();
      void markNotificationsRead([i.id]);
    }
    if (i.url) router.push(i.url);
  }

  async function all() {
    setRead(new Set(items.map((i) => i.id)));
    invalidateHomeEntries();
    await markNotificationsRead(null);
    router.refresh();
  }

  return (
    <SubPage title="Notifications" back="/">
      {!available ? (
        <ComingSoon what="The notifications inbox" />
      ) : (
        <>
          <MRise delay={0}>
            <div className="flex items-center justify-between px-1">
              <p className="text-[13px] font-semibold muted">{unread ? `${unread} unread` : "All caught up"}</p>
              {unread ? (
                <button type="button" className="press min-h-11 text-[13px] font-semibold" style={{ background: "none", border: 0, color: "var(--accent)" }} onClick={() => void all()}>
                  Mark all read
                </button>
              ) : null}
            </div>
          </MRise>
          {items.length === 0 ? (
            <MRise delay={150}>
              <PCard label="Empty">
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  <LineIcon name="bell" size={18} /> Nothing yet
                </p>
                <p className="text-[13px] muted">Squad nudges, protein reminders, fasting goals and weekly check-ins show up here.</p>
              </PCard>
            </MRise>
          ) : (
            <MRise delay={150}>
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[22px] p-0" style={{ background: "var(--pcard)", boxShadow: "var(--pcard-ring)" }}>
                {items.map((i, k) => {
                  const isNew = !read.has(i.id);
                  return (
                    <li key={i.id} style={{ borderTop: k ? "1px solid var(--hair)" : 0 }}>
                      <button type="button" className="press flex w-full items-start gap-3 px-4 py-3.5 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => void open(i)}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: isNew ? "var(--accent)" : "var(--card2)", color: isNew ? "var(--accent-ink)" : "var(--ink)" }}>
                          <LineIcon name={ICON[i.kind]} size={17} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={`text-[15px] leading-snug ${isNew ? "font-bold" : "font-medium"}`}>{i.title}</span>
                          {i.body ? <span className="text-[13px] leading-snug muted">{i.body}</span> : null}
                          <span className="mt-0.5 text-[11px] muted">{ago(i.created_at, now)}</span>
                        </span>
                        {isNew ? <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </MRise>
          )}
        </>
      )}
    </SubPage>
  );
}
