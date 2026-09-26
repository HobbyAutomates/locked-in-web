# v2.14 spec: Gen Z onboarding, AI coach with memory, buddy streaks, in-app colour

Source plan: `LockedIn-backups/ai-coach-and-onboarding-plan.md`. Designs: canvas page "Onboarding 01 · brand v1".
Schema: `docs/schema_v37.sql` (not applied yet; every feature below degrades when it's missing).

## Brand tokens (both platforms)

| Token | Dark | Light |
|---|---|---|
| ink (page) | #0B0B0C | #F4F1EA (bone) |
| surf (cards) | #141416 | #FFFFFF |
| surf2 | #1D1D20 | #EAE6DD |
| text | #F4F1EA | #0B0B0C |
| mute | #8F8A82 | #6E6962 |
| line | rgba(244,241,234,.09) | rgba(11,11,12,.10) |
| ember | #FF5B1F | #FF5B1F (tint #FBE3D8) |
| iris (coach only) | #8B7BFF | #6B5CE6 |
| mint (on track only) | #59E3A7 | #1F9D6B (darker for contrast on bone) |

Ember only on: the + button, the streak flame, "you" in squad lists, the one primary action per screen.
Charts, rings and bars are mono. Done = solid, remaining = 45° hatch.

## Onboarding order (17)
1 Source · 2 Goal · 3 First log · 4 Result + coach note · 5 Day-1 streak · 6 Height + weight (+ age, sex) ·
7 Target + pace (no date) · 8 Training days + sports · 9 Eater type · 10 Obstacles · 11 Coach style ·
12 Buddy / squad · 13 First challenge · 14 Building · 15 Reveal (goal date) · 16 Hold-to-lock-in · 17 Save (account).

Keys: heard_from `instagram|youtube|friend|college_gym|search|other`; goal `lose|gain|recomp|habits`
(recomp is stored as goal_type `lose` with the pace picker, habits as `maintain`); obstacles
`exam_stress|mess_food|late_night|no_time|eating_out|lost_motivation`; sports free chips
(`gym, home, running, cricket, football, yoga, badminton, walking`); coach_style `calm|balanced|no_excuses`;
first_challenge `protein_7|perfect_week|no_maggi_30`.
Under 18: no loss pace (growth-safe note), coach capped at Balanced, diet modes keto / low carb hidden, no fasting.

The first log happens before the account exists: the parsed meal is kept on the device (web localStorage
`li_onb_v2`, Android DataStore) and replayed into `meals` by `/api/onboarding/finish` after sign-up.

## API (web; Android calls the same routes with `Authorization: Bearer <supabase access token>`)

### Onboarding
- `POST /api/parse-meal` signed out: body `{ text, preview: true }`, header `X-Device-Id: <uuid>`. Same
  `ParseResult` as signed in; no DB writes; 429 `{error}` past 12 parses / hour / device+IP.
- `POST /api/onboarding/plan` (no auth) body `OnbAnswers` → `{ targets: {calories, protein, carbs, fat, fiber},
  goal_date: "yyyy-MM-dd" | null, weeks: number | null, pace_kg_wk: number, teen: boolean, reasons: string[],
  honest: string }`.
- `POST /api/onboarding/finish` (auth) body `{ mode: "full" | "tune", answers: OnbAnswers, first_log?: { text,
  meal_type, date, items: MealItem[] } }` → `{ ok, targets, goal_date, v37: boolean }`. Saves the profile + targets
  + diet mode, sets `onboarded_v2`, seeds coach memories from the answers, replays the first meal once.
  `mode: "tune"` (existing users' "Tune your plan") only saves coach_style / obstacles / training_days / sports.

`OnbAnswers = { heard_from?, goal?, height_cm?, weight_kg?, dob?, gender?, goal_weight_kg?, pace?: "chill"|"steady"|"aggressive",
training_days?, sports?: string[], diet_mode?, obstacles?: string[], coach_style?, first_challenge?, name? }`

### Coach
- `GET /api/coach/note` → `{ available, note: { date, text, style, kind, created_at } | null }`. Generates today's
  morning note lazily once local time (India) is past `coach_note_time`; the 15-minute cron does the same plus
  the 8 pm "nothing logged" nudge and pushes a `coach` notification.
- `GET /api/coach/chat?limit=60` → `{ available, style, messages: CoachMessage[] }` (oldest first).
- `POST /api/coach/chat` `{ message, image?: base64 jpeg, date? }` → `{ user: CoachMessage, reply: CoachMessage,
  learned: Memory[], safety: boolean }`. Haiku by default, Sonnet when an image is attached.
- `DELETE /api/coach/chat` → `{ ok }` (deletes history). `GET /api/coach/export` → JSON file of chat + memories.
- `GET /api/coach/memory` → `{ available, remember, memories: Memory[] }`; `POST` `{ text, kind }`;
  `PATCH` `{ id, kept?: true, pinned?: boolean }`; `DELETE ?id=` (soft delete).
- Coach settings are plain profile columns (PATCH them like any other): `coach_style, coach_note_time,
  coach_quiet_from, coach_quiet_to, coach_weekly_roast, coach_remember`.

`CoachMessage = { id, role: "user"|"coach", text, tool: { cards?: CoachCard[], safety?: true } | null, created_at }`

`CoachCard` (render as small cards under the coach bubble):
- `{ type: "meal_logged", meal_id, meal_type, title, kcal, protein_g }` → "Logged · Dinner"
- `{ type: "water_logged", ml }`
- `{ type: "remaining", kcal, protein, carbs, fat }`
- `{ type: "suggestions", items: [{ name, portion, kcal, protein }] }`
- `{ type: "fast_started", hours }`
- `{ type: "memory", id, kind, text }` → "Learned: … Keep / Forget"
- `{ type: "helpline" }` → the helpline card (goals.ts HELPLINES / Android Goals.kt)

`Memory = { id, kind: "goal"|"food"|"life"|"body"|"style", text, source, pinned, kept, created_at }`

### Buddies (Supabase RPCs, schema bandlog)
`buddy_invite() → text` · `buddy_invite_info(invite) → {name, avatar_path}` · `buddy_accept(invite) → uuid` ·
`my_buddies() → {id, partner_id, partner_name, partner_avatar, streak, best, me_today, partner_today,
last_both_logged_on, created_at}[]` · `buddy_nudge(buddy uuid) → boolean`. Invite link: `<app>/buddy/<CODE>`.

### Milestones
Keys `streak_7`, `streak_30`, `streak_100`, `goal_reached`, `pr:<exercise>:<date>` (PRs set in the last 2 days only).
Seen keys go to `profiles.milestones_seen` (append) and to local storage (fallback when v37 isn't applied).
