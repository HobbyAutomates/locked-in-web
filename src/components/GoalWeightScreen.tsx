"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { applyTo, missing, roundSpeed } from "@/lib/goals";
import type { GoalType, Profile } from "@/lib/types";
import GoalSpeedPicker from "./GoalSpeedPicker";
import SubPage from "./SubPage";
import { Scale, Target } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, Rise, Segmented, SettingRow, Toggle, fmt } from "./ui";

const GOAL_TYPES: GoalType[] = ["lose", "maintain", "gain"];

/** Lose / Maintain / Gain, the two weights, and how fast to get there. */
export default function GoalWeightScreen({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [goalType, setGoalType] = useState<GoalType>(profile.goal_type);
  const [current, setCurrent] = useState(profile.weight_kg != null ? fmt(profile.weight_kg) : "");
  const [goal, setGoal] = useState(profile.goal_weight_kg != null ? fmt(profile.goal_weight_kg) : "");
  const [speed, setSpeed] = useState(roundSpeed(profile.goal_speed_kg_wk || 0.5));
  const [regenerate, setRegenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gaps = missing(profile);
  const maintaining = goalType === "maintain";

  const edited = (): Profile => ({
    ...profile,
    goal_type: goalType,
    weight_kg: current ? Number(current) || profile.weight_kg : profile.weight_kg,
    goal_weight_kg: goal ? Number(goal) || null : null,
    goal_speed_kg_wk: roundSpeed(speed),
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
      <Rise index={0}>
        <Card>
          <p className="text-[13px] font-semibold muted">I want to</p>
          <div className="mt-2.5">
            <Segmented options={["Lose", "Maintain", "Gain"]} selected={Math.max(0, GOAL_TYPES.indexOf(goalType))} onSelect={(i) => setGoalType(GOAL_TYPES[i])} label="Goal" />
          </div>
        </Card>
      </Rise>

      <Rise index={1}>
        <Card padding={0}>
          <div className="px-4">
            <SettingRow icon={<Scale size={20} />} label="Current weight">
              <NumberField value={current} onChange={setCurrent} unit="kg" label="Current weight in kilograms" decimal />
            </SettingRow>
            <Hair />
            <SettingRow icon={<Target size={20} />} label="Goal weight">
              <NumberField value={goal} onChange={setGoal} unit="kg" label="Goal weight in kilograms" decimal />
            </SettingRow>
          </div>
        </Card>
      </Rise>

      <Rise index={2}>
        <Card>
          <p className="text-[15px] font-bold">{maintaining ? "Weekly pace" : "How fast?"}</p>
          <p className="mt-0.5 text-xs muted">{maintaining ? "Only used if you switch to lose or gain." : "Changes how many calories we add or subtract each day."}</p>
          <div className="mt-3.5">
            <GoalSpeedPicker speed={speed} onChange={setSpeed} />
          </div>
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
    </SubPage>
  );
}
