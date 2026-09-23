import type { Profile } from "./types";

/** Set by "Skip for now"; keeps the (app) layout from bouncing an incomplete profile to /onboarding. */
export const ONBOARD_SKIP_COOKIE = "li_onboard_skip";

/** True when the profile still lacks the body details onboarding collects. */
export function needsOnboarding(p: Profile) {
  return p.weight_kg == null || p.height_cm == null || !p.dob;
}
