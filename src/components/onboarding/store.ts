"use client";

import type { MealItem } from "@/lib/types";
import type { MealType } from "@/lib/mealType";
import type { OnbAnswers } from "@/lib/onboardingV2";

/**
 * v2.14: the onboarding keeps everything on the device until the account exists (value first:
 * the first log happens before any sign-up). `done` = the pledge was taken and the plan is waiting
 * to be saved; /start replays it through /api/onboarding/finish as soon as there's a session.
 */
export const ONB_KEY = "li_onb_v2";
const DEVICE_KEY = "li_device_id";

export type FirstLog = { text: string; items: MealItem[]; meal_type: MealType; date: string };

export type OnbState = {
  step: number;
  answers: OnbAnswers;
  firstLog: FirstLog | null;
  /** Screen 12: "Invite a buddy" (after save) or a squad code to join. */
  buddy: "invite" | "later" | null;
  squadCode: string | null;
  units: { height: "cm" | "ftin"; weight: "kg" | "lb" };
  done: boolean;
  savedAt: number | null;
};

export const EMPTY: OnbState = { step: 0, answers: {}, firstLog: null, buddy: null, squadCode: null, units: { height: "cm", weight: "kg" }, done: false, savedAt: null };

export function loadOnb(): OnbState | null {
  try {
    const raw = window.localStorage.getItem(ONB_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<OnbState>;
    return { ...EMPTY, ...v, answers: { ...(v.answers ?? {}) }, units: { ...EMPTY.units, ...(v.units ?? {}) } };
  } catch {
    return null;
  }
}

export function saveOnb(s: OnbState) {
  try {
    window.localStorage.setItem(ONB_KEY, JSON.stringify(s));
  } catch {
    // Private mode / full storage: the flow still works for this visit.
  }
}

export function clearOnb() {
  try {
    window.localStorage.removeItem(ONB_KEY);
  } catch {
    // nothing to clear
  }
}

/** A random id per browser, for the signed-out parse preview's rate limit. Never tied to a person. */
export function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}
