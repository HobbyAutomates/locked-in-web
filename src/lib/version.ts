/**
 * The web app's own version, for the Profile → App card and /api/version. Bump with every release
 * (matches the Android versionName) and add a CHANGELOG entry — iPhone users have no APK to update,
 * so this page is how they find out what changed.
 */
export const APP_VERSION = "2.11";

export type ChangelogEntry = { version: string; date: string; lines: string[] };

/** Newest first. Plain English, 1–3 lines each. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.11",
    date: "2026-09-26",
    lines: [
      "React to anything in your squad: ❤️ 🔥 👍 😂 😮 💪 on posts and chat messages. Tap the little counts to see who reacted.",
      "Chat now shows who sent each message, ✓✓ Seen by under yours, and unread counts on your squads.",
      "Hide calorie numbers now also covers the 9 pm wrap.",
    ],
  },
  {
    version: "2.10",
    date: "2026-09-25",
    lines: [
      "Tap any of your calorie or macro cards to flip them all between left and eaten, swipe through the cards at the top of Home, and the app uses clean icons now instead of emojis.",
      "Science inside: your BMI with Indian ranges, a healthy weight range for your height, and targets that follow the research, with safe limits on how fast you lose or gain and sources you can read.",
      "Deleting a meal or workout now removes its post from your squads too, and you can delete any of your own squad posts from the ⋯ menu (with Undo).",
      "You decide what gets shared: Privacy → Squad sharing has switches for meals, workouts and PRs, and each squad has its own Auto-post switch.",
      "When a food could be a few things (wheat roti or maida roti?), we ask with one tap, and the ⓘ on every item shows where the numbers come from, with a link to check.",
    ],
  },
  {
    version: "2.8",
    date: "2026-09-25",
    lines: [
      "Home now groups your food into Breakfast, Lunch, Dinner and Snacks, each with its calories and protein and its own + Add. We guess the meal from the time and you can switch it with one tap.",
      "Tap anything you logged to fix it: change the grams or items in a meal, the minutes of a workout, a glass of water or a weigh-in. Delete lives inside, with Undo.",
      "Simpler everywhere: one Log activity button for every kind of workout, water in one tap from +, Progress down to four cards, and photo scans show a gram range and ask one quick question like homemade or restaurant.",
    ],
  },
  {
    version: "2.7",
    date: "2026-09-25",
    lines: [
      "Squad Challenges: start one in any squad (train X of N days, hit your protein X days, or log food every day), watch the ranked board fill up, and get a 🏆 in the feed when you finish.",
      "Squad Food Battle: squads can turn on a daily battle. Whoever eats closest to their own goal wins the day's 👑, and snaps of your meals show up in the squad.",
      "Fixes: editing grams on a scanned plate keeps the macros, \"4 idli\" logs four and \"aadhi roti\" logs half, deleting shows Undo, labels and barcodes read more accurately, and you can log water by voice.",
    ],
  },
  {
    version: "2.6",
    date: "2026-09-24",
    lines: [
      "Water has its own page: set your goal in glasses, watch the bottle fill as you tap + (or − to undo), add a glass, bottle, large bottle or any amount — and get confetti when you hit your goal. Set reminder times and how often you want a nudge to drink.",
      "Squads, rebuilt: pick a username and a profile photo, create a squad with a name, icon and public or private setting, and invite friends with a link (Share, WhatsApp or Copy). Private squads take requests the owner approves.",
      "Every squad has Chat, a Feed where your meals, workouts and gym PRs post by themselves, and a Leaderboard ranked by 🔥 day streak.",
    ],
  },
  {
    version: "2.5",
    date: "2026-09-24",
    lines: [
      "Picking an amount is one big stepper now: roti, egg, idli or a scoop of whey starts at 1 and you tap + for more (tap a food twice on the plate for two). Loose foods get a grams box and three quick sizes; restaurant portion hides under More.",
      "Milk is five different foods: doodh / normal milk is full cream, and toned, double toned, skimmed and buffalo milk each have their own numbers — say \"toned doodh\" and you get toned.",
      "Workouts aren't just bands any more: pick Gym, Bodyweight, Bands, Cardio, Sport or Yoga. Gym and Bodyweight log exercises with weight × reps and show last time's numbers; every kind counts for your streak.",
    ],
  },
  {
    version: "2.4",
    date: "2026-09-24",
    lines: [
      "Real food pictures everywhere: presets, search, your plate, meals on Home and Calendar, repeat meals and scan history — dal khichdi looks like dal khichdi, and branded food shows its own pack.",
      "Scanning has its own tab and the bottom bar is down to five: Home, Squad, Scan, Progress, Profile. Calendar is the button at the top of Home. From a scan, Add to plate opens the meal with it already on.",
      "Preferences are grouped: Appearance, Tracking (water and step goals, calorie rules, scan lens, kg or lb), Reminders, Privacy and Account.",
    ],
  },
  {
    version: "2.3",
    date: "2026-09-24",
    lines: [
      "Progress, rebuilt: current weight with your next weigh-in and a start-to-goal bar, weight and exercise changes over 3 days to all time, daily calories split into protein, carbs and fat, your BMI, and private progress photos.",
      "Log water from Home or the new + menu (Meal, Workout, Exercise, Water, Weight). Exercise gets recent picks, icons and a More section for start time, an intensity slider, distance, steps and notes.",
      "Discover public squads and join in one tap. Nutrition goals gets fiber and sugar targets, and two new Preferences: add burned calories to your goal and roll over up to 200 unused calories.",
    ],
  },
  {
    version: "2.2",
    date: "2026-09-24",
    lines: [
      "A day streak on Home: every day you log a meal, a workout or any exercise keeps the flame going.",
      "Edit your name, birthday and profile photo (it shows on your squad too); Nutrition goals gets Auto-generate with a before → after preview and a Protein / Carbs / Fat split.",
      "Scan history shows a picture or an icon for every scan with a cleaner report up top — plus fixes: workout saves always tell you if something went wrong, and Home stops reloading itself.",
    ],
  },
  {
    version: "2.1",
    date: "2026-09-24",
    lines: [
      "Simpler: one Add-food screen, one Scan button, cleaner Home",
      "Tap a food and it's on your plate; type or say a whole meal and tap Work it out. Save while it's still working and it finishes on its own.",
      "Exercise is one search bar with quick picks, and a new workout can start as \"Same as last time\".",
    ],
  },
  {
    version: "2.0",
    date: "2026-09-24",
    lines: [
      "Squads: create a squad and share its 6-letter code, see who's locked in today, this week's dots and everyone's streak — plus protein and calories for friends who share them. Nudge anyone who hasn't trained yet.",
      "The 9 pm daily wrap: protein, calories, sessions this week and tomorrow's session, on Home from 9 pm (and as a notification on Android).",
      "Restaurant portions: one toggle in the quantity sheet scales the serving ×1.4 and adds the hidden oil; a Restaurant row in Snacks and Protein, and photo estimates notice when you ate out.",
    ],
  },
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
