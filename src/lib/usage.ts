import type { RawUsage } from "@/lib/ai/types";

/**
 * Token usage for one call, attached to whatever gets persisted (label_scans.report.usage). The
 * per-call console.log line itself is now emitted by the router (src/lib/ai/router.ts) — this just
 * shapes a `run()` result into the entry that gets folded into a saved report.
 */
export type UsageEntry = { route: string; model: string; in: number; out: number; cache_read?: number; cache_write?: number };

export function toUsageEntry(route: string, model: string, u: RawUsage): UsageEntry {
  return { route, model, in: u.in, out: u.out, ...(u.cache_read ? { cache_read: u.cache_read } : {}), ...(u.cache_write ? { cache_write: u.cache_write } : {}) };
}
