/**
 * The web app's own version, for the Profile → App card and /api/version. Bump with every release
 * (matches the Android versionName) and add a CHANGELOG entry — iPhone users have no APK to update,
 * so this page is how they find out what changed.
 */
export const APP_VERSION = "1.9";

export type ChangelogEntry = { version: string; date: string; lines: string[] };

/** Newest first. Plain English, 1–3 lines each. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.9",
    date: "2026-09-24",
    lines: [
      "Indian food presets with real serving sizes — dal, roti, sabzi, chai and 140+ more, in English and Hindi. Tap a preset, pick 1 katori or 2 roti, done.",
      "Log exact quantities anywhere: grams, ml, kg or servings, with a live calorie preview. Search 3,000+ foods, and log exactly one serving straight from any scan report.",
      "Built-in voice dictation (English or Hindi), a \"Judge scans for\" preference, better Progress charts and scan infographics.",
    ],
  },
  {
    version: "1.8",
    date: "2026-09-23",
    lines: ["Log exercise → calories burned (run, bands, any activity, or describe it in words).", "Band workouts auto-log their burn; a burned card on Home and Weekly Energy on Progress."],
  },
  {
    version: "1.7",
    date: "2026-09-23",
    lines: ["Scan tab: Label · Barcode · Food photo, with a lens-based report (Protein / Snack / Cutting / Bulking).", "Photograph your plate and get every item with grams, macros and micros; History of every scan."],
  },
  {
    version: "1.6",
    date: "2026-09-22",
    lines: ["Cal AI-style onboarding that builds your plan.", "On-device label reading on Android and an infographic scan report."],
  },
  {
    version: "1.5",
    date: "2026-09-21",
    lines: ["Profile tab with Personal details, Nutrition goals, Goal & weight, Reminders and Weight history.", "Badges page and Progress weight card."],
  },
];

/** Numeric comparison of "1.10" vs "1.9" style versions: > 0 when `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
