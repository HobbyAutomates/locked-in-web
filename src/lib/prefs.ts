"use client";

import { useSyncExternalStore } from "react";

/**
 * "Add burned calories back" — a per-device preference like Android's ThemePrefs.setBurned.
 * When on, today's exercise burn is added to the calorie budget on Home.
 */
const KEY = "lockedin-burned-back";
const listeners = new Set<() => void>();
let snapshot: boolean | null = null;

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
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

/** Renders as off on the server, then settles to the stored value. */
export function useBurnedBack(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function setBurnedBack(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Non-fatal: the in-memory value still applies for this session.
  }
  snapshot = on;
  listeners.forEach((l) => l());
}
