"use client";

import { useSyncExternalStore } from "react";

export const THEME_MODES = ["Auto", "Light", "Dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

const KEY = "lockedin-theme";
const listeners = new Set<() => void>();
let snapshot: ThemeMode | null = null;

function read(): ThemeMode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light") return "Light";
    if (v === "dark") return "Dark";
  } catch {
    // Private mode / blocked storage: Auto is the safe default.
  }
  return "Auto";
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

function getSnapshot(): ThemeMode {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

/** The current appearance. Renders as Auto on the server, then settles to the stored value. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => "Auto" as ThemeMode);
}

/** Stores the appearance and applies it to <html data-theme>. */
export function setThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "Auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode.toLowerCase());
  try {
    if (mode === "Auto") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, mode.toLowerCase());
  } catch {
    // Non-fatal: the attribute is already applied for this session.
  }
  snapshot = mode;
  listeners.forEach((l) => l());
}
