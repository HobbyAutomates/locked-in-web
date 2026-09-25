"use client";

import { todayIso, type TargetEdit } from "./goals";

/**
 * v2.10 on-device log of calorie-target and goal-weight edits, read by the "repeated lowering"
 * safety flag (goals.ts downwardEdits). Kept in localStorage only — the database has no edit
 * history — so it is per device; Android keeps the same list in SharedPreferences.
 */
const KEY = "lockedin-target-edits";

export function readEdits(): TargetEdit[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.date === "string" && typeof e.from === "number" && typeof e.to === "number") : [];
  } catch {
    return [];
  }
}

/** Remember one change (no-op when nothing moved); keeps the newest 30. */
export function recordEdit(field: TargetEdit["field"], from: number | null | undefined, to: number | null | undefined): TargetEdit[] {
  const list = readEdits();
  if (from == null || to == null || !(from > 0) || !(to > 0) || Math.abs(from - to) < 1e-9) return list;
  const next = [{ date: todayIso(), field, from, to }, ...list].slice(0, 30);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the flag just can't see history */
  }
  return next;
}
