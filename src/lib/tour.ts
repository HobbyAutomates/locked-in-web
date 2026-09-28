/**
 * v2.16 first-run tour: the five stops and their copy (boards TourF1–TourF5), shared with Android
 * (docs/v216-shared.md). Targets are `data-tour` keys on Home and the bottom bar. Pure data.
 */
export const TOUR_STEPS = [
  { target: "calories", title: "Your day at a glance", text: "Calories left and your macros live here. Tap the card to flip between what’s left and what you’ve eaten." },
  { target: "coach", title: "Your coach", text: "A note every morning. Reply any time: it remembers what you tell it." },
  { target: "fab", title: "Log anything with +", text: "Type it, say it, snap it or scan it. Hinglish is fine: “2 roti aur dal”." },
  { target: "tab-scan", title: "Scan food, labels, barcodes", text: "Point at your plate or a pack. We check the web for the real numbers." },
  { target: "tab-squad", title: "Your squad", text: "Your friends’ meals, streaks and battles. Nudge anyone who goes quiet." },
] as const;

/** Set to "1" on this device once the tour is finished or skipped. */
export const TOUR_DONE_KEY = "li-tour-v216-done";
/** Set to "1" by Preferences → "Replay the tour"; cleared when the tour ends. */
export const TOUR_REPLAY_KEY = "li-tour-v216-replay";

/**
 * v2.17: the tour is for accounts created after the v2.16 release only. Existing users never see it
 * (schema_v41 also marks every existing profile as seen); this client check covers the time before
 * v41 is applied. Android: the same instant in ui/tour/Tour.kt.
 */
export const TOUR_NEW_USERS_FROM = "2026-09-28T21:00:00Z";

/** True when the account was created strictly after the v2.16 release. Unknown / unreadable = false. */
export function isNewForTour(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt.trim().replace(" ", "T"));
  return Number.isFinite(t) && t > Date.parse(TOUR_NEW_USERS_FROM);
}

/**
 * Replay (Preferences → "Replay the tour") always shows, for anyone. Otherwise only a new account
 * (see isNewForTour) that neither this device nor the account (profiles.tour_seen_at) has seen.
 */
export function tourShouldShow(s: { done: boolean; replay: boolean; serverSeen: boolean; createdAt: string | null | undefined }): boolean {
  if (s.replay) return true;
  return !s.done && !s.serverSeen && isNewForTour(s.createdAt);
}
