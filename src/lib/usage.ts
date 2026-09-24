import type Anthropic from "@anthropic-ai/sdk";

/**
 * Token usage for one Claude call, attached to whatever gets persisted (label_scans.report.usage)
 * and logged as one structured line per call so Railway logs can be summed by route/model.
 */
export type UsageEntry = { route: string; model: string; in: number; out: number; cache_read?: number; cache_write?: number };

/** Anthropic's usage block, widened for the cache fields the SDK types don't always expose. */
type AnthropicUsage = Anthropic.Usage & { cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

/**
 * Extracts input/output/cache tokens from an Anthropic response's `usage`, logs
 * `{"evt":"llm_usage",route,model,in,out,...}` (one line per call), and returns the entry so callers
 * can attach it to a persisted report. Never throws — a logging hiccup must never fail a scan.
 */
export function logUsage(route: string, model: string, usage: AnthropicUsage | undefined | null): UsageEntry {
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? undefined;
  const cacheWrite = usage?.cache_creation_input_tokens ?? undefined;
  const entry: UsageEntry = { route, model, in: inTok, out: outTok, ...(cacheRead ? { cache_read: cacheRead } : {}), ...(cacheWrite ? { cache_write: cacheWrite } : {}) };
  try {
    console.log(JSON.stringify({ evt: "llm_usage", ...entry }));
  } catch {
    // logging must never block a scan
  }
  return entry;
}
