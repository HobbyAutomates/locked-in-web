"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { ageFrom, type Profile } from "@/lib/types";
import { APP_VERSION, CHANGELOG, compareVersions } from "@/lib/version";
import { displayName, weightText } from "@/lib/display";
import { AvatarPicker } from "./Avatar";
import ProfileSetupSheet from "./ProfileSetupSheet";
import { Flame, Gear, Mail, Medal, Pencil, Person, Phone, Refresh, Scale, Share, Sparkle, Target } from "./icons";
import { BottomSheet, Card, Chevron, ErrorNote, GroupLabel, Hair, Rise, SettingRow } from "./ui";

const APK_URL = "https://evizkfvltacrfngsgbuu.supabase.co/storage/v1/object/public/app/LockedIn-14.apk";
const WEB_URL = "https://web-production-ff1cf.up.railway.app";
const INVITE_TEXT = `Locked In — workouts, meals by voice, label scanner. Android: ${APK_URL} · iPhone: ${WEB_URL} (Safari → Add to Home Screen)`;

/**
 * The Profile tab, v2.4: who you are (avatar, name, email, age), then You (details, goals,
 * weight, badges), one Preferences row (categories live on their own page) and App (version,
 * what's new, invite, help). Every row edits in place, opens a sheet, or pushes a sub-page.
 */
export default function ProfileScreen({ profile, email, userId }: { profile: Profile; email: string; userId: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | "news" | "home">(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // v2.6: no username yet → the one-time "Create a username / Add a profile photo" sheet.
  const [setup, setSetup] = useState<null | "full" | "username">(profile.username ? null : "full");
  const age = ageFrom(profile.dob);
  // Blank name → the email's first run of letters ("ayaan.khan@…" → "Ayaan"), like the signup trigger.
  const shownName = displayName(profile.name, email);

  async function invite() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Locked In", text: INVITE_TEXT });
        return;
      }
      await navigator.clipboard.writeText(INVITE_TEXT);
      setInvited("Invite copied — paste it anywhere.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(INVITE_TEXT);
        setInvited("Invite copied — paste it anywhere.");
      } catch {
        setInvited(INVITE_TEXT);
      }
    }
  }

  async function saveName(name: string) {
    setError(null);
    try {
      await saveProfile({ name });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your name");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Rise index={0}>
        <h1 className="screen-title">Profile</h1>
      </Rise>
      {error ? (
        <Rise index={1}>
          <ErrorNote text={error} />
        </Rise>
      ) : null}

      {/* ---- header ---- */}
      <Rise index={1}>
        <Card padding={0}>
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <AvatarPicker userId={userId} path={profile.avatar_path} name={shownName || email} size={60} onError={setError} />
            <span className="flex min-w-0 flex-1 flex-col">
              <NameField name={shownName} onCommit={saveName} />
              <button type="button" className="press self-start truncate text-left text-[13px] font-semibold" style={{ background: "none", border: 0, padding: 0, color: profile.username ? "var(--ink)" : "var(--blue)" }} onClick={() => setSetup(profile.username ? "username" : "full")}>
                {profile.username ? `@${profile.username}` : "Create a username"}
              </button>
              <span className="truncate text-[13px] muted">{email || "—"}</span>
              {age != null ? <span className="text-xs muted">{age} yrs</span> : null}
            </span>
          </div>
        </Card>
      </Rise>

      <ProfileSetupSheet open={setup !== null} photo={setup === "full"} onClose={() => setSetup(null)} userId={userId} name={shownName} username={profile.username} avatarPath={profile.avatar_path} />

      {/* ---- You ---- */}
      <Rise index={1}>
        <GroupLabel>You</GroupLabel>
      </Rise>
      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Person size={20} />} label="Personal details" href="/profile/details">
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Target size={20} />} label="Nutrition goals" href="/profile/goals">
              <span className="flex items-center gap-1 text-[13px] muted">
                {profile.calorie_target} kcal
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Flame size={20} />} tint="var(--flame)" label="Goal weight" href="/profile/goal">
              <span className="flex items-center gap-1 text-[13px] muted">
                {profile.goal_weight_kg != null ? weightText(profile.goal_weight_kg, profile.units) : profile.goal_type.charAt(0).toUpperCase() + profile.goal_type.slice(1)}
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Scale size={20} />} label="Weight history" href="/profile/weight">
              <span className="flex items-center gap-1 text-[13px] muted">
                {weightText(profile.weight_kg, profile.units)}
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Medal size={20} />} label="Badges" href="/badges">
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      {/* ---- Preferences: one row, categories on their own page ---- */}
      <Rise index={2}>
        <GroupLabel>Preferences</GroupLabel>
      </Rise>
      <Rise index={2}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Gear size={20} />} label="Preferences" subtitle="Appearance, tracking, reminders, privacy, account" href="/profile/preferences">
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      {/* ---- App ---- */}
      <Rise index={3}>
        <GroupLabel>App</GroupLabel>
      </Rise>
      <Rise index={3}>
        <Card padding={0}>
          <div className="px-4">
            <VersionRow />
            <Hair />
            <SettingRow icon={<Sparkle size={20} />} label="What's new" subtitle={`${CHANGELOG[0]?.version ?? APP_VERSION} · ${CHANGELOG[0]?.date ?? ""}`} onClick={() => setSheet("news")}>
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Share size={20} />} tint="var(--orange)" label="Invite friends" subtitle={invited ?? "Android APK or the iPhone web app"} onClick={() => void invite()}>
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Phone size={20} />} label="Add to Home Screen" onClick={() => setSheet("home")}>
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Mail size={20} />} label="Request a feature" href="mailto:sohumai.team@gmail.com?subject=Locked%20In%20%E2%80%94%20feature%20request">
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <BottomSheet open={sheet === "news"} title="What's new" onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-3 pb-1">
          {CHANGELOG.map((c) => (
            <div key={c.version}>
              <p className="text-[13px] font-bold">
                {c.version} <span className="font-medium muted">· {c.date}</span>
              </p>
              <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-[13px] leading-[18px] muted">
                {c.lines.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "home"} title="Add to Home Screen" onClose={() => setSheet(null)} primary={{ label: "Got it", onClick: () => setSheet(null) }}>
        <p className="text-[15px] leading-relaxed">On iPhone, open this in Safari, tap Share, then &ldquo;Add to Home Screen&rdquo;. Locked In then runs full-screen, like the Android app.</p>
      </BottomSheet>
    </div>
  );
}

/**
 * "Locked In web 2.1 · Check for updates". iPhone users have no APK, so this is how they learn
 * what changed: /api/version says what the server is running; if it is newer than the build this
 * page loaded with (<meta name="app-version">), we reload.
 */
function VersionRow() {
  const [state, setState] = useState<"idle" | "checking" | "current" | "newer" | "error">("idle");
  const [server, setServer] = useState<string | null>(null);
  const loaded = typeof document !== "undefined" ? document.querySelector('meta[name="app-version"]')?.getAttribute("content") ?? APP_VERSION : APP_VERSION;
  useEffect(() => {
    if (state !== "newer") return;
    const t = setTimeout(() => window.location.reload(), 900);
    return () => clearTimeout(t);
  }, [state]);
  async function check() {
    setState("checking");
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const j = (await res.json()) as { version: string };
      setServer(j.version);
      setState(compareVersions(j.version, loaded) > 0 ? "newer" : "current");
    } catch {
      setState("error");
    }
  }
  return (
    <SettingRow icon={<Refresh size={20} />} label={`Locked In web ${loaded}`} subtitle={state === "newer" ? `Version ${server} is live — reloading…` : state === "current" ? "You're on the latest build" : state === "error" ? "Couldn't reach the server" : "Tap to check for updates"} onClick={check}>
      <span className="text-[13px] font-semibold" style={{ color: state === "current" ? "var(--green)" : "var(--muted)" }}>
        {state === "checking" ? "Checking…" : state === "current" ? "Up to date" : state === "newer" ? "Updating" : "Check"}
      </span>
    </SettingRow>
  );
}

/** Inline-editable display name, shown as "Enter your name" while empty; the pencil saves. */
export function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [text, setText] = useState(name);
  const dirty = text.trim() !== name;
  return (
    <span className="flex items-center gap-1.5">
      <input
        className="min-w-0 flex-1 bg-transparent text-[17px] font-bold outline-none"
        style={{ border: 0, padding: 0, color: "var(--ink)" }}
        value={text}
        placeholder="Enter your name"
        maxLength={40}
        aria-label="Your name"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) onCommit(text.trim());
        }}
        onBlur={() => {
          if (dirty) onCommit(text.trim());
        }}
      />
      <button
        type="button"
        aria-label="Save name"
        disabled={!dirty}
        onClick={() => onCommit(text.trim())}
        className="hit press grid place-items-center"
        style={{ background: "none", border: 0, padding: 4, color: dirty ? "var(--green)" : "var(--muted)" }}
      >
        <Pencil size={16} />
      </button>
    </span>
  );
}
