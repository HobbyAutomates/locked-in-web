# v2.13 spec: shared rules for web + Android

Both apps must produce the **same numbers**. Port the logic 1:1: web `src/lib/*.ts`, Android `util/*.kt`. Put the same test vectors in both (web `scripts/check-*.ts`, Android unit test or a `main` check).

- Database: `supabase/schema_v36.sql`. Not applied yet; the owner applies it at release. Every feature must degrade gracefully while it's missing: hide the feature or show "Coming with the next update".
- Safety rules: read `C:\Users\Aditya\LockedIn-backups\science-spec.md` and the existing `goals.ts` / `Goals.kt`. Under-18 rules always win.

## 1. Pro tier
- `profiles.plan` is `'free' | 'beta' | 'pro'`, and `profiles.pro_until` is a timestamptz.
- **hasPro** = plan ∈ {beta, pro} and (pro_until is null or in the future). If the column is missing (v36 not applied), hasPro = **true**.
- Price comes from `app_config.pro` = `{price_inr: 700, period: "month", beta_all_pro: true, payments_enabled: false}`. Fallback when missing: ₹700 / month.
- **Everyone is on 'beta' for now.** That includes existing and new users; the column default is 'beta'. Clients can't change plan (DB trigger guard).
- Pro features: adaptive weekly targets, what-to-eat, restaurant menu scan, recipe builder, micronutrient dashboard, fasting timer, routines/planner, PR charts, muscle map, weekly/monthly recap, share cards, before/after slider.
  - Free forever: logging, scanning photo/barcode/label, squads, water, progress basics, body measurements, progress photos.
- UI:
  - a small "PRO" chip on Pro features
  - a Pro screen (from Profile → a "Locked In Pro" row): benefits list, "₹700 / month", and a "Beta tester: every Pro feature is free for you" banner. The button says "You're in the beta" (disabled), because payments aren't enabled.
  - Paywall logic exists and is tested, but can't trigger while everyone is on beta.

## 2. Notifications
- **Inbox:** `bandlog.notifications` (kinds nudge | protein | fasting | checkin | system). A DB trigger writes a 'nudge' row whenever someone nudges you.
- **Web push**, which is what iPhone users need, because iOS only allows push for the home-screen app on iOS 16.4+:
  - VAPID keys via env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:), `CRON_SECRET`. The owner sets them at release.
  - Service worker `public/sw.js` handles push and notificationclick (open `url`).
  - Subscribe UI in Preferences → Notifications, plus a one-time prompt after the first nudge or on Home. On iPhone, explain the "Add to Home Screen" requirement when not standalone.
  - Store subscriptions in `push_subscriptions`.
- **Dispatch:** `POST /api/push/dispatch` sends every notification with pushed_at null.
  - Called with `{userId}` by the nudging client right after a nudge (web **and Android**; Android calls the web URL with the user's bearer token).
  - Also called by the cron with `Authorization: Bearer CRON_SECRET` for everyone.
  - Only sends pending rows. Sets pushed_at. Deletes subscriptions that return 404/410.
- **Cron:** `/api/cron/tick` (Bearer CRON_SECRET), every 15 min. A GitHub Actions workflow `.github/workflows/cron.yml` curls it; the owner sets repo secrets `CRON_URL` and `CRON_SECRET`. It:
  - (a) creates the protein nudge for users whose local time just passed `protein_nudge_time` (timezone Asia/Kolkata unless the app stores one)
  - (b) creates fasting "goal reached" notices
  - (c) creates Monday check-in notices
  - (d) dispatches everything
- **Android** has no FCM project, so:
  - WorkManager checks the inbox every 15 min, plus on app open, and posts local notifications for unread rows it hasn't shown yet (tracked locally). It marks read_at when the notification is tapped.
  - The protein nudge and fasting-done alarms are also scheduled locally with AlarmManager (the existing MealAlarms pattern), so they're on time.
  - Tapping a nudge notification opens Squad.

## 3. Protein nudge
- Runs at `protein_nudge_time` (default 16:00) when `protein_nudge` is true.
- Condition: today's protein < 70 % of target **and** the user logged something today.
- Text: "You're {short} g short on protein" with body "Try {3 picks}". The picks come from what-to-eat (§6), limited to the diet mode.
- Never for users under 18 whose goal is loss.
- At most one per day.

## 4. Diet modes (`profiles.diet_mode`)
Protein uses g per kg of **goal-adjusted body weight**, the same base as the current goals.ts. Carbs and fat are % of calories after protein. Food filters apply to suggestions, what-to-eat and quick picks; they never block logging.

| mode | protein | carbs / fat | food filter | notes and sources |
|---|---|---|---|---|
| balanced | current default | current default | none | ICMR-NIN 2020 RDA / current app |
| high_protein | 2.0 g/kg (adults), 1.6 g/kg (under 18) | fat 25 %, carbs rest | none | ISSN position stand 2017: 1.4–2.0 g/kg for active people |
| vegetarian | 1.6 g/kg | default | no meat, fish, egg | lacto-vegetarian |
| eggetarian | 1.6 g/kg | default | no meat, fish | |
| vegan | 1.8 g/kg (plant-protein digestibility, +10–15 %) | default | no meat, fish, egg, dairy, ghee, honey, paneer, curd | Academy of Nutrition & Dietetics 2016 position |
| jain | 1.6 g/kg | default | vegetarian, plus no onion, garlic, potato, carrot, beetroot, radish, ginger, or other roots/tubers; no honey | |
| keto | 1.6 g/kg | carbs ≤ 50 g/day, fat rest | none | **Adults only.** Warning: not for pregnancy, type 1 diabetes, or people on diabetes/BP medicines without a doctor |
| low_carb | 1.8 g/kg | carbs 26 % of kcal (≤ 130 g), fat rest | none | Feinman 2015 definition. Adults only |
| mediterranean | ≥ 1.2 g/kg | fat 35 %, carbs rest | none | PREDIMED |

- Under 18: only balanced, high_protein (capped), vegetarian, eggetarian, vegan and jain can be picked. Others show "Not recommended under 18".
- Each mode has a "The science" sheet with its 1–2 line rationale and source.
- Switching mode recalculates the macro targets. Calories are unchanged. It asks for confirmation and can be undone.

## 5. Adaptive weekly targets (`profiles.adaptive_targets`, off by default)
Needs ≥ 10 of the last 14 days with ≥ 1 food log, and ≥ 4 weigh-ins in the last 14 days. Otherwise the check-in says what's missing.

1. Daily weight series for the last 21 days, forward-filling gaps (no extrapolation before the first weigh-in).
2. Trend = EWMA with alpha 0.1, seeded with the first weigh-in.
3. slope_kg_per_day = least-squares slope of the trend over the last 14 days. trend_kg_per_week = slope × 7.
4. avg_kcal = mean kcal on the logged days among the last 14.
5. TDEE_est = avg_kcal − slope_kg_per_day × 7700.
6. goal_rate_kg_per_week = the current goal speed (negative for loss, 0 for maintain). raw = TDEE_est + goal_rate_kg_per_week × 7700 / 7.
7. new_target = clamp(raw, old_target − 150, old_target + 150), then clamp to the safety floor/ceiling from goals.ts (teen and age floors included), then round to the nearest 10.
8. Reason text in plain English, for example: "Your weight trend is −0.3 kg/week (goal −0.5) and you ate about 2,180 kcal a day, so your burn is about 2,510. Lowering your target by 110 kcal."

- Runs every Monday (or on first open after Monday). Stores or updates `weekly_checkins` (unique user, week_start).
- The check-in card offers **Apply**, which sets calorie_target, recomputes macros per diet mode and sets applied = true, or **Keep current**. It never auto-applies.
- Test vectors (both apps must match):
  - 14 days of 2,200 kcal with the trend falling exactly 0.5 kg/week, goal −0.5, old target 2,200 → TDEE 2,750, raw 2,200, new 2,200.
  - Same data but goal −0.75 → raw 1,925, clamped to 2,050.
  - Trend flat, 2,000 kcal, goal −0.5, old 2,000 → TDEE 2,000, raw 1,450, clamped to 1,850.

## 6. What should I eat?
- Takes today's remaining kcal/protein/carbs/fat and the diet mode filter.
- Ranks Indian dishes from the existing presets and foods DB by: protein per 100 kcal (weight 0.5), fitting inside the remaining kcal (0.3), and closeness to the time of day's meal type (0.2).
- Shows the top 5 with portion, kcal and protein. One tap logs it into the right meal.
- Also offers "Your usual" picks from the user's own frequent foods.

## 7. Fasting timer (`fasting_sessions`)
- Protocols 12:12, 14:10, 16:8, 18:6, 20:4, and custom 1–72 h. `profiles.fasting_hours` stores the default.
- Start/stop. A ring counts up to the target and shows the stages: fed → fat-burning 12 h+ → ketosis 18 h+. Use soft wording, not medical claims.
- History of the last 14 fasts. A notification fires when the target is reached.
- **Hidden for under-18s and for anyone with an eating-disorder safety flag, if the app has one.** Show "Not available under 18".

## 8. Recipe builder (`recipes`)
- Add ingredients using the same food search as logging, with grams. Set servings (and an optional cooked weight).
- Totals and per-serving macros/micros are computed by the client and stored in per_serving.
- "Log a serving" logs it as a meal item named after the recipe, with source "Your recipe".
- Edit or delete. Listed under Log → Recipes.

## 9. Micronutrient dashboard
- Uses the micros the app already computes: fibre, sugar, sodium, iron, calcium, vitamin C, potassium (use whatever the data has).
- Targets from ICMR-NIN 2020 RDA by age and sex; sugar < 10 % of kcal per WHO; sodium < 2,000 mg per WHO.
- Today and 7-day average bars, and "low this week" hints with Indian food suggestions.

## 10. Restaurant menu scan
- New server route `POST /api/scan-menu` (web). Android calls it too.
- Takes a photo of a menu and returns the dishes with estimated kcal/protein range per portion, a best-pick flag for the user's remaining macros and diet mode, and a confidence per dish.
- Uses the existing model router: Claude Haiku first, Sonnet fallback, same as the label scan.
- Saved to `label_scans` with kind 'menu'. One tap logs a dish.
- Scan mode chip "Menu" sits next to the other scan modes.

## 11. Body measurements and progress photos
- `body_measurements`: waist, chest, hips, neck, arm, thigh, calf, body-fat %. An entry sheet, a small chart per measure, and history with edit and delete.
- Waist on the BMI card uses the latest measurement (fall back to profiles.waist_cm).
- Progress photos (`progress_photos`: date, path, note, weight_kg, pose):
  - add (camera or gallery)
  - **edit** date, note, weight and pose
  - **delete** the row and the storage object, with confirmation and Undo
  - a grid grouped by month
- **Before/after slider:** pick two photos, then drag a vertical divider to compare. It shows dates, the weight change and the days between.
- "Share to squad" posts a photo as a squad post (group_posts kind 'photo' already exists) **only after explicit confirmation**, since progress photos are private by default.

## 12. Training: routines, rest timer, PR charts, muscle map
- **Routines** (`routines.days`):
  - Templates: Push/Pull/Legs, Upper/Lower, Full body 3×, Bro split.
  - Build your own: days → exercises from the library, with sets, reps and rest.
  - One active routine drives a "Today's session" card on Home/Log. Tapping it starts the workout pre-filled.
- **Live workout mode:** set-by-set checklist; after each set a **rest timer** counts down (default 90 s, per-exercise rest_s), with vibration and sound at 0. Android adds an ongoing notification with the countdown; web uses in-page plus a notification if permission is granted.
- **PR charts:** per-exercise history, charting the best set per session and estimated 1RM (Epley: w × (1 + reps/30)). PR badges when beaten.
- **Muscle map:**
  - Front and back human figure (SVG on web, vector/Canvas on Android), about 18 regions: chest, front delts, side delts, rear delts, biceps, triceps, forearms, abs, obliques, traps, lats, upper back, lower back, glutes, quads, hamstrings, calves, adductors.
  - Each library exercise maps to primary and secondary muscles, using standard kinesiology. Both apps use this same mapping; web's `src/lib/muscles.ts` is the source list and Android copies it verbatim.
  - Shown on each exercise (primary solid accent, secondary lighter), on a routine day, and as a weekly "muscles trained" heat map (sets per muscle this week, with the evidence-based 10–20 sets/week guideline).

## 13. Social: share cards and recaps
- **Share cards:** 1080×1920 story images for a PR, a streak, today's summary and the recap, in the app's premium style, sized for Instagram Stories.
  - Web: canvas → Web Share API with the file (works on iPhone), fallback download.
  - Android: render the bitmap → share intent, with an "Instagram Stories" target when Instagram is installed (`com.instagram.share.ADD_TO_STORY`), else the normal chooser.
  - Respect hide_numbers (no kcal on cards).
- **Weekly and monthly recap ("vlog"):**
  - Full-screen story player: auto-advancing slides with the premium motion (blur-rise, count-ups, bars growing, lines drawing), tap to go back or forward, hold to pause.
  - Slides: days logged, workouts and minutes, protein days hit, best lift / PR, weight trend, top foods, streak, squad rank, "next week" goal.
  - Weekly appears on Monday for the previous Mon–Sun; monthly on the 1st for the previous month. Both are also on Progress → Recaps.
  - The last slide has "Share" (story card).

## 14. Items from the v2.12 backlog (both apps)
- **Move a meal between meal times:** long-press and drag a logged meal onto another section (Breakfast / Lunch / Dinner / Snacks), plus tap → "Move to…" menu (the accessible path). Updates the meal type field the app already uses. Moving updates squad posts only if that's already wired.
- **Edit-meal item cards:**
  - full names (wrap to 2 lines; tap expands)
  - richer ⓘ sheet: AI estimate vs database match, the source name and link, the confidence level (low/medium/high) with a one-line why, the gram range, per-item macros
  - a more informational card layout
- **Scroll bug:** "What's new" and any other sheet/dialog/card that can't scroll must scroll. Audit all sheets.
- **Android only:** live camera preview in the scan frame (CameraX + CAMERA permission, with a graceful fallback to the camera app when denied) and a Flash toggle.
