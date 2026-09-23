"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import type { Gender, Profile } from "@/lib/types";
import SubPage from "./SubPage";
import { Ruler, Scale, Steps, Target } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, Rise, Segmented, SettingRow, fmt } from "./ui";

const GENDERS: Gender[] = ["male", "female", "other"];

const shortDob = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Everything the goal generator needs: weight, height, birthday, gender, step goal. */
export default function PersonalDetailsScreen({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [weight, setWeight] = useState(profile.weight_kg != null ? fmt(profile.weight_kg) : "");
  const [height, setHeight] = useState(profile.height_cm != null ? fmt(profile.height_cm) : "");
  const [dob, setDob] = useState(profile.dob ?? "");
  const [gender, setGender] = useState<Gender | null>(profile.gender);
  const [steps, setSteps] = useState(String(profile.step_goal));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edited = (): Partial<Profile> => ({
    weight_kg: weight ? Number(weight) || null : null,
    height_cm: height ? Number(height) || null : null,
    dob: dob || null,
    gender,
    step_goal: Math.min(100_000, Math.max(500, Number(steps) || 8000)),
  });
  const e = edited();
  const dirty =
    e.weight_kg !== profile.weight_kg || e.height_cm !== profile.height_cm || e.dob !== profile.dob || e.gender !== profile.gender || e.step_goal !== profile.step_goal;

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await saveProfile(edited());
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SubPage title="Personal details" back="/profile">
      {/* Goal weight headline, mirroring Cal AI's card at the top of this page. */}
      <Rise index={0}>
        <Card padding={20}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium muted">Goal weight</p>
              <p className="num mt-1 text-[34px] font-extrabold leading-9" style={{ letterSpacing: "-0.035em" }}>
                {profile.goal_weight_kg != null ? `${fmt(profile.goal_weight_kg)} kg` : "Not set"}
              </p>
              <p className="text-xs muted">
                {profile.goal_type.charAt(0).toUpperCase() + profile.goal_type.slice(1)} · {fmt(profile.goal_speed_kg_wk)} kg/week
              </p>
            </div>
            <PillButton onClick={() => router.push("/profile/goal")} height={40} className="text-[13px]" style={{ width: 128, minHeight: 40 }}>
              Change Goal
            </PillButton>
          </div>
        </Card>
      </Rise>

      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Scale size={20} />} label="Current weight">
              <NumberField value={weight} onChange={setWeight} unit="kg" label="Current weight in kilograms" decimal />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Ruler size={20} />} label="Height">
              <NumberField value={height} onChange={setHeight} unit="cm" label="Height in centimetres" decimal />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Target size={20} />} label="Date of birth">
              <label className="relative inline-flex items-center">
                <span className="text-sm font-semibold" style={{ color: dob ? "var(--ink)" : "var(--muted)" }}>
                  {dob ? shortDob(dob) : "Set"}
                </span>
                <input
                  type="date"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={dob}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1906-01-01"
                  onChange={(ev) => setDob(ev.target.value)}
                  aria-label="Date of birth"
                />
              </label>
            </SettingRow>
            <Hair />
            <div className="py-3">
              <p className="text-[15px] font-medium">Gender</p>
              <div className="mt-2">
                <Segmented
                  options={["Male", "Female", "Other"]}
                  selected={Math.max(0, gender ? GENDERS.indexOf(gender) : 0)}
                  onSelect={(i) => setGender(GENDERS[i])}
                  label="Gender"
                />
              </div>
              {gender === null ? <p className="mt-1.5 text-[11px] muted">Used only for the BMR formula.</p> : null}
            </div>
            <Hair />
            <SettingRow icon={<Steps size={20} />} tint="var(--green)" label="Daily step goal">
              <NumberField value={steps} onChange={(v) => setSteps(v.slice(0, 6))} unit="steps" label="Daily step goal" />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <ErrorNote text={error} />
      </Rise>
      <Rise index={2}>
        <PillButton onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save details"}
        </PillButton>
      </Rise>
    </SubPage>
  );
}
