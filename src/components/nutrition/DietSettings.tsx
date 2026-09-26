"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DIET_MODES, NOT_FOR_TEENS, dietModeInfo, dietTargets, modeAllowed, type DietMode } from "@/lib/dietModes";
import { ageYears, type Targets } from "@/lib/goals";
import { restoreDiet, setAdaptiveTargets, setDietMode, type DietSnapshot } from "@/lib/nutrition-actions";
import type { CheckinState, NutritionSettings } from "@/lib/nutritionTypes";
import { MIN_LOGGED_DAYS, MIN_WEIGH_INS } from "@/lib/adaptive";
import { carbTargetG, fatTargetG, type Profile } from "@/lib/types";
import { LineIcon } from "../lineIcons";
import { UndoSnackbar } from "../LogBits";
import { BottomSheet, ErrorNote, Toggle } from "../ui";
import { AccentButton, CardHead, ComingSoon, GhostButton, PCard } from "./kit";
import { CheckinCard } from "./CheckinCard";

/** What each mode leaves out of suggestions (never out of logging). */
const FILTER_NOTE: Record<DietMode, string | null> = {
  balanced: null,
  high_protein: null,
  vegetarian: "Suggestions leave out meat, fish and egg.",
  eggetarian: "Suggestions leave out meat and fish.",
  vegan: "Suggestions leave out meat, fish, egg, dairy, ghee, paneer, curd and honey.",
  jain: "Suggestions leave out meat, fish, egg, honey, onion, garlic, potato and other roots.",
  keto: null,
  low_carb: null,
  mediterranean: null,
};

/**
 * Nutrition goals → Diet (spec §4): the current mode, a picker with "The science" for each, a
 * confirm step with the before → after macros (calories never change), and Undo afterwards.
 * Under 18 only the six growing-body-safe modes can be picked.
 */
export function DietModeCard({ profile, settings, onTargets }: { profile: Profile; settings: NutritionSettings; onTargets: (t: Targets) => void }) {
  const router = useRouter();
  const age = ageYears(profile.dob);
  const [mode, setMode] = useState<DietMode>(settings.diet_mode);
  const [sheet, setSheet] = useState<"list" | "confirm" | "science" | null>(null);
  const [picked, setPicked] = useState<DietMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ text: string; undo: DietSnapshot | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const info = dietModeInfo(mode);
  const pickedInfo = picked ? dietModeInfo(picked) : null;
  const current: Targets = { calories: profile.calorie_target, protein: profile.protein_target_g, carbs: carbTargetG(profile), fat: fatTargetG(profile) };
  const preview = picked ? dietTargets(profile, profile.calorie_target, picked) : null;

  function showSnack(text: string, undo: DietSnapshot | null) {
    setSnack({ text, undo });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSnack(null), 6000);
  }

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const r = await setDietMode(picked);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMode(picked);
    onTargets(r.next.targets);
    setSheet(null);
    showSnack(`Switched to ${dietModeInfo(picked).label}. Macros updated.`, r.previous);
    router.refresh();
  }

  async function undo(prev: DietSnapshot) {
    setSnack(null);
    const r = await restoreDiet(prev);
    if (!r.ok) return showSnack(r.error, null);
    setMode(prev.mode);
    onTargets(prev.targets);
    showSnack(`Back to ${dietModeInfo(prev.mode).label}`, null);
    router.refresh();
  }

  return (
    <PCard label="Diet">
      <CardHead
        icon="bowl"
        title="Diet"
        sub={settings.available ? `${info.label} · ${info.short}` : "Balanced, vegetarian, vegan, Jain, keto and more"}
        right={
          settings.available ? (
            <button type="button" className="press shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} onClick={() => setSheet("list")}>
              Change
            </button>
          ) : null
        }
      />
      {!settings.available ? <ComingSoon /> : FILTER_NOTE[mode] ? <p className="text-[12px] leading-4 muted">{FILTER_NOTE[mode]} Logging is never limited.</p> : null}

      <BottomSheet open={sheet === "list"} title="Choose a diet" subtitle="Calories stay the same; protein, carbs and fat follow the diet." onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-1.5 pb-1" role="radiogroup" aria-label="Diet">
          {DIET_MODES.map((m) => {
            const ok = modeAllowed(m.key, age);
            const sel = m.key === mode;
            return (
              <div key={m.key} className="flex items-center gap-2 rounded-2xl" style={{ background: sel ? "var(--card2)" : "transparent" }}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  disabled={!ok}
                  className="press flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                  style={{ background: "none", border: 0, color: "var(--ink)", opacity: ok ? 1 : 0.5 }}
                  onClick={() => {
                    if (sel) return setSheet(null);
                    setPicked(m.key);
                    setError(null);
                    setSheet("confirm");
                  }}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ border: `1.5px solid ${sel ? "var(--accent)" : "var(--hair)"}` }}>
                    {sel ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-semibold">{m.label}</span>
                    <span className="text-[12px] muted">{ok ? m.short : NOT_FOR_TEENS}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`The science: ${m.label}`}
                  className="press mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{ background: "var(--card2)", color: "var(--muted)", border: 0 }}
                  onClick={() => {
                    setPicked(m.key);
                    setSheet("science");
                  }}
                >
                  <LineIcon name="info" size={17} />
                </button>
              </div>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "science" && !!pickedInfo} title={pickedInfo ? `The science: ${pickedInfo.label}` : "The science"} subtitle="General guidance, not medical advice." onClose={() => setSheet("list")}>
        {pickedInfo ? (
          <div className="flex flex-col gap-3 pb-1">
            <p className="text-[14px] leading-[20px]">{pickedInfo.science}</p>
            <p className="text-[12px] leading-4 muted">Source: {pickedInfo.source}</p>
            {pickedInfo.warning ? (
              <p className="rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold" style={{ background: "var(--orange-bg)", color: "var(--orange-ink)" }}>
                {pickedInfo.warning}
              </p>
            ) : null}
            {!modeAllowed(pickedInfo.key, age) ? <p className="text-[13px] font-semibold muted">{NOT_FOR_TEENS}.</p> : null}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet open={sheet === "confirm" && !!pickedInfo} title={pickedInfo ? `Switch to ${pickedInfo.label}?` : "Switch diet?"} subtitle={`Calories stay at ${profile.calorie_target.toLocaleString("en-IN")} kcal. You can undo this.`} onClose={() => setSheet("list")}>
        {pickedInfo && preview ? (
          <div className="flex flex-col gap-3 pb-1">
            <div className="rounded-2xl px-3.5 py-2.5" style={{ background: "var(--card2)" }}>
              {(
                [
                  ["Protein", current.protein, preview.protein, "var(--red)"],
                  ["Carbs", current.carbs, preview.carbs, "var(--orange)"],
                  ["Fat", current.fat, preview.fat, "var(--blue)"],
                ] as const
              ).map(([label, a, b, color]) => (
                <div key={label} className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {label}
                  </span>
                  <span className="num text-[13px]">
                    <span className="muted">{a} g → </span>
                    <span className="font-bold">{b} g</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-[18px] muted">{pickedInfo.science}</p>
            {FILTER_NOTE[pickedInfo.key] ? <p className="text-[12px] leading-4 muted">{FILTER_NOTE[pickedInfo.key]} Logging is never limited.</p> : null}
            {pickedInfo.warning ? (
              <p className="rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold" style={{ background: "var(--orange-bg)", color: "var(--orange-ink)" }}>
                {pickedInfo.warning}
              </p>
            ) : null}
            <ErrorNote text={error} />
            <div className="grid grid-cols-2 gap-2">
              <GhostButton onClick={() => setSheet("list")} disabled={busy}>
                Cancel
              </GhostButton>
              <AccentButton onClick={() => void confirm()} disabled={busy}>
                {busy ? "Switching…" : "Switch"}
              </AccentButton>
            </div>
          </div>
        ) : null}
      </BottomSheet>
      <UndoSnackbar text={snack?.text ?? null} onUndo={snack?.undo ? () => void undo(snack.undo as DietSnapshot) : undefined} />
    </PCard>
  );
}

/**
 * Nutrition goals → Adaptive weekly targets (spec §5), off by default. On: this week's check-in
 * (Apply / Keep current) or what's still missing before the first one.
 */
export function AdaptiveCard({ settings, checkin, hideNumbers = false }: { settings: NutritionSettings; checkin: CheckinState; hideNumbers?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(settings.adaptive_targets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(v: boolean) {
    setBusy(true);
    setError(null);
    setOn(v);
    const r = await setAdaptiveTargets(v);
    setBusy(false);
    if (!r.ok) {
      setOn(!v);
      return setError(r.error);
    }
    router.refresh();
  }

  return (
    <PCard label="Adaptive weekly targets">
      <CardHead
        icon="refresh"
        title="Adaptive weekly targets"
        sub="Each Monday, your weight trend and what you ate suggest a new calorie target. It never changes without you."
        right={settings.available ? <Toggle on={on} onChange={(v) => void toggle(v)} label="Adaptive weekly targets" disabled={busy} /> : null}
      />
      {!settings.available ? <ComingSoon /> : null}
      <ErrorNote text={error} />
      {settings.available && on ? (
        checkin.row ? (
          <CheckinCard row={checkin.row} hideNumbers={hideNumbers} />
        ) : checkin.pending ? (
          <div className="rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }}>
            <p className="text-[13px] font-semibold">Not enough data yet</p>
            <p className="mt-0.5 text-[13px] leading-[18px] muted">{checkin.pending.missing}</p>
            <p className="num mt-1.5 text-[12px] muted">
              {checkin.pending.loggedDays}/{MIN_LOGGED_DAYS} days logged · {checkin.pending.weighIns}/{MIN_WEIGH_INS} weigh-ins
            </p>
            <Link href="/profile/weight?log=1" className="press mt-2 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              Log a weigh-in
              <LineIcon name="chev" size={14} />
            </Link>
          </div>
        ) : (
          <p className="text-[13px] muted">Your first check-in comes next Monday.</p>
        )
      ) : null}
    </PCard>
  );
}
