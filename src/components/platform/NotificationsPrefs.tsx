"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveNotificationPrefs } from "@/lib/platformActions";
import type { NotificationPrefs } from "@/lib/platform-data";
import { currentSubscription, disablePush, enablePush, pushSupport, registerSw, type PushSupport } from "@/lib/pushClient";
import { Bell, Share } from "../icons";
import { Card, ErrorNote, Hair, Rise, SettingRow, Toggle } from "../ui";

/**
 * v2.13 Preferences → Notifications: web push on this device (with the iPhone "Add to Home Screen"
 * steps when it's a Safari tab), the daily protein nudge and its time, and the inbox.
 */
export default function NotificationsPrefs({ prefs }: { prefs: NotificationPrefs }) {
  const router = useRouter();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(prefs.protein_nudge);
  const [time, setTime] = useState(prefs.protein_nudge_time);

  useEffect(() => {
    let alive = true;
    const s = pushSupport();
    void currentSubscription().then((sub) => {
      if (!alive) return;
      setSupport(s);
      setOn(!!sub && s.state === "ready" && s.permission === "granted");
    });
    return () => {
      alive = false;
    };
  }, []);

  async function togglePush(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (next) {
        const r = await enablePush();
        if (!r.ok) setError(r.error);
        else setOn(true);
      } else {
        await disablePush();
        setOn(false);
      }
      setSupport(pushSupport());
    } finally {
      setBusy(false);
    }
  }

  async function save(patch: { protein_nudge?: boolean; protein_nudge_time?: string }) {
    setError(null);
    const r = await saveNotificationPrefs(patch);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  async function test() {
    const reg = await registerSw();
    await reg?.showNotification("Locked In", { body: "Notifications are on. Nice.", icon: "/apple-touch-icon.png", tag: "test" });
  }

  return (
    <>
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Bell size={20} />} label="Push notifications" subtitle="Nudges, protein reminders, fasting and check-ins">
              {support?.state === "ready" ? <Toggle on={on} onChange={(v) => void togglePush(v)} label="Push notifications" disabled={busy || support.permission === "denied"} /> : <span className="text-[13px] muted">{support == null ? "…" : "Off"}</span>}
            </SettingRow>
          </div>
        </Card>
      </Rise>

      {support?.state === "ios-browser" ? (
        <Rise index={1}>
          <Card>
            <p className="text-[15px] font-bold">On iPhone: add Locked In to your Home Screen</p>
            <ol className="mt-2 flex list-none flex-col gap-2 p-0 text-[14px] leading-snug">
              <li className="flex items-start gap-2.5">
                <Step n={1} /> In Safari, tap <Share size={16} style={{ display: "inline", verticalAlign: "-3px" }} /> Share.
              </li>
              <li className="flex items-start gap-2.5">
                <Step n={2} /> Choose &ldquo;Add to Home Screen&rdquo;, then Add.
              </li>
              <li className="flex items-start gap-2.5">
                <Step n={3} /> Open Locked In from the Home Screen and turn notifications on here.
              </li>
            </ol>
            <p className="mt-2.5 text-[12px] muted">Apple only allows notifications for home-screen apps, on iOS 16.4 or newer.</p>
          </Card>
        </Rise>
      ) : null}
      {support?.state === "ready" && support.permission === "denied" ? (
        <Rise index={1}>
          <p className="px-1 text-[13px] muted">Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.</p>
        </Rise>
      ) : null}
      {support?.state === "unsupported" ? (
        <Rise index={1}>
          <p className="px-1 text-[13px] muted">This browser can&rsquo;t show notifications. Your inbox still collects everything.</p>
        </Rise>
      ) : null}
      {support?.state === "no-key" ? (
        <Rise index={1}>
          <p className="px-1 text-[13px] muted">Push isn&rsquo;t switched on for this server yet. Your inbox still collects everything.</p>
        </Rise>
      ) : null}
      {on ? (
        <Rise index={1}>
          <button type="button" className="press self-start px-1 text-[13px] font-semibold underline muted" style={{ background: "none", border: 0 }} onClick={() => void test()}>
            Send a test notification
          </button>
        </Rise>
      ) : null}

      <Rise index={2}>
        <p className="px-1 text-xs font-semibold muted">Protein nudge</p>
      </Rise>
      <Rise index={2}>
        {prefs.available ? (
          <Card padding={0}>
            <div className="px-4">
              <SettingRow label="Afternoon protein check" subtitle="If you're under 70% of your protein by then">
                <Toggle
                  on={nudge}
                  onChange={(v) => {
                    setNudge(v);
                    void save({ protein_nudge: v });
                  }}
                  label="Protein nudge"
                />
              </SettingRow>
              <Hair />
              <SettingRow label="Time">
                <input
                  type="time"
                  value={time}
                  disabled={!nudge}
                  aria-label="Protein nudge time"
                  className="num rounded-xl px-2.5 py-1.5 text-[14px]"
                  style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}
                  onChange={(e) => setTime(e.target.value)}
                  onBlur={() => {
                    if (time !== prefs.protein_nudge_time && /^\d{2}:\d{2}$/.test(time)) void save({ protein_nudge_time: time });
                  }}
                />
              </SettingRow>
            </div>
          </Card>
        ) : (
          <p className="px-1 text-[13px] muted">Coming with the next update.</p>
        )}
      </Rise>

      <Rise index={3}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow label="Inbox" subtitle="Everything we've sent you" href="/notifications">
              <span className="text-[13px] muted">Open</span>
            </SettingRow>
          </div>
        </Card>
      </Rise>
      <ErrorNote text={error} />
      <Rise index={4}>
        <p className="px-1 text-[12px] muted">
          Meal reminders live in <Link href="/profile/reminders" className="underline">Reminders</Link>.
        </p>
      </Rise>
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "var(--card2)" }}>
      {n}
    </span>
  );
}
