import type { Profile } from "./types";

/** Set by "Skip for now"; keeps the (app) layout from bouncing an incomplete profile to /onboarding. */
export const ONBOARD_SKIP_COOKIE = "li_onboard_skip";

/** True when the profile still lacks the body details onboarding collects. */
export function needsOnboarding(p: Profile) {
  return p.weight_kg == null || p.height_cm == null || !p.dob;
}

/**
 * v2.15 beta: everyone is on plan 'beta', so onboarding can be skipped from every screen (a quiet
 * "Skip" top-right). Signed out it goes to email sign-in and lands on Home with the default
 * targets; signed in it saves nothing and lands on Home ("Tune your plan" covers it later).
 * Android mirrors this with its own constant. Set to false to hide every Skip.
 */
export const BETA_SKIP_ONBOARDING = true;
