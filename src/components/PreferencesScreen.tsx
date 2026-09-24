"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile, signOut } from "@/lib/actions";
import { onCount } from "@/lib/reminders";
import { THEME_MODES, setThemeMode, useThemeMode, type ThemeMode } from "@/lib/theme";
import { LENS_DEFAULTS, type LensDefault, type Profile, type Units } from "@/lib/types";
import { displayName } from "@/lib/display";
import type { PrefSection } from "@/lib/preferences";
import { Bell, Check, Exit, Flame, Glass, Lock, Mail, Moon, Person, Refresh, Scale, Scan, Share, Steps, Target, Trash } from "./icons";
import { NameField } from "./ProfileScreen";
import SubPage from "./SubPage";
import { BottomSheet, Card, Chevron, ErrorNote, Hair, PillSwitch, Rise, SettingRow, Toggle } from "./ui";


const TITLES: Record<PrefSection, string> = { appearance: "Appearance", tracking: "Tracking", privacy: "Privacy", account: "Account" };
const DELETE_MAIL = "mailto:sohumai.team@gmail.com?subject=Delete%20my%20Locked%20In%20data&body=Please%20delete%20my%20Locked%20In%20account%20and%20all%20my%20data.%20Account%20email%3A%20";

/**
 * v2.4 Preferences: one list of categories (Appearance, Tracking, Reminders, Privacy, Account),
 * each opening its own page — one screen per level, Cal AI style. `section` null is the list.
 */
export default function PreferencesScreen({ profile, email, section }: { profile: Profile; email: string; section: PrefSection | null }) {
  if (!section) return <PreferencesIndex profile={profile} />;
  return (
    <SubPage title={TITLES[section]} back="/profile/preferences">
      {section === "appearance" ? <Appearance /> : section === "tracking" ? <Tracking profile={profile} /> : section === "privacy" ? <Privacy profile={profile} /> : <Account profile={profile} email={email} />}
    </SubPage>
  );
}

function PreferencesIndex({ profile }: { profile: Profile }) {
  const theme = useThemeMode();
  const remindersOn = onCount(profile.reminders);
  return (
    <SubPage title="Preferences" back="/profile">
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Moon size={20} />} label="Appearance" subtitle="Theme and ring colours" href="/profile/preferences/appearance">
              <span className="flex items-center gap-1 text-[13px] muted">
                {theme}
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Target size={20} />} label="Tracking" subtitle="Water, steps, calorie rules, scans, units" href="/profile/preferences/tracking">
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Bell size={20} />} label="Reminders" subtitle="Meal-time nudges" href="/profile/reminders">
              <span className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: remindersOn ? "var(--green)" : "var(--muted)" }}>
                {remindersOn === 0 ? "Off" : `${remindersOn} on`}
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Lock size={20} />} label="Privacy" subtitle="What your squads see" href="/profile/preferences/privacy">
              <span className="flex items-center gap-1 text-[13px] muted">
                {profile.share_stats ? "Stats" : "Streaks"}
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Person size={20} />} label="Account" subtitle="Email, name, sign out" href="/profile/preferences/account">
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>
    </SubPage>
  );
}

/** Save a profile patch, then refresh the server data; errors show on the page. */
function useSave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function save(patch: Partial<Profile>) {
    setError(null);
    try {
      await saveProfile(patch);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that");
    }
  }
  return { save, error };
}

// ---- Appearance ----

function Appearance() {
  const theme = useThemeMode();
  return (
    <>
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Moon size={20} />} label="Theme">
              <PillSwitch options={[...THEME_MODES]} value={theme} onChange={(v) => setThemeMode(v as ThemeMode)} label="Theme" />
            </SettingRow>
          </div>
        </Card>
      </Rise>
      <Rise index={1}>
        <p className="px-1 text-xs font-semibold muted">Ring colours</p>
      </Rise>
      <Rise index={1}>
        <Card>
          <RingLegend />
        </Card>
      </Rise>
    </>
  );
}

/** The little legend behind every ring in the app. */
function RingLegend() {
  const rows: [string, string][] = [
    ["var(--ink)", "Calories — everything you ate today against your target"],
    ["var(--red)", "Protein — the macro that protects muscle on a cut"],
    ["var(--orange)", "Carbs — the remainder after protein and fat"],
    ["var(--blue)", "Fat — 25% of your calories by default"],
    ["var(--green)", "Green — a day you trained, and active minutes on Home"],
  ];
  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {rows.map(([c, label]) => (
        <li key={label} className="flex items-center gap-3 text-[14px] leading-[19px]">
          <span className="rounded-full" style={{ width: 14, height: 14, background: c, flex: "none" }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

// ---- Tracking ----

/** − value + stepper that saves a moment after the last tap. */
function Stepper({ value, step, min, max, format, label, onCommit }: { value: number; step: number; min: number; max: number; format: (v: number) => string; label: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  function bump(d: number) {
    const next = Math.min(max, Math.max(min, v + d));
    if (next === v) return;
    setV(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next), 600);
  }
  const btn = "press grid h-8 w-8 place-items-center rounded-full text-[17px] font-bold";
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" className={btn} style={{ background: "var(--card2)", color: "var(--ink)" }} aria-label={`Less ${label}`} disabled={v <= min} onClick={() => bump(-step)}>
        −
      </button>
      <span className="num min-w-[64px] text-center text-[14px] font-bold" aria-live="polite">
        {format(v)}
      </span>
      <button type="button" className={btn} style={{ background: "var(--card2)", color: "var(--ink)" }} aria-label={`More ${label}`} disabled={v >= max} onClick={() => bump(step)}>
        +
      </button>
    </span>
  );
}

function Tracking({ profile }: { profile: Profile }) {
  const { save, error } = useSave();
  const [sheet, setSheet] = useState(false);
  const [lens, setLens] = useState<LensDefault>(profile.lens_default);
  const [addBurned, setAddBurned] = useState(profile.add_burned_to_goal);
  const [rollover, setRollover] = useState(profile.rollover_calories);
  const [units, setUnits] = useState<Units>(profile.units);
  const lensLabel = LENS_DEFAULTS.find((l) => l.key === lens)?.label ?? "Protein";
  return (
    <>
      <ErrorNote text={error} />
      <Rise index={0}>
        <p className="px-1 text-xs font-semibold muted">Daily goals</p>
      </Rise>
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Glass size={20} />} tint="var(--blue)" label="Water goal">
              <Stepper value={profile.water_goal_ml} step={250} min={500} max={6000} label="water" format={(v) => (v >= 1000 ? `${+(v / 1000).toFixed(2)} L` : `${v} ml`)} onCommit={(v) => void save({ water_goal_ml: v })} />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Steps size={20} />} tint="var(--green)" label="Step goal">
              <Stepper value={profile.step_goal} step={1000} min={1000} max={30000} label="steps" format={(v) => `${+(v / 1000).toFixed(1)}k`} onCommit={(v) => void save({ step_goal: v })} />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={1}>
        <p className="px-1 text-xs font-semibold muted">Calories</p>
      </Rise>
      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Flame size={20} />} label="Add burned calories to goal" subtitle="Logged exercise raises that day's goal">
              <Toggle
                on={addBurned}
                onChange={(v) => {
                  setAddBurned(v);
                  void save({ add_burned_to_goal: v });
                }}
                label="Add burned calories to goal"
              />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Refresh size={20} />} label="Rollover calories" subtitle="Up to 200 left from yesterday carry over">
              <Toggle
                on={rollover}
                onChange={(v) => {
                  setRollover(v);
                  void save({ rollover_calories: v });
                }}
                label="Rollover calories"
              />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <p className="px-1 text-xs font-semibold muted">Scans and units</p>
      </Rise>
      <Rise index={2}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Scan size={20} />} label="Default lens" subtitle="What every scan report is judged for" onClick={() => setSheet(true)}>
              <span className="flex items-center gap-1 text-[13px] muted">
                {lensLabel}
                <Chevron />
              </span>
            </SettingRow>
            <Hair />
            <SettingRow icon={<Scale size={20} />} label="Weight units" subtitle="How weights are shown">
              <PillSwitch
                options={["kg", "lb"]}
                value={units === "imperial" ? "lb" : "kg"}
                onChange={(v) => {
                  const u: Units = v === "lb" ? "imperial" : "metric";
                  setUnits(u);
                  void save({ units: u });
                }}
                label="Weight units"
              />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <BottomSheet open={sheet} title="Default lens" subtitle="The lens every scan report opens on. My goal follows Lose → Cutting, Gain → Bulking." onClose={() => setSheet(false)}>
        <div className="flex flex-col">
          {LENS_DEFAULTS.map((l, i) => {
            const sel = lens === l.key;
            return (
              <div key={l.key}>
                {i > 0 ? <Hair /> : null}
                <button
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  className="press flex min-h-[50px] w-full items-center justify-between text-left text-[15px]"
                  style={{ fontWeight: sel ? 700 : 500 }}
                  onClick={() => {
                    setLens(l.key);
                    setSheet(false);
                    void save({ lens_default: l.key });
                  }}
                >
                  {l.label}
                  {sel ? <Check size={18} /> : null}
                </button>
              </div>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

// ---- Privacy ----

function Privacy({ profile }: { profile: Profile }) {
  const { save, error } = useSave();
  const [share, setShare] = useState(profile.share_stats);
  return (
    <>
      <ErrorNote text={error} />
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Share size={20} />} label="Share stats with squad" subtitle={share ? "Streaks + protein & calories" : "Streaks only"}>
              <Toggle
                on={share}
                onChange={(v) => {
                  setShare(v);
                  void save({ share_stats: v });
                }}
                label="Share stats with squad"
              />
            </SettingRow>
          </div>
        </Card>
      </Rise>
      <Rise index={1}>
        <p className="px-1 text-[13px] leading-relaxed muted">Your squads always see your name, photo and streak. With this on they also see today&apos;s protein and calories. Meals, photos, weight and scans are never shared.</p>
      </Rise>
    </>
  );
}

// ---- Account ----

function Account({ profile, email }: { profile: Profile; email: string }) {
  const { save, error } = useSave();
  return (
    <>
      <ErrorNote text={error} />
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <div className="flex min-h-[56px] flex-col justify-center py-2.5">
              <span className="text-[11px] font-semibold muted">Name</span>
              <NameField name={displayName(profile.name, email)} onCommit={(name) => void save({ name })} />
            </div>
            <Hair />
            <SettingRow icon={<Mail size={20} />} label="Email" subtitle={email || "—"}>
              <span />
            </SettingRow>
          </div>
        </Card>
      </Rise>
      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Exit size={20} />} label="Sign out" onClick={() => void signOut()}>
              <Chevron />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Trash size={20} />} tint="var(--red)" label="Delete my data" subtitle="Emails Sohum a request to erase your account" href={`${DELETE_MAIL}${encodeURIComponent(email)}`}>
              <Chevron />
            </SettingRow>
          </div>
        </Card>
      </Rise>
    </>
  );
}
