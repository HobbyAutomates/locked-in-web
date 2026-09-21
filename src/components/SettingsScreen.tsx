"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTargets, signOut } from "@/lib/actions";
import { THEME_MODES, setThemeMode, useThemeMode, type ThemeMode } from "@/lib/theme";
import type { Profile } from "@/lib/types";
import { Dumbbell, Exit, Flame, Moon, Share } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, PillSwitch, Rise, SettingRow } from "./ui";

export default function SettingsScreen({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const [weekly, setWeekly] = useState(String(profile.weekly_workout_target));
  const [protein, setProtein] = useState(String(profile.protein_target_g));
  const [calories, setCalories] = useState(String(profile.calorie_target));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useThemeMode();

  const dirty =
    weekly !== String(profile.weekly_workout_target) ||
    protein !== String(profile.protein_target_g) ||
    calories !== String(profile.calorie_target);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveTargets({
        weekly_workout_target: Number(weekly) || 3,
        protein_target_g: Number(protein) || 120,
        calorie_target: Number(calories) || 2200,
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <h1 className="screen-title">Settings</h1>
      </Rise>

      <Rise index={1}>
        <Card>
          <div className="flex items-center gap-3.5">
            <span className="grid h-13 w-13 place-items-center rounded-full text-xl font-bold" style={{ width: 52, height: 52, background: "var(--card2)" }}>
              {(email || "?").slice(0, 1).toUpperCase()}
            </span>
            <span>
              <span className="block text-[17px] font-bold">Sohum</span>
              <span className="block text-[13px] muted">{email || "—"}</span>
            </span>
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <Card padding={0}>
          <div className="px-4">
            <p className="pb-1 pt-3 text-[13px] font-semibold muted">Daily targets</p>
            <SettingRow icon={<Dumbbell size={20} />} label="Workouts per week">
              <NumberField value={weekly} onChange={setWeekly} unit="" label="Workouts per week" />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Flame size={20} />} tint="var(--red)" label="Protein">
              <NumberField value={protein} onChange={setProtein} unit="g" label="Protein target in grams" />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Flame size={20} />} label="Calories">
              <NumberField value={calories} onChange={setCalories} unit="kcal" label="Calorie target" />
            </SettingRow>
            <div className="pb-3">
              <ErrorNote text={error} />
            </div>
          </div>
        </Card>
      </Rise>

      {dirty || saved ? (
        <Rise index={2}>
          <PillButton onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save targets"}
          </PillButton>
        </Rise>
      ) : null}

      <Rise index={3}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Moon size={20} />} label="Appearance">
              <PillSwitch
                options={[...THEME_MODES]}
                value={theme}
                onChange={(v) => setThemeMode(v as ThemeMode)}
                label="Appearance"
              />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Exit size={20} />} label="Sign out" onClick={() => void signOut()}>
              <span className="text-base muted">›</span>
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={4}>
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
    </div>
  );
}
