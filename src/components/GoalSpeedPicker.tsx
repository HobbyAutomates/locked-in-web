"use client";

import { roundSpeed, speedLabel } from "@/lib/goals";
import { Cheetah, Rabbit, Sloth } from "./icons";
import { fmt } from "./ui";

/**
 * The 0.1–1.5 kg/week pace control: sloth / rabbit / cheetah above a notched slider, with the
 * big number and a "Slow and steady / Recommended / Aggressive" chip below. Shared by the
 * Goal & current weight page and onboarding so both always read the same (GoalSpeed.kt).
 */
export default function GoalSpeedPicker({ speed, onChange }: { speed: number; onChange: (v: number) => void }) {
  const kg = roundSpeed(speed);
  const label = speedLabel(kg);
  const tint = label === "Recommended" ? "var(--green)" : label === "Aggressive" ? "var(--red)" : "var(--orange)";
  const tintBg = label === "Recommended" ? "var(--green-bg)" : label === "Aggressive" ? "var(--red-bg)" : "var(--orange-bg)";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <Animal active={kg < 0.5} color="var(--green)" bg="var(--green-bg)" label="Slow and steady">
          <Sloth size={26} />
        </Animal>
        <Animal active={kg >= 0.5 && kg <= 0.8} color="var(--orange)" bg="var(--orange-bg)" label="Recommended">
          <Rabbit size={26} />
        </Animal>
        <Animal active={kg > 0.8} color="var(--red)" bg="var(--red-bg)" label="Aggressive">
          <Cheetah size={26} />
        </Animal>
      </div>
      <input
        type="range"
        className="range mt-3"
        min={0.1}
        max={1.5}
        step={0.1}
        value={kg}
        onChange={(e) => onChange(roundSpeed(Number(e.target.value)))}
        aria-label="Weekly pace in kilograms"
        aria-valuetext={`${fmt(kg)} kg per week, ${label}`}
      />
      <div className="flex justify-between text-[11px] muted">
        <span>0.1 kg</span>
        <span>1.5 kg</span>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="num text-xl font-extrabold" style={{ letterSpacing: "-0.03em" }}>
          {fmt(kg)} kg / week
        </span>
        <span className="badge" style={{ background: tintBg, color: tint }}>
          {label}
        </span>
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
