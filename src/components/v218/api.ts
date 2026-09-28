"use client";

import { useCallback, useEffect, useState } from "react";

/** v2.18 coach stream: tiny JSON helpers for the /api/coach/* routes (same routes Android calls). */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/coach/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? "Something went wrong. Try again?");
  return out;
}

/** GET on mount; `null` while loading, `false` when the route failed (the card hides). */
export function useCoachJson<T>(path: string | null): { data: T | null | false; set: (v: T) => void; reload: () => void } {
  const [data, setData] = useState<T | null | false>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path)
      .then((d) => live && setData(d))
      .catch(() => live && setData(false));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, set: setData, reload };
}
