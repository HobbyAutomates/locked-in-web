"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { generate, missing } from "@/lib/goals";
import { carbTargetG, fatTargetG, type Profile } from "@/lib/types";
import SubPage from "./SubPage";
import { Card, ErrorNote, Hair, NumberField, PillButton, Ring, Rise, fmt } from "./ui";

const clamp = (s: string, lo: number, hi: number, fallback: number) => {
  const v = Number(s);
  return s && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

/** Four editable macro goals plus the "✨ Auto Generate Goals" shortcut. */
export default function NutritionGoalsScreen({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [calories, setCalories] = useState(String(profile.calorie_target));
  const [protein, setProtein] = useState(String(profile.protein_target_g));
  const [carbs, setCarbs] = useState(String(carbTargetG(profile)));
  const [fat, setFat] = useState(String(fatTargetG(profile)));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gaps = missing(profile);

  const edited = (): Partial<Profile> => ({
    calorie_target: clamp(calories, 800, 10_000, profile.calorie_target),
    protein_target_g: clamp(protein, 10, 500, profile.protein_target_g),
    carb_target_g: carbs ? clamp(carbs, 0, 1000, carbTargetG(profile)) : null,
    fat_target_g: fat ? clamp(fat, 0, 500, fatTargetG(profile)) : null,
  });
  const e = edited();
  const dirty = e.calorie_target !== profile.calorie_target || e.protein_target_g !== profile.protein_target_g || e.carb_target_g !== profile.carb_target_g || e.fat_target_g !== profile.fat_target_g;

  function autoGenerate() {
    if (gaps.length) {
      setNote(`Add your ${gaps.join(", ")} in Personal details first.`);
      return;
    }
    const t = generate(profile);
    if (!t) return;
    setCalories(String(t.calories));
    setProtein(String(t.protein));
    setCarbs(String(t.carbs));
    setFat(String(t.fat));
    setNote("Generated — review, then Save goals.");
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    setNote(null);
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

  const generated = note?.startsWith("Generated");

  return (
    <SubPage title="Edit nutrition goals" back="/profile">
      <Rise index={0}>
        <Card padding={0}>
          <div className="px-4">
            <GoalRow label="Calorie goal" color="var(--ink)" value={calories} unit="kcal" onChange={(v) => setCalories(v.slice(0, 5))} />
            <Hair />
            <GoalRow label="Protein goal" color="var(--red)" value={protein} unit="g" onChange={(v) => setProtein(v.slice(0, 4))} />
            <Hair />
            <GoalRow label="Carb goal" color="var(--orange)" value={carbs} unit="g" onChange={(v) => setCarbs(v.slice(0, 4))} />
            <Hair />
            <GoalRow label="Fat goal" color="var(--blue)" value={fat} unit="g" onChange={(v) => setFat(v.slice(0, 4))} />
          </div>
        </Card>
      </Rise>

      <Rise index={1}>
        <Card>
          <p className="text-[15px] font-bold">Auto Generate Goals</p>
          <p className="mt-1 text-xs leading-[17px] muted">
            Mifflin-St Jeor from your weight, height, age and gender, adjusted for {profile.goal_type} at {fmt(profile.goal_speed_kg_wk)} kg/week. Protein 1.8 g/kg, fat a quarter of your
            calories, carbs the rest.
          </p>
          <div className="mt-3">
            <PillButton onClick={autoGenerate} height={46}>
              <SparkleIcon />
              Auto Generate Goals
            </PillButton>
          </div>
          {note ? (
            <>
              <p className="mt-2.5 text-xs font-semibold" style={{ color: generated ? "var(--green)" : "var(--orange)" }}>
                {note}
              </p>
              {!generated ? (
                <div className="mt-2">
                  <PillButton soft height={42} onClick={() => router.push("/profile/details")}>
                    Open Personal details
                  </PillButton>
                </div>
              ) : null}
            </>
          ) : null}
        </Card>
      </Rise>

      <Rise index={2}>
        <ErrorNote text={error} />
      </Rise>
      <Rise index={2}>
        <PillButton onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save goals"}
        </PillButton>
      </Rise>
    </SubPage>
  );
}

/** A coloured ring icon, the goal's name, and its editable number. */
function GoalRow({ label, color, value, unit, onChange }: { label: string; color: string; value: string; unit: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[11px]">
      <span className="flex items-center gap-3">
        <Ring fraction={1} color={color} size={28} stroke={4}>
          <span className="rounded-full" style={{ width: 7, height: 7, background: color }} />
        </Ring>
        <span className="text-[15px] font-medium">{label}</span>
      </span>
      <NumberField value={value} onChange={onChange} unit={unit} label={label} />
    </div>
  );
}

/** Four-point sparkle, the "✨" of the Android button without the emoji. */
function SparkleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2l1.8 5.6L19.5 9.4l-5.7 1.8L12 16.8l-1.8-5.6L4.5 9.4l5.7-1.8zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.9 1.9.7-1.9.7L5 20.2l-.7-1.9-1.9-.7 1.9-.7z" />
    </svg>
  );
}
