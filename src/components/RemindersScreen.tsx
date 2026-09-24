"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { SLOTS, parse, pretty } from "@/lib/reminders";
import type { Profile, ReminderPref } from "@/lib/types";
import SubPage from "./SubPage";
import { Bell } from "./icons";
import { Card, ErrorNote, Hair, PillButton, Rise, Toggle } from "./ui";

/**
 * Five daily nudges, saved to `profiles.reminders` so the Android app's alarms pick them up.
 * The web itself does not push notifications yet.
 */
export default function RemindersScreen({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, ReminderPref>>(() => parse(profile.reminders));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(parse(profile.reminders));

  const set = (key: string, next: ReminderPref) => {
    setPrefs({ ...prefs, [key]: next });
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ reminders: prefs });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SubPage title="Tracking reminders" back="/profile/preferences">
      <Rise index={0}>
        <p className="text-[13px] leading-[18px] muted">A quiet nudge at each meal so nothing goes unlogged. Tap a time to change it.</p>
      </Rise>
      <Rise index={0}>
        <div className="flex gap-3 rounded-[14px] p-3.5" style={{ background: "var(--orange-bg)", color: "var(--orange)" }}>
          <span style={{ flex: "none", display: "inline-flex", marginTop: 1 }}>
            <Bell size={18} />
          </span>
          <p className="text-[13px] leading-[18px]">
            Notifications arrive on the Android app; on iPhone add the app to your Home Screen and enable notifications in a future update.
          </p>
        </div>
      </Rise>

      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            {SLOTS.map((slot, i) => {
              const pref = prefs[slot.key] ?? { on: false, time: slot.defaultTime };
              return (
                <div key={slot.key}>
                  {i > 0 ? <Hair /> : null}
                  <div className="flex items-center justify-between gap-2 py-2.5">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-semibold">{slot.label}</span>
                      <span className="text-[11px] muted">Locked In — {slot.prompt}</span>
                    </span>
                    <label className="relative inline-flex items-center rounded-[10px] px-3 py-2" style={{ background: "var(--card2)" }}>
                      <span className="num text-sm font-bold" style={{ color: pref.on ? "var(--ink)" : "var(--muted)" }}>
                        {pretty(pref.time)}
                      </span>
                      <input
                        type="time"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        value={pref.time}
                        onChange={(e) => e.target.value && set(slot.key, { ...pref, time: e.target.value })}
                        aria-label={`${slot.label} reminder time`}
                      />
                    </label>
                    <Toggle on={pref.on} onChange={(on) => set(slot.key, { ...pref, on })} label={`${slot.label} reminder`} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <ErrorNote text={error} />
      </Rise>
      <Rise index={2}>
        <PillButton onClick={save} disabled={busy || (!dirty && saved)}>
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save reminders"}
        </PillButton>
      </Rise>
    </SubPage>
  );
}
