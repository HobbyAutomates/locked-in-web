"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { saveProfile, signOut } from "@/lib/actions";
import { setBurnedBack, useBurnedBack } from "@/lib/prefs";
import { onCount } from "@/lib/reminders";
import { THEME_MODES, setThemeMode, useThemeMode, type ThemeMode } from "@/lib/theme";
import { LENS_DEFAULTS, ageFrom, type LensDefault, type Profile } from "@/lib/types";
import { APP_VERSION, CHANGELOG, compareVersions } from "@/lib/version";
import { Bell, Exit, Flame, Mail, Moon, Palette, Pencil, Person, Refresh, Scale, Scan, Share, Sparkle, Target, Tune } from "./icons";
import { Card, Chevron, ErrorNote, GroupLabel, Hair, PillButton, PillSwitch, Rise, SettingRow, Toggle, fmt } from "./ui";

const APK_URL = "https://evizkfvltacrfngsgbuu.supabase.co/storage/v1/object/public/app/LockedIn-12.apk";
const WEB_URL = "https://web-production-ff1cf.up.railway.app";
const INVITE_TEXT = `Locked In — workouts, meals by voice, label scanner. Android: ${APK_URL} · iPhone: ${WEB_URL} (Safari → Add to Home Screen)`;

/**
 * The Profile tab, laid out like Cal AI's: identity card, invite banner, then Account,
 * Goals & Tracking and Support groups. Every row either edits in place or pushes a page.
 */
export default function ProfileScreen({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const [showRings, setShowRings] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = useThemeMode();
  const burnedBack = useBurnedBack();
  const age = ageFrom(profile.dob);
  const remindersOn = onCount(profile.reminders);
  const [lensDefault, setLensDefault] = useState<LensDefault>(profile.lens_default);
  const [shareStats, setShareStats] = useState(profile.share_stats);

  async function savePref(patch: Partial<Profile>) {
    setError(null);
    try {
      await saveProfile(patch);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that");
    }
  }

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
      <Rise index={1}>
        <ErrorNote text={error} />
      </Rise>

      {/* ---- identity ---- */}
      <Rise index={1}>
        <Card>
          <div className="flex items-center gap-3.5">
            <span className="grid place-items-center rounded-full text-[22px] font-bold" style={{ width: 56, height: 56, background: "var(--card2)", flex: "none" }}>
              {(profile.name || email || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <NameField name={profile.name} onCommit={saveName} />
              <span className="text-[13px] muted">{age != null ? `${age} years old` : email || "—"}</span>
            </span>
          </div>
        </Card>
      </Rise>

      {/* ---- invite ---- */}
      <Rise index={2}>
        <button type="button" onClick={invite} className="card press flex w-full items-center gap-3 text-left" aria-label="Invite friends">
          <span className="grid place-items-center rounded-xl" style={{ width: 42, height: 42, background: "var(--orange-bg)", color: "var(--orange)", flex: "none" }}>
            <Share size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-bold">Invite friends</span>
            <span className="text-xs muted">Send them the app — Android APK or the iPhone web app</span>
          </span>
          <Chevron />
        </button>
        {invited ? <p className="mt-2 break-all px-1 text-xs muted">{invited}</p> : null}
      </Rise>

      {/* ---- account ---- */}
      <Rise index={3}>
        <GroupLabel>Account</GroupLabel>
      </Rise>
      <Rise index={3}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Person size={20} />} label="Personal details" href="/profile/details">
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Tune size={20} />} label="Preferences" subtitle="Appearance, scans, burned calories, groups">
              <span />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Moon size={20} />} label="Appearance">
              <PillSwitch options={[...THEME_MODES]} value={theme} onChange={(v) => setThemeMode(v as ThemeMode)} label="Appearance" />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Flame size={20} />} label="Add burned calories back" subtitle="Exercise you log raises today's calorie budget">
              <Toggle on={burnedBack} onChange={setBurnedBack} label="Add burned calories back" />
            </SettingRow>
            <Hair />
            <div className="py-3">
              <p className="flex items-center gap-2.5 text-[15px] font-medium">
                <Scan size={20} />
                Judge scans for
              </p>
              <p className="mt-0.5 pl-[30px] text-[11px] muted">The lens every scan report opens on. &ldquo;My goal&rdquo; follows Lose → Cutting, Gain → Bulking.</p>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-[30px]">
                {LENS_DEFAULTS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    aria-pressed={lensDefault === l.key}
                    className="chip press"
                    style={{ height: 32, fontSize: 12 }}
                    onClick={() => {
                      setLensDefault(l.key);
                      void savePref({ lens_default: l.key });
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <Hair />
            <SettingRow icon={<Share size={20} />} label="Share with squads" subtitle={`${shareStats ? "Streaks + protein & calories" : "Streaks only"} · what squad-mates see`}>
              <Toggle
                on={shareStats}
                onChange={(v) => {
                  setShareStats(v);
                  void savePref({ share_stats: v });
                }}
                label="Share with groups"
              />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      {/* ---- goals & tracking ---- */}
      <Rise index={4}>
        <GroupLabel>Goals &amp; tracking</GroupLabel>
      </Rise>
      <Rise index={4}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Target size={20} />} label="Edit Nutrition Goals" href="/profile/goals">
              <span className="text-[13px] muted">{profile.calorie_target} kcal</span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Flame size={20} />} tint="var(--flame)" label="Goal & current weight" href="/profile/goal">
              <span className="text-[13px] muted">{profile.goal_type.charAt(0).toUpperCase() + profile.goal_type.slice(1)}</span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Bell size={20} />} label="Tracking Reminders" href="/profile/reminders">
              <span className="text-[13px] font-semibold" style={{ color: remindersOn ? "var(--green)" : "var(--muted)" }}>
                {remindersOn === 0 ? "Off" : `${remindersOn} on`}
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Scale size={20} />} label="Weight history" href="/profile/weight">
              <span className="text-[13px] muted">{profile.weight_kg != null ? `${fmt(profile.weight_kg)} kg` : "—"}</span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Palette size={20} />} label="Ring colours explained" onClick={() => setShowRings(true)}>
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      {/* ---- support ---- */}
      <Rise index={5}>
        <GroupLabel>Support</GroupLabel>
      </Rise>
      <Rise index={5}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Mail size={20} />} label="Request a feature" href="mailto:sohumai.team@gmail.com?subject=Locked%20In%20%E2%80%94%20feature%20request">
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Exit size={20} />} tint="var(--red)" label="Sign out" onClick={() => void signOut()}>
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={6}>
        <AppCard />
      </Rise>

      <Rise index={6}>
        <Card>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Share size={18} />
            Add to Home Screen
          </p>
          <p className="mt-1 text-[13px] muted">
            On iPhone, open this in Safari, tap Share, then &ldquo;Add to Home Screen&rdquo;. Locked In then runs full-screen, like the Android app.
          </p>
        </Card>
      </Rise>

      <AnimatePresence>{showRings ? <RingColoursDialog onClose={() => setShowRings(false)} /> : null}</AnimatePresence>
    </div>
  );
}

/**
 * "Locked In web 1.9 · Check for updates" plus the What's new list. iPhone users have no APK, so
 * this is how they learn what changed: /api/version says what the server is running; if it is
 * newer than the build this page loaded with (<meta name="app-version">), we reload.
 */
function AppCard() {
  const [state, setState] = useState<"idle" | "checking" | "current" | "newer" | "error">("idle");
  const [server, setServer] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
    <Card padding={0}>
      <div className="px-4">
        <SettingRow icon={<Refresh size={20} />} label={`Locked In web ${loaded}`} subtitle={state === "newer" ? `Version ${server} is live — reloading…` : state === "current" ? "You're on the latest build" : state === "error" ? "Couldn't reach the server" : "Tap to check for a newer build"} onClick={check}>
          <span className="text-[13px] font-semibold" style={{ color: state === "current" ? "var(--green)" : "var(--muted)" }}>
            {state === "checking" ? "Checking…" : state === "current" ? "Up to date" : state === "newer" ? "Updating" : "Check for updates"}
          </span>
        </SettingRow>
        <Hair />
        <SettingRow icon={<Sparkle size={20} />} label="What's new" subtitle={`${CHANGELOG[0]?.version ?? APP_VERSION} · ${CHANGELOG.length} releases`} onClick={() => setOpen((o) => !o)}>
          <span className="text-[13px] font-semibold muted">{open ? "Hide" : "Show"}</span>
        </SettingRow>
        {open ? (
          <div className="flex flex-col gap-3 pb-4 pt-1">
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
        ) : null}
      </div>
    </Card>
  );
}

/** Inline-editable display name, shown as "Enter your name" while empty; the pencil saves. */
function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
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
        className="press grid place-items-center"
        style={{ background: "none", border: 0, padding: 4, color: dirty ? "var(--green)" : "var(--muted)" }}
      >
        <Pencil size={16} />
      </button>
    </span>
  );
}

/** The little legend behind every ring in the app. */
function RingColoursDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["var(--ink)", "Calories — everything you ate today against your target"],
    ["var(--red)", "Protein — the macro that protects muscle on a cut"],
    ["var(--orange)", "Carbs — the remainder after protein and fat"],
    ["var(--blue)", "Fat — 25% of your calories by default"],
    ["var(--green)", "Green — a day you trained, on the week strip and calendar"],
  ];
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center px-6"
      style={{ background: "rgba(0,0,0,0.45)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Ring colours"
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-[360px]"
        style={{ background: "var(--card)", borderRadius: 28, padding: 24 }}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-extrabold">Ring colours</h2>
        <p className="mt-1 text-[13px] muted">What each ring on the home screen is counting.</p>
        <ul className="mt-4 flex list-none flex-col gap-3 p-0">
          {rows.map(([c, label]) => (
            <li key={label} className="flex items-center gap-3 text-[13px] leading-[18px]">
              <span className="rounded-full" style={{ width: 14, height: 14, background: c, flex: "none" }} />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <PillButton onClick={onClose}>Got it</PillButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
