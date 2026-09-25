"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { ageFrom, type Gender, type Profile } from "@/lib/types";
import { nameFromEmail } from "@/lib/display";
import { effectiveGoal, isTeen } from "@/lib/goals";
import SubPage from "./SubPage";
import { CalendarIcon, Glass, Person, Ruler, Scale, Steps } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, Rise, Segmented, SettingRow, fmt } from "./ui";

const GENDERS: Gender[] = ["male", "female", "other"];

const shortDob = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Name plus everything the goal generator needs: weight, height, birthday, gender, step goal. */
export default function PersonalDetailsScreen({ profile, email = "" }: { profile: Profile; email?: string }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [weight, setWeight] = useState(profile.weight_kg != null ? fmt(profile.weight_kg) : "");
  const [height, setHeight] = useState(profile.height_cm != null ? fmt(profile.height_cm) : "");
  const [dob, setDob] = useState(profile.dob ?? "");
  const [gender, setGender] = useState<Gender | null>(profile.gender);
  const [steps, setSteps] = useState(String(profile.step_goal));
  const [water, setWater] = useState(String(profile.water_goal_ml));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edited = (): Partial<Profile> => ({
    name: name.trim().slice(0, 40),
    weight_kg: weight ? Number(weight) || null : null,
    height_cm: height ? Number(height) || null : null,
    dob: dob || null,
    gender,
    step_goal: Math.min(100_000, Math.max(500, Number(steps) || 8000)),
    water_goal_ml: Math.min(8000, Math.max(250, Number(water) || 2500)),
  });
  const e = edited();
  const dirty =
    e.name !== profile.name.trim() ||
    e.weight_kg !== profile.weight_kg || e.height_cm !== profile.height_cm || e.dob !== profile.dob || e.gender !== profile.gender || e.step_goal !== profile.step_goal || e.water_goal_ml !== profile.water_goal_ml;

  const age = ageFrom(dob || null);

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
                {isTeen(ageFrom(profile.dob))
                  ? effectiveGoal(profile.goal_type, ageFrom(profile.dob)) === "gain"
                    ? "Gain / build muscle"
                    : "Maintain / grow stronger"
                  : `${profile.goal_type.charAt(0).toUpperCase() + profile.goal_type.slice(1)} · ${fmt(profile.goal_speed_kg_wk)} kg/week`}
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
            <SettingRow icon={<Person size={20} />} label="Name">
              <input
                className="min-w-0 rounded-[10px] px-2.5 py-1.5 text-right text-[15px] font-semibold outline-none"
                style={{ background: "var(--card2)", border: 0, color: "var(--ink)", width: 170 }}
                value={name}
                maxLength={40}
                placeholder={nameFromEmail(email) || "Your name"}
                autoComplete="name"
                aria-label="Your name"
                onChange={(ev) => setName(ev.target.value)}
              />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Scale size={20} />} label="Current weight">
              <NumberField value={weight} onChange={setWeight} unit="kg" label="Current weight in kilograms" decimal />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Ruler size={20} />} label="Height">
              <NumberField value={height} onChange={setHeight} unit="cm" label="Height in centimetres" decimal />
            </SettingRow>
            <Hair />
            <SettingRow icon={<CalendarIcon size={20} />} label="Date of birth" subtitle={age != null ? `${age} yrs` : undefined}>
              <label className="relative inline-flex items-center rounded-[10px] px-2.5 py-1.5" style={{ background: "var(--card2)" }}>
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
            <Hair />
            <SettingRow icon={<Glass size={20} />} tint="var(--blue)" label="Daily water goal" subtitle="1 glass = 250 mL">
              <NumberField value={water} onChange={(v) => setWater(v.slice(0, 4))} unit="mL" label="Daily water goal in millilitres" />
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
