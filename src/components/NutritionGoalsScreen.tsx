"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/actions";
import { amdrNotes, capToFloor, edFlags, floorFor, missing, plan, screenInput, type EdFlag, type Plan, type Targets } from "@/lib/goals";
import { recordEdit } from "@/lib/targetEdits";
import { DEFAULT_FIBER_G, DEFAULT_SUGAR_G, carbTargetG, fatTargetG, type Profile, type WeightEntry } from "@/lib/types";
import { SafetyNote, ScienceButton, TeenGoalMigration } from "./Science";
import SubPage from "./SubPage";
import { ChevronDown, ChevronRight, Flame } from "./icons";
import { Card, ErrorNote, Hair, NumberField, PillButton, Ring, Rise, fmt } from "./ui";

type Key = "p" | "c" | "f";
type Split = Record<Key, number>;

const MACROS: { key: Key; label: string; color: string; kcalPerG: number }[] = [
  { key: "p", label: "Protein", color: "#E9636B", kcalPerG: 4 },
  { key: "c", label: "Carbs", color: "#E5A15B", kcalPerG: 4 },
  { key: "f", label: "Fat", color: "#5B8DEF", kcalPerG: 9 },
];

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Whole-number P/C/F percentages of `calories` for the given grams, summing to exactly 100. */
function splitFrom(t: Targets): Split {
  const kcal = Math.max(1, t.calories);
  const p = clampN(Math.round(((t.protein * 4) / kcal) * 100), 0, 100);
  const f = clampN(Math.round(((t.fat * 9) / kcal) * 100), 0, 100 - p);
  return { p, c: 100 - p - f, f };
}

/**
 * Set one percentage and rebalance so the three still sum to 100: protein or fat moves take from
 * (or give to) carbs first; a carbs move is balanced by fat first. The other macro only moves when
 * the first one hits 0 or 100.
 */
function rebalance(s: Split, key: Key, value: number): Split {
  const next: Split = { ...s, [key]: clampN(Math.round(value), 0, 100) };
  const order: Key[] = key === "c" ? ["f", "p"] : key === "p" ? ["c", "f"] : ["c", "p"];
  let diff = 100 - (next.p + next.c + next.f);
  for (const k of order) {
    if (diff === 0) break;
    const v = clampN(next[k] + diff, 0, 100);
    diff -= v - next[k];
    next[k] = v;
  }
  if (diff !== 0) next[key] += diff;
  return next;
}

/** Grams from calories and a split: 4 kcal/g for protein and carbs, 9 for fat, rounded. */
function gramsFrom(calories: number, s: Split): Targets {
  return {
    calories,
    protein: Math.round((calories * s.p) / 100 / 4),
    carbs: Math.round((calories * s.c) / 100 / 4),
    fat: Math.round((calories * s.f) / 100 / 9),
  };
}

/**
 * Nutrition goals on one screen: a calorie goal, a Protein / Carbs / Fat split that always sums to
 * 100 % (grams follow the calories), and "Auto generate" — the Mifflin-St Jeor engine run in place
 * with a before → after preview. Nothing is stored until Save.
 */
export default function NutritionGoalsScreen({ profile, weights = [] }: { profile: Profile; weights?: WeightEntry[] }) {
  const router = useRouter();
  const current: Targets = { calories: profile.calorie_target, protein: profile.protein_target_g, carbs: carbTargetG(profile), fat: fatTargetG(profile) };
  const [calories, setCalories] = useState(String(current.calories));
  const [split, setSplit] = useState<Split>(() => splitFrom(current));
  /** Exact grams to save as-is (the current goals, or freshly generated ones) until the split is touched. */
  const [exact, setExact] = useState<Targets | null>(current);
  const [preview, setPreview] = useState<{ before: Targets; after: Targets; plan: Plan } | null>(null);
  const [safety, setSafety] = useState<{ flags: EdFlag[]; floor: number | null } | null>(null);
  const [gapNote, setGapNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micros, setMicros] = useState(false);
  const [fiber, setFiber] = useState(String(profile.fiber_target ?? DEFAULT_FIBER_G));
  const [sugar, setSugar] = useState(String(profile.sugar_target ?? DEFAULT_SUGAR_G));
  const gaps = missing(profile);
  const fiberG = Math.min(200, Math.max(1, Number(fiber) || DEFAULT_FIBER_G));
  const sugarG = Math.min(500, Math.max(1, Number(sugar) || DEFAULT_SUGAR_G));
  const microsDirty = fiberG !== (profile.fiber_target ?? DEFAULT_FIBER_G) || sugarG !== (profile.sugar_target ?? DEFAULT_SUGAR_G);

  const kcal = clampN(Number(calories) || 0, 0, 10_000);
  // v2.10: anything under the safe floor is lifted to it on save (never blocked), so only 0 is invalid.
  const kcalValid = kcal >= 1 && kcal <= 10_000;
  const floor = floorFor(profile);
  const working = plan(profile);
  const next: Targets = exact && exact.calories === kcal ? exact : gramsFrom(kcal, split);
  const dirty = microsDirty || next.calories !== current.calories || next.protein !== current.protein || next.carbs !== (profile.carb_target_g ?? -1) || next.fat !== (profile.fat_target_g ?? -1);

  function setPct(key: Key, value: number) {
    setSplit((s) => rebalance(s, key, value));
    setExact(null);
    setSaved(false);
  }

  function autoGenerate() {
    setError(null);
    if (gaps.length) {
      setPreview(null);
      setGapNote(`Add your ${gaps.join(", ")} in Personal details first.`);
      return;
    }
    const pl = plan(profile);
    if (!pl) return;
    const t = pl.targets;
    setGapNote(null);
    setPreview({ before: current, after: t, plan: pl });
    setCalories(String(t.calories));
    setSplit(splitFrom(t));
    setExact(t);
    setSaved(false);
  }

  async function save() {
    if (!kcalValid) return setError("Pick a calorie goal up to 10,000 kcal.");
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      // Safety: a target under the floor is lifted to it, with the same split, and saved anyway.
      // Only when the calorie number itself changed, so editing fibre alone never moves an old target.
      const touched = next.calories !== current.calories;
      const cap = touched ? capToFloor(next.calories, floor) : { calories: next.calories, capped: false };
      const out: Targets = cap.capped ? gramsFrom(cap.calories, split) : next;
      await saveProfile({ calorie_target: out.calories, protein_target_g: out.protein, carb_target_g: out.carbs, fat_target_g: out.fat, fiber_target: fiberG, sugar_target: sugarG });
      const edits = recordEdit("calories", current.calories, next.calories);
      const flags = edFlags(screenInput(profile, { weights: weights.map((w) => ({ date: w.date, kg: w.weight_kg })), requestedCalories: touched ? next.calories : null, edits }));
      setSafety(flags.length ? { flags, floor: cap.capped ? cap.calories : null } : null);
      if (cap.capped) setCalories(String(cap.calories));
      setSaved(true);
      setPreview(null);
      setExact(out);
      router.refresh();
    } catch (err) {
      console.error("[NutritionGoals] save failed", err);
      setError(err instanceof Error && err.message ? err.message : "Could not save your goals");
    } finally {
      setBusy(false);
    }
  }

  const grams: Record<Key, number> = { p: next.protein, c: next.carbs, f: next.fat };

  return (
    <SubPage title="Nutrition goals" back="/profile">
      <TeenGoalMigration profile={profile} />

      {/* ---- Auto generate ---- */}
      <Rise index={0}>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[15px] font-bold">
                Auto generate
                <ScienceButton />
              </p>
              <p className="mt-0.5 text-xs leading-[17px] muted">
                {working == null
                  ? "From your weight, height, age and gender."
                  : working.teen
                    ? `Built for a growing body: ${working.goal === "gain" ? "what you need to grow and train, plus a small extra" : "what you need to grow and train"}. No deficits under 18.`
                    : `From your weight, height, age and gender: ${working.pal.label.toLowerCase()}, ${working.goal === "maintain" ? "maintaining" : `${working.goal === "lose" ? "losing" : "gaining"} ${fmt(working.speed)} kg/week`}.`}
              </p>
            </div>
            <PillButton onClick={autoGenerate} height={40} className="!w-auto shrink-0 !px-4 text-[13px]" style={{ minHeight: 40 }}>
              <span className="inline-flex items-center gap-1.5">
                <SparkleIcon />
                Generate
              </span>
            </PillButton>
          </div>
          {gapNote ? (
            <div className="mt-3 rounded-2xl px-3.5 py-3" style={{ background: "var(--orange-bg)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--orange)" }}>
                {gapNote}
              </p>
              <button type="button" className="press mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold" style={{ background: "none", border: 0, padding: 0, color: "var(--ink)" }} onClick={() => router.push("/profile/details")}>
                Open Personal details
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
          {preview ? <BeforeAfter before={preview.before} after={preview.after} /> : null}
          {preview?.plan.speedCapped ? (
            <p className="mt-2 text-[12px] leading-4 muted">We used {fmt(preview.plan.speed)} kg/week, the safe max for your body weight, instead of {fmt(profile.goal_speed_kg_wk)}.</p>
          ) : null}
          {preview?.plan.floorApplied ? <p className="mt-1 text-[12px] leading-4 muted">Calories sit at your floor ({preview.plan.targets.calories.toLocaleString("en-IN")} kcal), the lowest we&apos;ll go for your body.</p> : null}
        </Card>
      </Rise>

      {/* ---- Calories ---- */}
      <Rise index={1}>
        <Card padding={0}>
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="flex items-center gap-3">
              <Ring fraction={1} color="var(--ink)" size={40} stroke={4}>
                <Flame size={16} />
              </Ring>
              <span className="flex flex-col">
                <span className="text-[15px] font-bold">Calorie goal</span>
                <span className="text-xs muted">Per day</span>
              </span>
            </span>
            <NumberField
              value={calories}
              onChange={(v) => {
                setCalories(v.slice(0, 5));
                setSaved(false);
              }}
              unit="kcal"
              label="Calorie goal"
            />
          </div>
        </Card>
      </Rise>

      {/* ---- Macro split ---- */}
      <Rise index={2}>
        <Card padding={0}>
          <div className="px-4 pt-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold">Macro split</p>
              <p className="num text-xs font-semibold muted">{split.p + split.c + split.f}% of {kcal.toLocaleString("en-IN")} kcal</p>
            </div>
            <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--track)" }} aria-hidden="true">
              {MACROS.map((m) => (
                <span key={m.key} className="block h-full" style={{ width: `${split[m.key]}%`, background: m.color, transition: "width 0.2s" }} />
              ))}
            </div>
          </div>
          <div className="px-4">
            {MACROS.map((m, i) => (
              <div key={m.key}>
                {i > 0 ? <Hair /> : null}
                <MacroRow label={m.label} color={m.color} pct={split[m.key]} grams={grams[m.key]} onChange={(v) => setPct(m.key, v)} />
              </div>
            ))}
          </div>
          <p className="px-4 pb-3.5 text-[11px] leading-4 muted">Grams follow your calories: protein and carbs 4 kcal per gram, fat 9.</p>
          {amdrNotes(next).length ? (
            <ul className="mx-4 mb-3.5 flex list-none flex-col gap-1.5 rounded-2xl px-3 py-2.5" style={{ background: "var(--card2)" }}>
              {amdrNotes(next).map((n) => (
                <li key={n.macro} className="text-[12px] leading-4" style={{ color: n.level === "warn" ? "var(--orange)" : "var(--muted)", fontWeight: n.level === "warn" ? 600 : 400 }}>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </Rise>

      {/* ---- Micronutrients ---- */}
      <Rise index={3}>
        <Card padding={0}>
          <button type="button" aria-expanded={micros} className="press flex w-full items-center justify-between px-4 py-3.5 text-[15px] font-bold" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => setMicros((v) => !v)}>
            View micronutrients
            <ChevronDown size={18} style={{ transform: micros ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--muted)" }} />
          </button>
          {micros ? (
            <div className="px-4 pb-2">
              <Hair />
              <MicroRow label="Fiber" sub="Goal: at least" color="var(--green)" value={fiber} onChange={(v) => { setFiber(v); setSaved(false); }} />
              <Hair />
              <MicroRow label="Sugar" sub="Limit: at most" color="var(--purple)" value={sugar} onChange={(v) => { setSugar(v); setSaved(false); }} />
              <p className="pb-2 text-[11px] leading-4 muted">Defaults: {DEFAULT_FIBER_G} g fiber, {DEFAULT_SUGAR_G} g sugar a day. Scans and meals count these from food labels and the food table.</p>
            </div>
          ) : null}
        </Card>
      </Rise>

      <Rise index={3}>
        <ErrorNote text={error} />
      </Rise>
      <Rise index={3}>
        <PillButton onClick={save} disabled={busy || !dirty || !kcalValid}>
          {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save goals"}
        </PillButton>
      </Rise>
      {safety ? (
        <Rise index={4}>
          <SafetyNote flags={safety.flags} floor={safety.floor} onClose={() => setSafety(null)} />
        </Rise>
      ) : null}
    </SubPage>
  );
}

/** "2,200 → 2,450 kcal" for calories and each macro, changes in bold. */
function BeforeAfter({ before, after }: { before: Targets; after: Targets }) {
  const rows: [string, number, number, string, string][] = [
    ["Calories", before.calories, after.calories, "kcal", "var(--ink)"],
    ["Protein", before.protein, after.protein, "g", "#E9636B"],
    ["Carbs", before.carbs, after.carbs, "g", "#E5A15B"],
    ["Fat", before.fat, after.fat, "g", "#5B8DEF"],
  ];
  return (
    <div className="mt-3 rounded-2xl px-3.5 py-2.5" style={{ background: "var(--card2)" }}>
      {rows.map(([label, a, b, unit, color]) => (
        <div key={label} className="flex items-center justify-between gap-2 py-1">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="rounded-full" style={{ width: 8, height: 8, background: color }} />
            {label}
          </span>
          <span className="num text-[13px]">
            <span className="muted">{a.toLocaleString("en-IN")}</span>
            <span className="muted"> → </span>
            <span className="font-extrabold">{b.toLocaleString("en-IN")}</span> <span className="muted">{unit}</span>
          </span>
        </div>
      ))}
      <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--green)" }}>
        Applied below — tap Save goals to keep them.
      </p>
    </div>
  );
}

/** One macro: name + grams, a −5 / slider / +5 control and the percentage. */
function MacroRow({ label, color, pct, grams, onChange }: { label: string; color: string; pct: number; grams: number; onChange: (v: number) => void }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Ring fraction={pct / 100} color={color} size={32} stroke={4}>
            <span className="text-[10px] font-extrabold" style={{ color }}>
              {label.charAt(0)}
            </span>
          </Ring>
          {label}
        </span>
        <span className="num text-[15px] font-extrabold">
          {grams} g <span className="text-xs font-semibold muted">· {pct}%</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <Step label={`${label} minus 5 percent`} onClick={() => onChange(pct - 5)} disabled={pct <= 0}>
          −
        </Step>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={`${label} percent of calories`}
          className="h-6 min-w-0 flex-1"
          style={{ accentColor: color }}
        />
        <Step label={`${label} plus 5 percent`} onClick={() => onChange(pct + 5)} disabled={pct >= 100}>
          +
        </Step>
      </div>
    </div>
  );
}

/** Fiber / sugar: a ring, the label and a grams field. */
function MicroRow({ label, sub, color, value, onChange }: { label: string; sub: string; color: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-2.5">
        <Ring fraction={0.72} color={color} size={32} stroke={4}>
          <span className="text-[10px] font-extrabold" style={{ color }}>
            {label.charAt(0)}
          </span>
        </Ring>
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold">{label}</span>
          <span className="text-[11px] muted">{sub}</span>
        </span>
      </span>
      <NumberField value={value} onChange={(v) => onChange(v.slice(0, 3))} unit="g" label={`${label} goal in grams`} />
    </div>
  );
}

function Step({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-[18px] font-bold"
      style={{ background: "var(--card2)", color: "var(--ink)", border: 0, opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  );
}

/** Four-point sparkle, the "✨" of the Android button without the emoji. */
function SparkleIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2l1.8 5.6L19.5 9.4l-5.7 1.8L12 16.8l-1.8-5.6L4.5 9.4l5.7-1.8zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.9 1.9.7-1.9.7L5 20.2l-.7-1.9-1.9-.7 1.9-.7z" />
    </svg>
  );
}
