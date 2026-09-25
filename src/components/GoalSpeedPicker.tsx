"use client";

import { roundSpeed, speedLabel, speedMax, speedWhy } from "@/lib/goals";
import type { GoalType } from "@/lib/types";
import { Cheetah, Rabbit, Sloth } from "./icons";
import { ScienceButton } from "./Science";
import { fmt } from "./ui";

/**
 * The weekly pace control: sloth / rabbit / cheetah above a notched slider, the big number and a
 * "Slow and steady / Recommended / Max safe pace" chip, then the one-line why and the ⓘ sheet.
 * v2.10: the slider only reaches this person's safe max — 1 % of body weight a week for loss
 * (never over 1 kg), 0.5 % for gain. Shared by Goal & current weight and onboarding (GoalSpeed.kt).
 */
export default function GoalSpeedPicker({ speed, onChange, goal, weightKg }: { speed: number; onChange: (v: number) => void; goal: GoalType; weightKg: number | null }) {
  const max = speedMax(goal, weightKg);
  const kg = roundSpeed(speed, max);
  const label = speedLabel(kg, max);
  const tint = label === "Max safe pace" ? "var(--orange)" : "var(--green)";
  const tintBg = label === "Max safe pace" ? "var(--orange-bg)" : "var(--green-bg)";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <Animal active={label === "Slow and steady"} color="var(--green)" bg="var(--green-bg)" label="Slow and steady">
          <Sloth size={26} />
        </Animal>
        <Animal active={label === "Recommended"} color="var(--green)" bg="var(--green-bg)" label="Recommended">
          <Rabbit size={26} />
        </Animal>
        <Animal active={label === "Max safe pace"} color="var(--orange)" bg="var(--orange-bg)" label="Max safe pace">
          <Cheetah size={26} />
        </Animal>
      </div>
      <input
        type="range"
        className="range mt-3"
        min={0.1}
        max={max}
        step={0.1}
        value={kg}
        disabled={max <= 0.1}
        onChange={(e) => onChange(roundSpeed(Number(e.target.value), max))}
        aria-label="Weekly pace in kilograms"
        aria-valuetext={`${fmt(kg)} kg per week, ${label}`}
      />
      <div className="flex justify-between text-[11px] muted">
        <span>0.1 kg</span>
        <span>{fmt(max)} kg</span>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="num text-xl font-extrabold" style={{ letterSpacing: "-0.03em" }}>
          {fmt(kg)} kg / week
        </span>
        <span className="badge" style={{ background: tintBg, color: tint }}>
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <p className="text-xs leading-[17px] muted">{speedWhy(goal, weightKg)}</p>
        <ScienceButton />
      </div>
    </div>
  );
}

/** One of the three pace animals; the active band lights up in its colour. */
function Animal({ active, color, bg, label, children }: { active: boolean; color: string; bg: string; label: string; children: React.ReactNode }) {
  return (
    <span
      className="grid place-items-center rounded-full"
      style={{ width: 52, height: 52, background: active ? bg : "var(--card2)", color: active ? color : "var(--muted)", transition: "background-color 0.16s ease, color 0.16s ease" }}
      role="img"
      aria-label={label}
    >
      {children}
    </span>
  );
}
