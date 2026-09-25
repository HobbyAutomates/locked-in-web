"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { saveProfile } from "@/lib/actions";
import { ageMonths, bmi, bmiCategoryIndia, bmiCategoryWHO, bmiForAgeZ, healthyRange, percentileFromZ, teenBmiWords, teenHealthyRange, waistToHeight, whtrWords } from "@/lib/bmi";
import {
  HELPLINES,
  HELPLINE_NOTE,
  SAFETY_TITLE,
  SCIENCE_SOURCES,
  TEEN_GOAL_NOTE,
  TEEN_MIGRATION_BODY,
  TEEN_MIGRATION_TITLE,
  ageYears,
  isTeen,
  migrateTeenGoal,
  needsTeenMigration,
  safetyBody,
  todayIso,
  type EdFlag,
} from "@/lib/goals";
import type { Profile } from "@/lib/types";
import { Info, Phone } from "./icons";
import { BottomSheet, Card, NumberField, SPRING, fmt } from "./ui";

/**
 * v2.10 science UI shared by onboarding, Goal & current weight, Nutrition goals, Profile and
 * Progress: the ⓘ "The science" sheet, the kind safety note with helplines, the under-18 note and
 * one-time goal migration card, and the BMI card. Android: ui/components/Science.kt.
 */

// ---------------------------------------------------------------- "The science"

/** A small circled-i button that opens the sources sheet. */
export function ScienceButton({ label = "The science" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)} className="press inline-grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)", color: "var(--muted)", border: 0 }}>
        <Info size={16} />
      </button>
      <ScienceSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ScienceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} title="The science" subtitle="Where your numbers come from. General guidance, not medical advice." onClose={onClose}>
      <div className="flex flex-col gap-3 pb-1">
        {SCIENCE_SOURCES.map((s) => (
          <div key={s.title}>
            <p className="text-[14px] font-bold">{s.title}</p>
            <p className="mt-0.5 text-[13px] leading-[18px] muted">{s.body}</p>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------- safety note

/**
 * The non-blocking note shown when a safety flag trips: what the app did, why, and people to talk
 * to. Never a popup; the save it accompanies has already gone through.
 */
export function SafetyNote({ flags, floor, onClose }: { flags: EdFlag[]; floor?: number | null; onClose?: () => void }) {
  if (!flags.length) return null;
  return (
    <Card style={{ background: "var(--card2)" }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-bold">{SAFETY_TITLE}</p>
        {onClose ? (
          <button type="button" onClick={onClose} className="press shrink-0 text-[13px] font-semibold muted" style={{ background: "none", border: 0, padding: 0 }}>
            Close
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] leading-[18px]">{safetyBody(flags, floor ?? null)}</p>
      <ul className="mt-2.5 flex list-none flex-col gap-2 p-0">
        {HELPLINES.map((h) => (
          <li key={h.name} className="rounded-2xl px-3 py-2.5" style={{ background: "var(--card)" }}>
            <p className="text-[13px] font-bold">{h.name}</p>
            <p className="text-[11px] muted">{h.detail}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {h.phones.map((n) => (
                <a key={n} href={`tel:${n.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                  <Phone size={13} />
                  {n}
                </a>
              ))}
              {h.whatsapp ? <span className="text-[13px] font-semibold">WhatsApp {h.whatsapp}</span> : null}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-4 muted">{HELPLINE_NOTE}</p>
      <p className="mt-1.5 text-[12px] leading-4 muted">
        Prefer not to see numbers?{" "}
        <Link href="/profile/preferences/tracking" className="font-semibold underline" style={{ color: "var(--ink)" }}>
          You can hide calorie numbers
        </Link>
        .
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- under 18

/** The gentle line shown wherever an under-18 picks a goal. */
export function TeenNote() {
  return (
    <p className="rounded-2xl px-3.5 py-3 text-[13px] leading-[18px]" style={{ background: "var(--card2)" }}>
      {TEEN_GOAL_NOTE}
    </p>
  );
}

const CARD_KEY = "lockedin-teen-goal-card";
const cardListeners = new Set<() => void>();
function cardRead(): boolean {
  try {
    return window.localStorage.getItem(CARD_KEY) === "1";
  } catch {
    return false;
  }
}
function cardWrite(on: boolean) {
  try {
    if (on) window.localStorage.setItem(CARD_KEY, "1");
    else window.localStorage.removeItem(CARD_KEY);
  } catch {
    /* ignore */
  }
  cardListeners.forEach((l) => l());
}

/**
 * v2.10 migration: an under-18 account still holding "lose" is moved to maintain (fresh targets,
 * nothing deleted) the first time one of the goal screens computes targets, then a one-time card
 * explains why. The card stays until "Got it" on this device.
 */
export function TeenGoalMigration({ profile }: { profile: Profile }) {
  const router = useRouter();
  const started = useRef(false);
  const show = useSyncExternalStore(
    (l) => {
      cardListeners.add(l);
      return () => void cardListeners.delete(l);
    },
    cardRead,
    () => false,
  );
  useEffect(() => {
    if (started.current || !needsTeenMigration(profile)) return;
    started.current = true;
    const next = migrateTeenGoal(profile);
    if (!next) return;
    saveProfile({ goal_type: next.goal_type, calorie_target: next.calorie_target, protein_target_g: next.protein_target_g, carb_target_g: next.carb_target_g, fat_target_g: next.fat_target_g })
      .then(() => {
        cardWrite(true);
        router.refresh();
      })
      .catch((e) => console.error("[TeenGoalMigration] save failed", e));
  }, [profile, router]);
  if (!show) return null;
  return (
    <Card>
      <p className="text-[15px] font-bold">{TEEN_MIGRATION_TITLE}</p>
      <p className="mt-1 text-[13px] leading-[18px] muted">{TEEN_MIGRATION_BODY}</p>
      <button type="button" onClick={() => cardWrite(false)} className="press mt-2.5 rounded-full px-4 py-2 text-[13px] font-bold" style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }}>
        Got it
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------- BMI card

/**
 * BMI with the healthy range as a band on a weight scale. Adults: Indian cut-offs first, WHO
 * global second. Under 18: WHO 2007 BMI-for-age in plain words (no labels) and the usual range for
 * their age. `waist` adds the optional waist-to-height entry (hidden until schema_v34 is in).
 */
export function BmiCard({ profile, weightKg, waist = false }: { profile: Profile; weightKg: number | null; waist?: boolean }) {
  const today = todayIso();
  const heightCm = profile.height_cm;
  const b = bmi(weightKg, heightCm);
  const age = ageYears(profile.dob, today);
  const months = ageMonths(profile.dob, today);
  const teen = isTeen(age);

  if (b == null || !heightCm || !weightKg) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[17px] font-bold">Your BMI</p>
          <ScienceButton />
        </div>
        <p className="mt-1 text-[13px] muted">
          Add your height and weight in{" "}
          <Link href="/profile/details" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            Personal details
          </Link>{" "}
          to see it.
        </p>
      </Card>
    );
  }

  const z = teen && months != null ? bmiForAgeZ(b, profile.gender, months) : null;
  const range = teen ? (months != null ? teenHealthyRange(heightCm, profile.gender, months) : null) : healthyRange(heightCm);
  let chip: { text: string; color: string };
  let lines: string[];
  if (teen) {
    const words = z != null ? teenBmiWords(z) : { title: "Growth charts cover ages 5 to 17", detail: "" };
    chip = { text: z == null ? "For your age" : z < -2 || z > 1 ? "Worth a look" : "On track", color: z == null || (z >= -2 && z <= 1) ? "var(--green)" : "var(--orange)" };
    lines = [words.title, words.detail, z != null ? `About the ${ordinal(percentileFromZ(z))} percentile for your age, from WHO growth charts.` : ""].filter(Boolean);
  } else {
    const india = bmiCategoryIndia(b);
    const who = bmiCategoryWHO(b);
    chip = { text: india, color: india === "Normal" ? "var(--green)" : india === "Underweight" ? "var(--blue)" : india === "Overweight" ? "var(--orange)" : "var(--red)" };
    lines = [`${india} by Indian/Asian cut-offs · ${who} by WHO global ones.`, "BMI can't tell muscle from fat, so it's one signal, not a verdict."];
  }

  // Weight scale: the healthy band sits in the middle third-ish, the marker at today's weight.
  const lo = range ? Math.min(range.min, weightKg) - 8 : weightKg - 15;
  const hi = range ? Math.max(range.max, weightKg) + 8 : weightKg + 15;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)).toFixed(1)}%`;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[17px] font-bold">Your BMI</p>
        <span className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${chip.color} 16%, transparent)`, color: chip.color }}>
            {chip.text}
          </span>
          <ScienceButton />
        </span>
      </div>
      <p className="num mt-1 text-[32px] font-extrabold leading-none" style={{ letterSpacing: "-0.04em" }}>
        {b.toFixed(1)}
      </p>
      {range ? (
        <>
          <div className="relative mt-4 h-3 rounded-full" style={{ background: "var(--track)" }} aria-hidden="true">
            <span className="absolute top-0 block h-full rounded-full" style={{ left: at(range.min), width: `calc(${at(range.max)} - ${at(range.min)})`, background: "color-mix(in srgb, var(--green) 55%, transparent)" }} />
            <motion.span
              className="absolute top-1/2 block rounded-full"
              style={{ width: 6, height: 22, background: "var(--ink)", border: "2px solid var(--card)", translateX: "-50%", translateY: "-50%" }}
              initial={{ left: "0%" }}
              animate={{ left: at(weightKg) }}
              transition={{ ...SPRING, delay: 0.2 }}
            />
          </div>
          <p className="mt-2 text-[13px] font-semibold">
            {teen ? "Usual range for your age and height" : "Healthy range for your height"}: {fmt(range.min)}–{fmt(range.max)} kg
          </p>
        </>
      ) : null}
      {lines.map((l) => (
        <p key={l} className="mt-1 text-[12px] leading-4 muted">
          {l}
        </p>
      ))}
      {waist && profile.hide_numbers !== null ? <WaistRow profile={profile} /> : null}
    </Card>
  );
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

/** Optional waist entry and the waist-to-height ratio. */
function WaistRow({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [value, setValue] = useState(profile.waist_cm != null ? fmt(profile.waist_cm) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cm = Number(value) || null;
  const dirty = (cm ?? null) !== (profile.waist_cm ?? null);
  const r = waistToHeight(profile.waist_cm, profile.height_cm);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ waist_cm: cm });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--hair)" }}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-[14px] font-semibold">Waist (optional)</span>
          <span className="text-[11px] muted">Measure around your belly button, relaxed</span>
        </span>
        <span className="flex items-center gap-2">
          <NumberField value={value} onChange={(v) => setValue(v.slice(0, 5))} unit="cm" label="Waist in centimetres" decimal />
          {dirty ? (
            <button type="button" onClick={save} disabled={busy} className="press rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }}>
              {busy ? "…" : "Save"}
            </button>
          ) : null}
        </span>
      </div>
      {r != null ? (
        <p className="mt-1.5 text-[12px] leading-4">
          <span className="num font-bold" style={{ color: whtrWords(r).ok ? "var(--green)" : "var(--orange)" }}>
            Waist-to-height {r.toFixed(2)}
          </span>{" "}
          <span className="muted">· {whtrWords(r).text}</span>
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-[12px]" style={{ color: "var(--red)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
