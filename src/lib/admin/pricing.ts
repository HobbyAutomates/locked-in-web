import type { UsageEntry } from "@/lib/usage";

/**
 * Rough $ per million tokens, for the admin cost estimate only (Anthropic list prices as of
 * 2026-09; cache reads 0.1x input, cache writes 1.25x input). Models not listed here (Gemini,
 * Qwen, self-hosted OCR, ...) show tokens but no cost. Edit this table when prices or routes change.
 */
const PRICES: { prefix: string; in: number; out: number }[] = [
  { prefix: "claude-sonnet-5", in: 2, out: 10 },
  { prefix: "claude-sonnet-4", in: 3, out: 15 },
  { prefix: "claude-haiku-4-5", in: 1, out: 5 },
  { prefix: "claude-opus-5", in: 5, out: 25 },
];

export function priceFor(model: string) {
  return PRICES.find((p) => model.startsWith(p.prefix)) ?? null;
}

/** Estimated USD for one usage entry, or null when the model isn't priced. */
export function costOf(u: UsageEntry): number | null {
  const p = priceFor(u.model ?? "");
  if (!p) return null;
  return ((u.in ?? 0) * p.in + (u.out ?? 0) * p.out + (u.cache_read ?? 0) * p.in * 0.1 + (u.cache_write ?? 0) * p.in * 1.25) / 1e6;
}
