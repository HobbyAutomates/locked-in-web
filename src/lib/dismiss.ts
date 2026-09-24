"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device "dismissed" flags for Home cards (the 9 pm wrap for a date, a nudge by id). Stored in
 * localStorage; the server render treats everything as dismissed, so a card only appears once the
 * client has checked — no flash of a card the user already closed.
 */
const KEY = "lockedin-dismissed";
const listeners = new Set<() => void>();
let snapshot: string | null = null;

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
function getSnapshot() {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

/** True when `id` was dismissed on this device (always true during the server render). */
export function useDismissed(id: string): boolean {
  const s = useSyncExternalStore(subscribe, getSnapshot, () => "*");
  return s === "*" || s.split("|").includes(id);
}

export function dismiss(id: string) {
  // Keep the list short: the newest 40 ids are plenty for dates and nudge ids.
  const next = [id, ...getSnapshot().split("|").filter((x) => x && x !== id)].slice(0, 40).join("|");
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Non-fatal: it stays dismissed for this session.
  }
  snapshot = next;
  listeners.forEach((l) => l());
}
