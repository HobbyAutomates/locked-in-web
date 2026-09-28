/**
 * v2.18 D10 transformation story: the timeline maths (pure). Progress photos oldest → newest, each
 * with the weight logged that day (or the nearest one within 7 days), the change since the first,
 * and the reel's timing. Web records the reel with canvas + MediaRecorder (StoryScreen); Android
 * shares the frames as an image sequence. Android: util/Story.kt.
 */
export type StoryFrame = { date: string; url: string | null; kg: number | null; delta: number | null; dayIndex: number };

export const FRAME_MS = 1400;
export const FADE_MS = 350;
export const INTRO_MS = 1600;
export const OUTRO_MS = 2200;
export const MAX_FRAMES = 24;
export const STORY_OPTIN_KEY = "li-story-optin";

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);

/** The weight for a day: that day's entry, else the nearest within `window` days, else null. */
export function weightNear(date: string, weights: { date: string; weight_kg: number }[], window = 7): number | null {
  let best: { gap: number; kg: number } | null = null;
  const t = dayNum(date);
  for (const w of weights) {
    const gap = Math.abs(dayNum(w.date) - t);
    if (gap <= window && (!best || gap < best.gap)) best = { gap, kg: Number(w.weight_kg) };
  }
  return best ? best.kg : null;
}

/**
 * Frames oldest first, at most MAX_FRAMES (evenly thinned, always keeping the first and last).
 * delta = kg minus the first frame's kg (1 decimal), when both are known.
 */
export function storyFrames(photos: { date: string; url: string | null; weight_kg: number | null }[], weights: { date: string; weight_kg: number }[]): StoryFrame[] {
  const sorted = [...photos].filter((p) => p.url).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let pick = sorted;
  if (sorted.length > MAX_FRAMES) {
    const step = (sorted.length - 1) / (MAX_FRAMES - 1);
    pick = Array.from({ length: MAX_FRAMES }, (_, i) => sorted[Math.round(i * step)]);
  }
  const first = pick[0];
  const firstKg = first ? (first.weight_kg ?? weightNear(first.date, weights)) : null;
  const d0 = first ? dayNum(first.date) : 0;
  return pick.map((p) => {
    const kg = p.weight_kg ?? weightNear(p.date, weights);
    return { date: p.date, url: p.url, kg, delta: kg != null && firstKg != null ? Math.round((kg - firstKg) * 10) / 10 : null, dayIndex: dayNum(p.date) - d0 };
  });
}

/** How long the reel runs, in ms. */
export function reelLength(frames: number): number {
  return frames ? INTRO_MS + frames * FRAME_MS + OUTRO_MS : 0;
}

/** "Day 1" / "Day 43" / "−4.2 kg" captions. */
export function frameCaption(f: StoryFrame): { day: string; change: string | null } {
  const change = f.delta == null || f.dayIndex === 0 ? null : `${f.delta > 0 ? "+" : f.delta < 0 ? "−" : "±"}${Math.abs(f.delta)} kg`;
  return { day: `Day ${f.dayIndex + 1}`, change };
}
