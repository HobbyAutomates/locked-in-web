/**
 * v2.18 B6 cycle-aware guidance. Optional and private (own-row RLS, never shared or shown to a
 * squad). It sets expectations (hunger, scale water), a water nudge and training advice; it never
 * changes calorie targets. Pure; Android util/Cycle.kt.
 */

export type CycleSettings = { enabled: boolean; last_period_start: string | null; cycle_length: number; period_length: number };

export type Phase = "menstrual" | "follicular" | "ovulation" | "luteal";

export type CycleDay = { day: number; phase: Phase; label: string; hunger: string; waterMl: number; training: string; scale: string; nextPeriodIn: number };

export const DEFAULT_CYCLE: CycleSettings = { enabled: false, last_period_start: null, cycle_length: 28, period_length: 5 };

const dn = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function cleanCycle(raw: Record<string, unknown>): CycleSettings {
  const len = Math.round(Number(raw.cycle_length));
  const per = Math.round(Number(raw.period_length));
  const last = typeof raw.last_period_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.last_period_start) ? raw.last_period_start : null;
  return {
    enabled: raw.enabled === true,
    last_period_start: last,
    cycle_length: Number.isFinite(len) ? Math.max(21, Math.min(40, len)) : 28,
    period_length: Number.isFinite(per) ? Math.max(2, Math.min(9, per)) : 5,
  };
}

/** Where `date` falls in the cycle (repeating from the last start), or null when off / unknown / in the future. */
export function cycleDay(s: CycleSettings, date: string): CycleDay | null {
  if (!s.enabled || !s.last_period_start) return null;
  const diff = dn(date) - dn(s.last_period_start);
  if (diff < 0) return null;
  const len = s.cycle_length;
  const day = (diff % len) + 1;
  const ovu = len - 14; // ovulation ≈ 14 days before the next period
  let phase: Phase;
  if (day <= s.period_length) phase = "menstrual";
  else if (day < ovu - 1) phase = "follicular";
  else if (day <= ovu + 1) phase = "ovulation";
  else phase = "luteal";
  const info: Record<Phase, Omit<CycleDay, "day" | "phase" | "nextPeriodIn">> = {
    menstrual: { label: "Period", hunger: "Appetite is usually normal; iron-rich food (dal, rajma, spinach, jaggery) helps.", waterMl: 250, training: "Go by feel: lighter sessions, walks or yoga are fine if you have cramps.", scale: "Bloating can add 0.5–1 kg of water. It passes." },
    follicular: { label: "Follicular", hunger: "Hunger is often lower. A good week to stay on target.", waterMl: 0, training: "Energy tends to be high: a good time to push weights and try new bests.", scale: "The scale usually reads truest this week." },
    ovulation: { label: "Ovulation", hunger: "Hunger may tick up slightly.", waterMl: 0, training: "Strong days for many: warm up well, joints can feel looser.", scale: "Small water shifts are normal." },
    luteal: { label: "Luteal", hunger: "Hunger and cravings often rise (your burn goes up ~100–300 kcal too). Protein and fibre first; a planned treat beats a binge.", waterMl: 300, training: "Steady, moderate training. Recovery can feel slower; sleep matters more.", scale: "Water retention can add 0.5–1.5 kg before your period. It's not fat." },
  };
  return { day, phase, ...info[phase], nextPeriodIn: len - day + 1 };
}

/** A short line for the coach's context (private: never shown outside the user's own coach). */
export function cycleLine(c: CycleDay | null): string | null {
  if (!c) return null;
  return `Cycle (private, shared by the user): day ${c.day}, ${c.label.toLowerCase()} phase. ${c.hunger} ${c.scale}`;
}
