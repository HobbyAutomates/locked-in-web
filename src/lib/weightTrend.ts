/**
 * Pure helpers for the Progress screen's weight trend card. No React, no dates lib — just numbers,
 * so `scripts/check-weight-trend.ts` can exercise them without a DOM or a DB.
 */

/**
 * A trailing moving average over `window` entries (oldest → newest order in, same order out).
 * The first `window - 1` points average over whatever came before them (partial window) rather
 * than being dropped, so the line starts at the first data point instead of 6 entries in.
 */
export function movingAverage(values: number[], window = 7): number[] {
  if (window < 1) throw new Error("window must be >= 1");
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    const n = Math.min(i + 1, window);
    out.push(sum / n);
  }
  return out;
}
