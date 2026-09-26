"use client";

import { dayMicros, microTargets, weekAverage, weekHints, type MicroKey } from "@/lib/micros";
import { dietModeInfo } from "@/lib/dietModes";
import type { NutritionSettings } from "@/lib/nutritionTypes";
import type { Meal, Profile } from "@/lib/types";
import SubPage from "../SubPage";
import { LineIcon } from "../lineIcons";
import { CountUp, MRise, STAGGER } from "../motion";
import { Bar, Label, PCard, Pill } from "./kit";

const COLOR: Record<MicroKey, string> = {
  fiber_g: "var(--green)",
  iron_mg: "var(--red)",
  calcium_mg: "var(--blue)",
  vitamin_c_mg: "var(--orange)",
  potassium_mg: "var(--purple)",
  sugar_g: "var(--accent)",
  sodium_mg: "var(--muted)",
};

const shown = (v: number, unit: string) => (unit === "mg" && v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

/**
 * v2.13 micronutrient dashboard (spec §9): today and the 7-day average against ICMR-NIN 2020 /
 * WHO targets, and "low this week" hints with Indian foods that fit the diet mode.
 */
export default function MicrosScreen({ today, profile, settings, meals }: { today: string; profile: Profile; settings: NutritionSettings; meals: Meal[] }) {
  const targets = microTargets(profile, today);
  const day = dayMicros(meals, today);
  const week = weekAverage(meals, today);
  const hints = weekHints(targets, week.values, week.loggedDays, settings.diet_mode);
  const goals = targets.filter((t) => t.kind === "min");
  const limits = targets.filter((t) => t.kind === "max");

  const row = (t: (typeof targets)[number], i: number) => {
    const todayV = day.values[t.key];
    const avgV = week.values[t.key];
    const over = t.kind === "max" && todayV > t.target;
    return (
      <div key={t.key} className="flex flex-col gap-1.5" style={{ paddingTop: i ? 12 : 0, borderTop: i ? "1px solid var(--hair)" : "none" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold">{t.label}</span>
          <span className="num text-[13px]">
            <span className="text-[17px] font-semibold" style={{ color: over ? "var(--orange-ink)" : "var(--ink)" }}>
              <CountUp value={shown(todayV, t.unit)} decimals={t.unit === "mg" && todayV >= 100 ? 0 : 1} delay={200 + i * 90} duration={1200} />
            </span>
            <span className="muted">
              {" "}
              / {t.kind === "max" ? "under " : ""}
              {t.target.toLocaleString("en-IN")} {t.unit}
            </span>
          </span>
        </div>
        <Bar fraction={todayV / Math.max(1, t.target)} color={over ? "var(--orange)" : COLOR[t.key]} delay={260 + i * 90} />
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] muted">7-day avg</span>
          <div className="min-w-0 flex-1 opacity-60">
            <Bar fraction={avgV / Math.max(1, t.target)} color={COLOR[t.key]} delay={360 + i * 90} />
          </div>
          <span className="num w-20 shrink-0 text-right text-[11px] muted">
            {shown(avgV, t.unit).toLocaleString("en-IN")} {t.unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <SubPage title="Micronutrients" back="/profile/goals">
      <MRise>
        <PCard label="Summary">
          <div className="flex items-center justify-between gap-2">
            <Label>Today and your 7-day average</Label>
            <Pill tone="flat">{week.loggedDays} of 7 days logged</Pill>
          </div>
          <p className="text-[13px] leading-[18px] muted">
            From the foods that carry nutrient data{week.loggedDays ? ` (${Math.round(week.coverage * 100)}% of what you logged this week)` : ""}. Restaurant dishes and AI estimates often don&apos;t, so treat these as a floor.
          </p>
        </PCard>
      </MRise>

      {hints.length ? (
        <MRise delay={STAGGER}>
          <PCard label="This week">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <LineIcon name="spark" size={17} style={{ color: "var(--accent)" }} />
              This week
            </p>
            {hints.map((h) => (
              <div key={h.key} className="flex flex-col gap-1.5">
                <p className="text-[13px] leading-[18px]">{h.text}</p>
                {h.foods.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {h.foods.map((f) => (
                      <span key={f} className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: "var(--card2)" }}>
                        {f}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {settings.diet_mode !== "balanced" ? <p className="text-[11px] muted">Food ideas fit your {dietModeInfo(settings.diet_mode).label.toLowerCase()} diet.</p> : null}
          </PCard>
        </MRise>
      ) : null}

      <MRise delay={STAGGER * 2}>
        <PCard label="Goals">
          <Label>Get enough</Label>
          {goals.map(row)}
        </PCard>
      </MRise>
      <MRise delay={STAGGER * 3}>
        <PCard label="Limits">
          <Label>Keep under</Label>
          {limits.map(row)}
        </PCard>
      </MRise>
      <MRise delay={STAGGER * 4}>
        <div className="flex flex-col gap-1 px-1 pb-2">
          {targets.map((t) => (
            <p key={t.key} className="text-[11px] leading-4 muted">
              {t.label}: {t.source}.
            </p>
          ))}
          <p className="text-[11px] leading-4 muted">General guidance, not medical advice.</p>
        </div>
      </MRise>
    </SubPage>
  );
}
