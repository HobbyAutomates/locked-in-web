import { DEFAULT_WEIGHT_KG } from "../burn";

/**
 * v2.18 C3 sports presets: steps, cricket, football, badminton and kabaddi, each with realistic
 * variants from the 2024 Compendium of Physical Activities (kcal = MET × kg × hours, like burn.ts).
 * Kabaddi has no Compendium code; it's priced like wrestling-style team drills (MET 6–8).
 * Pure; Android util/Sports.kt.
 */

export type SportVariant = { key: string; label: string; met: number; code: string | null; minutes: number; note: string };
export type Sport = { key: "cricket" | "football" | "badminton" | "kabaddi"; name: string; variants: SportVariant[] };

export const SPORTS: Sport[] = [
  {
    key: "cricket",
    name: "Cricket",
    variants: [
      { key: "gully", label: "Gully / tennis-ball", met: 5.0, code: "LI-15150", minutes: 60, note: "Lots of running between wickets and chasing." },
      { key: "batting", label: "Net session (batting / bowling)", met: 4.8, code: "LI-15150", minutes: 60, note: "Compendium 15150: batting, bowling, fielding." },
      { key: "match", label: "Match, mostly fielding", met: 4.0, code: "LI-15150", minutes: 120, note: "A lot of standing; bowlers burn more." },
      { key: "fast_bowling", label: "Fast bowling spell", met: 6.0, code: null, minutes: 45, note: "Run-ups add up: priced a notch higher." },
    ],
  },
  {
    key: "football",
    name: "Football",
    variants: [
      { key: "casual", label: "Casual / 5-a-side", met: 7.0, code: "15610", minutes: 60, note: "Compendium 15610: casual, general." },
      { key: "match", label: "Competitive match", met: 10.0, code: "15605", minutes: 90, note: "Compendium 15605: competitive." },
      { key: "drills", label: "Drills / practice", met: 6.0, code: null, minutes: 60, note: "Passing and shooting drills." },
    ],
  },
  {
    key: "badminton",
    name: "Badminton",
    variants: [
      { key: "social", label: "Social doubles", met: 5.5, code: "LI-15030", minutes: 60, note: "Compendium 15030: social, general." },
      { key: "singles", label: "Competitive singles", met: 7.0, code: "15020", minutes: 45, note: "Compendium 15020: competitive." },
    ],
  },
  {
    key: "kabaddi",
    name: "Kabaddi",
    variants: [
      { key: "practice", label: "Practice", met: 6.0, code: null, minutes: 60, note: "Raids, holds and footwork drills." },
      { key: "match", label: "Match", met: 8.0, code: null, minutes: 40, note: "Two 20-minute halves of sprints and tackles." },
    ],
  },
];

const round1 = (v: number) => Math.round(v * 10) / 10;

export function sportKcal(met: number, weightKg: number | null | undefined, minutes: number): number {
  return round1((met * (weightKg ?? DEFAULT_WEIGHT_KG) * Math.max(0, minutes)) / 60);
}

export function findVariant(sportKey: string, variantKey: string): { sport: Sport; variant: SportVariant } | null {
  const sport = SPORTS.find((s) => s.key === sportKey);
  const variant = sport?.variants.find((v) => v.key === variantKey);
  return sport && variant ? { sport, variant } : null;
}

// ---------------------------------------------------------------- steps

/** Stride ≈ 0.415 × height (walking); 0.72 m when height is unknown. */
export function strideM(heightCm: number | null | undefined): number {
  return heightCm && heightCm > 100 && heightCm < 230 ? Math.round(heightCm * 0.415) / 100 : 0.72;
}

/** Walking pace from cadence: easy ~ 90 steps/min (MET 3.0), brisk ~ 110 (3.5–4.3), very brisk 125+ (5.0). */
export const STEP_PACES = [
  { key: "easy", label: "Easy stroll", cadence: 90, met: 3.0 },
  { key: "brisk", label: "Brisk walk", cadence: 110, met: 4.3 },
  { key: "fast", label: "Very brisk", cadence: 125, met: 5.0 },
] as const;

/**
 * Steps → distance, minutes and kcal. `net` subtracts resting (1 MET) so steps already counted
 * elsewhere in the day aren't double-counted against the resting burn in the target.
 */
export function stepsBurn(steps: number, input: { weightKg?: number | null; heightCm?: number | null; pace?: (typeof STEP_PACES)[number]["key"] }): { km: number; minutes: number; kcal: number; met: number } {
  const s = Math.max(0, Math.round(steps));
  const pace = STEP_PACES.find((p) => p.key === (input.pace ?? "brisk")) ?? STEP_PACES[1];
  const km = Math.round(((s * strideM(input.heightCm)) / 1000) * 100) / 100;
  const minutes = Math.max(1, Math.round(s / pace.cadence));
  const kcal = round1(((pace.met - 1) * (input.weightKg ?? DEFAULT_WEIGHT_KG) * minutes) / 60);
  return { km, minutes, kcal, met: pace.met };
}
