"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { ageYears, applyTo, edFlags, effectiveGoal, goalOptions, isTeen, missing, roundSpeed, screenInput, speedMax, type EdFlag } from "@/lib/goals";
import { recordEdit } from "@/lib/targetEdits";
import type { GoalType, Profile, WeightEntry } from "@/lib/types";
import GoalSpeedPicker from "./GoalSpeedPicker";
import { BmiCard, SafetyNote, TeenGoalMigration, TeenNote } from "./Science";
import SubPage from "./SubPage";
import { Scale, Target } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, Rise, Segmented, SettingRow, Toggle, fmt } from "./ui";

/**
 * Lose / Maintain / Gain, the two weights, and how fast to get there. v2.10: the goal choices
 * follow age (no "lose" under 18), the pace slider stops at the safe max for this body weight,
 * the BMI card sits underneath, and a safety flag shows a kind note without blocking the save.
 */
export default function GoalWeightScreen({ profile, weights = [] }: { profile: Profile; weights?: WeightEntry[] }) {
  const router = useRouter();
  const age = ageYears(profile.dob);
  const teen = isTeen(age);
  const options = goalOptions(age);
  const [goalType, setGoalType] = useState<GoalType>(effectiveGoal(profile.goal_type, age));
  const [current, setCurrent] = useState(profile.weight_kg != null ? fmt(profile.weight_kg) : "");
  const [goal, setGoal] = useState(profile.goal_weight_kg != null ? fmt(profile.goal_weight_kg) : "");
  const [speed, setSpeed] = useState(roundSpeed(profile.goal_speed_kg_wk || 0.5, speedMax(profile.goal_type, profile.weight_kg)));
  const [regenerate, setRegenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<EdFlag[]>([]);
  const gaps = missing(profile);
  const maintaining = goalType === "maintain";
  const kgNow = current ? Number(current) || profile.weight_kg : profile.weight_kg;
  const max = speedMax(goalType, kgNow);

  const edited = (): Profile => ({
    ...profile,
    goal_type: goalType,
    weight_kg: kgNow,
    // Teens don't set a target weight; whatever was saved before stays untouched.
    goal_weight_kg: teen ? profile.goal_weight_kg : goal ? Number(goal) || null : null,
    goal_speed_kg_wk: roundSpeed(speed, max),
  });
  const e = edited();
  const dirty = e.goal_type !== profile.goal_type || e.weight_kg !== profile.weight_kg || e.goal_weight_kg !== profile.goal_weight_kg || e.goal_speed_kg_wk !== profile.goal_speed_kg_wk;

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const next = regenerate ? applyTo(edited()) : edited();
      await saveProfile({
        goal_type: next.goal_type,
        weight_kg: next.weight_kg,
        goal_weight_kg: next.goal_weight_kg,
        goal_speed_kg_wk: next.goal_speed_kg_wk,
        ...(regenerate ? { calorie_target: next.calorie_target, protein_target_g: next.protein_target_g, carb_target_g: next.carb_target_g, fat_target_g: next.fat_target_g } : {}),
      });
      let edits = recordEdit("goal_weight", profile.goal_weight_kg, next.goal_weight_kg);
      if (regenerate) edits = recordEdit("calories", profile.calorie_target, next.calorie_target);
      setFlags(edFlags(screenInput(next, { weights: weights.map((w) => ({ date: w.date, kg: w.weight_kg })), edits })));
      setSaved(true);
      setRegenerate(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SubPage title="Goal & current weight" back="/profile">
      <TeenGoalMigration profile={profile} />

      <Rise index={0}>
        <Card>
          <p className="text-[13px] font-semibold muted">I want to</p>
          <div className="mt-2.5">
            <Segmented
              options={options.map((o) => o.label.split(" ")[0]) as [string, string] | [string, string, string]}
              selected={Math.max(0, options.findIndex((o) => o.key === goalType))}
              onSelect={(i) => setGoalType(options[i].key)}
              label="Goal"
            />
          </div>
          <p className="mt-2 text-xs muted">{options.find((o) => o.key === goalType)?.sub}</p>
          {teen ? (
            <div className="mt-2.5">
              <TeenNote />
            </div>
          ) : null}
        </Card>
      </Rise>

      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Scale size={20} />} label="Current weight">
              <NumberField value={current} onChange={setCurrent} unit="kg" label="Current weight in kilograms" decimal />
            </SettingRow>
            {teen ? null : (
              <>
                <Hair />
                <SettingRow icon={<Target size={20} />} label="Goal weight">
                  <NumberField value={goal} onChange={setGoal} unit="kg" label="Goal weight in kilograms" decimal />
                </SettingRow>
              </>
            )}
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <Card>
          {teen ? (
            <>
              <p className="text-[15px] font-bold">Your pace</p>
              <p className="mt-0.5 text-xs leading-[17px] muted">
                {goalType === "gain" ? "We add a small extra (about 10%) on top of what your body needs to grow and train. No speed to pick." : "Your calories match what your body needs to grow and train."}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold">{maintaining ? "Weekly pace" : "How fast?"}</p>
              <p className="mt-0.5 text-xs muted">{maintaining ? "Only used if you switch to lose or gain." : "Changes how many calories we add or subtract each day."}</p>
              <div className="mt-3.5">
                <GoalSpeedPicker speed={speed} onChange={setSpeed} goal={maintaining ? "lose" : goalType} weightKg={kgNow} />
              </div>
            </>
          )}
        </Card>
      </Rise>

      <Rise index={3}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow label="Update goals too" subtitle={gaps.length === 0 ? "Recalculate calories and macros on save" : `Needs ${gaps.join(", ")}`}>
              <Toggle on={regenerate} onChange={setRegenerate} label="Update goals too" disabled={gaps.length > 0} />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={4}>
        <ErrorNote text={error} />
      </Rise>
      <Rise index={4}>
        <PillButton onClick={save} disabled={busy || !(dirty || regenerate)}>
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save goal"}
        </PillButton>
      </Rise>

      {flags.length ? (
        <Rise index={5}>
          <SafetyNote flags={flags} onClose={() => setFlags([])} />
        </Rise>
      ) : null}

      <Rise index={5}>
        <BmiCard profile={profile} weightKg={profile.weight_kg} waist />
      </Rise>
    </SubPage>
  );
}
