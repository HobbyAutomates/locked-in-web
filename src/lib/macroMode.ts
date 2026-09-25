"use client";

import { useSyncExternalStore } from "react";

/**
 * v2.10: Home's calorie + macro cards show either what's "left" or what's been "eaten". Tapping any
 * card flips them all; the choice is remembered per device (localStorage, like lib/dismiss.ts;
 * Android keeps it in SharedPreferences "home_prefs"). A "Tap to switch" hint shows until the first tap.
 */
export type MacroMode = "left" | "eaten";

const MODE_KEY = "lockedin-macro-mode";
const HINT_KEY = "lockedin-macro-hint-seen";
const listeners = new Set<() => void>();
let snapshot: string | null = null;

function read(): string {
  try {
    const mode = window.localStorage.getItem(MODE_KEY) === "eaten" ? "eaten" : "left";
    const seen = window.localStorage.getItem(HINT_KEY) === "1" ? "1" : "0";
    return `${mode}|${seen}`;
  } catch {
    return "left|1";
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

/** The current mode, and whether the hint is still due (never during the server render). */
export function useMacroMode(): { mode: MacroMode; showHint: boolean } {
  const s = useSyncExternalStore(subscribe, getSnapshot, () => "left|1");
  const [mode, seen] = s.split("|");
  return { mode: mode === "eaten" ? "eaten" : "left", showHint: seen !== "1" };
}

/** Flip left ⇄ eaten for every card, and retire the hint. */
export function toggleMacroMode() {
  const [mode] = getSnapshot().split("|");
  const next: MacroMode = mode === "eaten" ? "left" : "eaten";
  try {
    window.localStorage.setItem(MODE_KEY, next);
    window.localStorage.setItem(HINT_KEY, "1");
  } catch {
    // Non-fatal: it flips for this session only.
  }
  snapshot = `${next}|1`;
  listeners.forEach((l) => l());
}
