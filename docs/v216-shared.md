# v2.16 shared contract (web ⇄ Android)

The web app (branch `v216/app` in `C:\Users\Aditya\wt\v214-web-app`) is the source for these ids,
names and rules. Android should use the same values so a cover picked on one device shows the same
on the other, and a badge looks the same everywhere. Spec: `C:\Users\Aditya\LockedIn-backups\v216-spec.md`.
Web sources are named next to each section.

## 1. Schema v40 (written, NOT applied)

`docs/schema_v40.sql` / `docs/revert_v40.sql`:

| column | type | meaning |
|---|---|---|
| `bandlog.profiles.cover_preset` | `text` null | a cover id from §2; null = `plates-light` (default). Check constraint `^[a-z]{2,16}-(light\|dark)$`. |
| `bandlog.profiles.tour_seen_at` | `timestamptz` null | when the first-run tour was finished or skipped on any device. |

Read both in their own query (a DB without v40 must still load the profile). Missing column =
cover lives in local storage, tour uses the device flag only. A write that fails with a
missing-column error is "not stored", not an error. When v40 appears and the server value is null
but the device has a local cover, push the local one up once.

## 2. Profile covers (web `src/lib/covers.ts`, art in `src/lib/coverArt.ts`)

17 motifs × light/dark = 34, in board order (CoverPresets). **#01 `plates-light` is today's
plates cover, drawn exactly as v2.15 did (theme-following), and the default.** #02–#34 are the
board's vector art (390 × 250 viewBox, slice-fitted). Unknown/empty id → `plates-light`.

Picker chips, in order: `All 34` · `Iron` · `Cardio` · `Outdoor` · `Studio` · `Minimal`.
Sheet title "Choose a cover", subtitle "Your photo and name stay the same. Only the background
changes.", "Done" top-right in ember; 3-column grid, 62 px tiles, 14 px corners; the current one has
an ember ring + ember check dot and the label suffix " · current". Tap = choose immediately.
Local key (web localStorage): `li-cover-preset`.

| # | id | name | tone | category |
|---|---|---|---|---|
| 01 | `plates-light` | Plates | light | iron |
| 02 | `plates-dark` | Plates | dark | iron |
| 03 | `dumbbells-light` | Dumbbells | light | iron |
| 04 | `dumbbells-dark` | Dumbbells | dark | iron |
| 05 | `barbell-light` | Barbell | light | iron |
| 06 | `barbell-dark` | Barbell | dark | iron |
| 07 | `kettlebells-light` | Kettlebells | light | iron |
| 08 | `kettlebells-dark` | Kettlebells | dark | iron |
| 09 | `track-light` | Track | light | cardio |
| 10 | `track-dark` | Track | dark | cardio |
| 11 | `chalk-light` | Chalk | light | studio |
| 12 | `chalk-dark` | Chalk | dark | studio |
| 13 | `ropes-light` | Battle ropes | light | cardio |
| 14 | `ropes-dark` | Battle ropes | dark | cardio |
| 15 | `summit-light` | Summit | light | outdoor |
| 16 | `summit-dark` | Summit | dark | outdoor |
| 17 | `pool-light` | Pool lanes | light | outdoor |
| 18 | `pool-dark` | Pool lanes | dark | outdoor |
| 19 | `heartbeat-light` | Heartbeat | light | cardio |
| 20 | `heartbeat-dark` | Heartbeat | dark | cardio |
| 21 | `trail-light` | Trail map | light | outdoor |
| 22 | `trail-dark` | Trail map | dark | outdoor |
| 23 | `grid-light` | Studio grid | light | minimal |
| 24 | `grid-dark` | Studio grid | dark | minimal |
| 25 | `yoga-light` | Yoga mat | light | studio |
| 26 | `yoga-dark` | Yoga mat | dark | studio |
| 27 | `rings-light` | Rings | light | studio |
| 28 | `rings-dark` | Rings | dark | studio |
| 29 | `ride-light` | Ride | light | cardio |
| 30 | `ride-dark` | Ride | dark | cardio |
| 31 | `court-light` | Court | light | outdoor |
| 32 | `court-dark` | Court | dark | outdoor |
| 33 | `ember-light` | Ember | light | minimal |
| 34 | `ember-dark` | Ember | dark | minimal |

Counts: iron 8, cardio 8, outdoor 8, studio 6, minimal 4.

## 3. Jewellery badges (web `src/lib/jewels.ts`, `src/components/Jewel.tsx`)

Badge list and criteria are unchanged (`lib/badges.ts` / `util/Badges.kt`); only the look changes.

**Shape by category** (100 × 100 units):

| category | shape | frame path |
|---|---|---|
| `streak` | shield | `M50 4 L90 16 L90 50 C90 76 70 90 50 98 C30 90 10 76 10 50 L10 16 Z` |
| `nutrition` | hexagon | regular, r 48, first vertex at −90° (point up) |
| `training` | diamond | `M50 2 L98 50 L50 98 L2 50 Z` |
| `squad` | round | circle r 46 |
| `special` (milestones) | octagon | regular, r 48, first vertex at −112.5° (flat top) |

**Metal by tier** — frame gradient, top-left → bottom-right `[0, .45, 1]`:
bronze `#f0b48a #b0643a #5a2c12` · silver `#f4f5f7 #a9adb4 #4f535a` · gold `#fbe7a8 #D9B872 #5E4518` ·
platinum `#ffffff #cfd8e2 #66717e`.

**Gem by category** — `[light, mid, deep]`: streak ember `#ffb08a #FF5B1F #C2410C` · nutrition
emerald `#b8f5d8 #1fae6f #0a4d31` · training sapphire `#9fd0ff #2a6fd8 #0e2d66` · squad violet
`#e0c8ff #8b5cf6 #3b1a7a` · special gold `#fff1c4 #e2b04a #6b4a10`.

**Construction**: frame (metal gradient) + 1.5 bevel stroke in the metal highlight at 70 %; face =
the frame path scaled 0.8 about the centre, radial fill (metal mid → metal deep → `#0c0c0d`) plus a
fine noise grain at ~10 % (skip grain under 44 px); glow = radial circle r 36 in the gem colours;
gem = a six-facet brilliant (hexagon, r 21, r 18 on the diamond; centre y 47 on shields, 50 elsewhere)
split into six wedges shaded `[light, mid, deep, deep, deep, mid]` clockwise from the top, a small
flat table hexagon (r × 0.42) on top, and a short white highlight stroke upper-left.
**Locked**: metal `#4a4a4f #26262a #111113`, gem `#5a5a60 #34343a #1a1a1d`, no glow, plus a thin
line round the frame: track `rgba(255,255,255,.08)` and ember `#FF5B1F` for the progress fraction
(2.5 units wide).

**Existing badges → category, tier, id** (`id` = name lower-cased, non-alphanumerics → `-`):

| id | name | group | category | tier |
|---|---|---|---|---|
| `rookie` | Rookie | STREAK | streak | bronze |
| `getting-serious` | Getting Serious | STREAK | streak | silver |
| `locked-in` | Locked In | STREAK | streak | gold |
| `triple-threat` | Triple Threat | STREAK | streak | gold |
| `no-days-off` | No Days Off | STREAK | streak | platinum |
| `immortal` | Immortal | STREAK | streak | platinum |
| `forking-around` | Forking Around | MEALS | nutrition | bronze |
| `mission-nutrition` | Mission: Nutrition | MEALS | nutrition | silver |
| `the-logfather` | The Logfather | MEALS | nutrition | gold |
| `one-hit-wonder` | One Hit Wonder | CALORIES | special | bronze |
| `loyalty-iii` | Loyalty III | CALORIES | special | silver |
| `bullseye` | Bullseye | CALORIES | special | gold |

`training` and `squad` are defined for future badges; nothing uses them yet.

**Top badge** (profile, podium): highest tier first, then the larger `need`. **Next up**: the locked
badge with the highest progress fraction, ties → smaller `need`.

**Squadmate's top badge on the podium**: the leaderboard only has each member's current day
streak (`flames`), so use the highest STREAK badge with `need <= flames` (none below 3). Mini jewel
30 px at the avatar's bottom-right (offset −10, −8).

**Unlock moment**: plays once per badge per device when newly earned. Seen-set key (web):
`li-badges-seen-v216`. The first run on a device just records what's already earned (no flood).
Headline per badge id: `h = 0; for each char: h = (h*31 + code) mod 2^32`; line =
`["Here’s some jewellery.", "New hardware.", "That’s going on the wall."][h % 3]`.
Caption: STREAK "You logged N days in a row", MEALS "You logged N meals", CALORIES "You landed a day
on target" (N = 1) / "You landed N days on target", then " and earned {name}, a {Tier} badge."
Background `radial-gradient(90% 60% at 50% 38%, #3a3d42, #1c1d20 55%, #0e0e10)`, 34 px/800 headline,
260 px jewel with a pop-in, caption `#b9bcc2`, ringed close button top-right.

## 4. First-run tour (web `src/lib/tour.ts`, `src/components/GuidedTour.tsx`)

Over Home, after sign-up or on first open of v2.16. Show when (replay flag) or (not seen on this
device and `tour_seen_at` is null). Finishing or skipping sets the device flag, clears the replay
flag and writes `tour_seen_at = now()`. Preferences → "Replay the tour" sets the replay flag and goes
Home (the account flag is left alone). Web keys: `li-tour-v216-done`, `li-tour-v216-replay`.

| n | target | title | text |
|---|---|---|---|
| 1 | calorie card + the macro row | Your day at a glance | Calories left and your macros live here. Tap the card to flip between what’s left and what you’ve eaten. |
| 2 | coach note | Your coach | A note every morning. Reply any time: it remembers what you tell it. |
| 3 | the + button | Log anything with + | Type it, say it, snap it or scan it. Hinglish is fine: “2 roti aur dal”. |
| 4 | Scan tab | Scan food, labels, barcodes | Point at your plate or a pack. We check the web for the real numbers. |
| 5 | Squad tab | Your squad | Your friends’ meals, streaks and battles. Nudge anyone who goes quiet. |

Dim `rgba(0,0,0,.78)`, rounded cut-out (24 radius cards, 20 tabs, circle for +), 2 px `#FF5B1F`
outline 3 px outside pulsing 1.8 s. Card `#1b1b1e`, 22 radius, "n OF 5" `#FF8B5E`, "Skip tour",
dots (active 18 × 6 ember), ember pill "Next" / "Let’s go" on the last. If a target is missing (no
coach note yet), show the card centred without a cut-out.

## 5. + menu (web `src/components/BottomNav.tsx`)

Top to bottom: **Scan** (bright pill: bone in dark, ink in light; sub "photo · label · barcode";
ember circle icon; opens the scan screen) · Weight · Water +1 glass · Activity · Food (sub "type or
talk"). Backdrop `rgba(0,0,0,.62)` + 3 px blur.

## 6. Squad (web `src/lib/squadCards.ts`, `src/components/SquadPodium.tsx`)

**List card**: icon tile 56 px / 18 radius, **gold gradient `#D9B872 → #A8823A → #5E4518` when I'm
#1 on that squad's leaderboard (and it has more than one member)**, else dark; ember unread badge
top-right; name (+ padlock if private); latest activity line; avatar stack (me first, up to 4, 22 px);
ember streak pill = **the squad's best current day streak (max `flames`)**, or grey "new" when 0;
gold "#1" chip when I'm #1.
Latest line from the newest `group_feed` row: message "Name: text", meal "Name logged a meal",
workout "Name trained · gym", pr "Name hit a PR" ("You posted a PR"), photo "Name posted a photo",
else the body; first names; "You" for me; then " · 2m / 1h / 3d / now". No posts: "Quiet today ·
nudge someone" (or "Just you so far · invite a friend" for a one-member squad).
**Top strip** "N friends logged today" / "Ayaan and Himanshu · tap to cheer" (3+: "A, B and 2
more"): distinct other people with a meal / workout / pr post whose IST date is today, across all
my squads. Tap → that squad's Feed.

**Leaderboard** (LOCKED design): Members / Leaderboard segmented control (Leaderboard default;
Members = the previous ranked list with Nudge). Metric = day streak (`flames`), **unless a challenge
is active: then that challenge's board progress ("points")**. Podium order 2 · 1 · 3, pillar
heights 128 / 170 / 100, #1 gold pillar + gold ring + crown; 54 / 64 px avatars with the mini jewel
(§3); streak pill "12 days" / "5 pts". Caption "This week · streak days" or "{challenge} · points".
Rows 4+: glass card, rank, 40 px avatar, name, "4 days streak", ember ring = value ÷ leader's value.

## 7. Progress (web `src/components/ProgressScreen.tsx`, `src/lib/bmi.ts`)

Same cards, order and animations; recolour only: weight line/area ember + gold dashed goal line;
streak flames ember gradient `#FF8B5E → #FF5B1F` with a 16 px ember glow, "Best yet" gold pill;
energy line ember, gold dashed target "target 1,500", dots on-target ember / over `#C2410C` /
under silver `#B9BEC6`; macro rings Protein ember gradient, Carbs silver `#B9BEC6`, Fat `#C2410C`.
**BMI**: one reading rounded to 1 dp drives the number, the band and the words (74.5 kg / 166 cm =
**27.0, Obese, "Above healthy"**). Bands `<18.5 Under` silver · `18.5–23 Healthy` `#59E3A7` ·
`23–25 Over` gold `#D9B872` · `25+ Obese` ember; labels "Under / Healthy 18.5–23 / Over / Obese 25+".
Chip words: Below healthy / Healthy / A little above healthy / Above healthy. "Healthy weight for
166 cm". The v2.15 bug was the count-up number stopping short of the final value; web now renders
the rounded reading and forces the final value when the count ends (`components/motion.tsx`).

## 8. Profile identity band (web `src/components/ProfileScreen.tsx`)

Cover (§2) unchanged in size; a small "Cover" pill on it opens the picker. Then: name (30 px /
600) · "@handle · FOUNDER" (gold plate `linear-gradient(135deg, #D9B872, #5E4518)`, text `#1a1206`,
9.5 px / 700, .14em) · "{first squad name} · since {Mon YYYY}" · three liquid spheres (86 px,
gunmetal rim `linear-gradient(145deg, #5a5a5f, #1a1a1c 50%, #3a3a3e)`, wave strip 156 × 78 drifting
left 3.2 s linear): Streak ember `#FF8B5E → #C2410C` (fill = streak ÷ best), Protein gold `#D9B872 →
#5E4518` (today ÷ target), Weight silver `#E6E8EC → #5f646b` (progress to goal; 50 % without a goal);
min fill 14 % · ember "Edit profile" + outlined "Invite →". **Founder** = the existing "Founding
member" rule: every account (v2.12 launch cohort) — web `src/lib/founder.ts`.
Badges section: all 12 jewels in a 4-column grid, then "Next up" with an ember bar.
"Check for updates" row: the subtitle wraps instead of truncating.
