/**
 * v2.14: a tiny in-memory fixed-window limiter for the signed-out onboarding preview (first log
 * before the account exists). One Railway instance today, so memory is enough; a restart simply
 * resets the windows. Keys are "<route>:<device id>" and "<route>:<ip>" — both must pass.
 */
type Window = { start: number; count: number };
const windows = new Map<string, Window>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 5000) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}

/** The caller's IP as the proxy reports it (Railway sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
