# Admin panel and beta usage events

Private to the owner. This covers v2.10 and the closed beta with friends who agreed to have their usage tracked for testing.

## Opening the panel

1. Set `ADMIN_EMAILS` on Railway (and in `.env.local` for dev) to a comma-separated list of the email addresses allowed in, for example `ADMIN_EMAILS=you@example.com`. Matching ignores case. If it is empty or unset, nobody can get in.
2. The panel also needs `SUPABASE_SERVICE_ROLE_KEY`, which the app already uses server-side. Never give it a `NEXT_PUBLIC_` prefix.
3. Sign in to the web app with that address (it must be a confirmed email), then open `/admin`.

Anyone else, whether signed in or not, gets a normal 404, so the panel's existence isn't revealed. The check runs on the server twice: `src/proxy.ts` rewrites non-admin `/admin` requests to an unknown path before routing, so the 404 looks the same as any other, and every admin page calls `requireAdmin()` (`src/lib/admin/auth.ts`) as well. Any future `/admin` route handler must also call it first. All admin queries use the service-role client on the server and never reach the browser.

Pages:
- `/admin`: overview. Total users, new users per day, DAU/WAU/MAU, rows logged per day per table, scans by kind, app events by name, and estimated AI cost from the `usage` saved on scan reports. Prices are in `src/lib/admin/pricing.ts`.
  Also (v2.12): auto-generated plain-English insights, a feature-usage summary, the activation funnel (signed up → finished onboarding → first meal → logged on 3+ days → joined a squad → active on 7+ days; nested steps), weekly retention by signup week, DAU/WAU and DAU/MAU stickiness, the logging-method mix and the most-logged foods.
- `/admin/features` (v2.12): every feature ranked by 30-day adoption (users who used it ÷ users active at all in the same 7 or 30 days), uses per active user per week, this week vs. last week (rolling 7-day windows), a status (core / used / rare / never / not measured) and which source each number came from.
- `/admin/users`: every auth user joined with `bandlog.profiles`. Sortable by any column, including (v2.12) days active in the last 7 days, meals in the last 7 days, top feature (30 days), last event name, last active day and at risk (no activity in 3+ days).
- `/admin/users/<id>`: one user's timeline, counts per feature, squads and recent app events. Also (v2.12): a profile summary (age band, goal, targets, platform, app version), engagement (days active of the last 14 and 30, current streak, sessions per day from `app_open`, an IST hour-of-day histogram), a feature × week matrix, what they track (meals per day, meal-type mix, average kcal and protein against targets, % of logged days hitting protein, top 10 foods, logging-method mix, water and weight frequency, workouts by kind), social (squads, chat messages, feed shares, reactions given and received, challenges, battle wins, squad opens) and the `error_shown` events they saw, with screens.

### How the v2.12 insights are counted

The code is in `src/lib/admin/insights/`: `load.ts` reads the data (service role, server only), and the other files are pure functions that turn it into plain JSON view models the pages render (`scripts/check-insights.ts` tests them offline).

- **Window.** Every query is bounded to the last 90 days (squad memberships and profiles are current state). One paged query per table for everyone, or per table for one user on the user page, never a query per user. A missing table or column reads as empty and is listed at the bottom of the page.
- **Active.** A user is active on an IST day if they sent any app event or created any logged row that day.
- **Sources.** `app_events` are used wherever an event exists. For each user, domain-table rows from *before their first event* fill in earlier history, so nothing is counted twice. Chat messages and feed shares come only from `group_posts` (there is no event for them). Meal editing, the logging method and the Progress screen come only from events. Calorie battle counts both battle-tab meal snaps (events) and days won (`battle_wins`). The Source column on `/admin/features` shows which applied.
- **Not measured.** Nothing reports the goals and science screens yet (the web tracker only sends the six main screens), so that row reads "not measured" rather than "never used".
- **Privacy.** The date of birth is turned into an age band on the server (`profile.ts`) and never appears in any view model or page. Everything stays server-side behind `requireAdmin()` and `src/proxy.ts`.

## What is collected

`supabase/schema_v33.sql` adds `bandlog.app_events` (`user_id`, `name`, `props`, `platform`, `app_version`, `created_at`). Clients can only insert their own rows. There is no read policy, so only the service role (this panel) can read them. `props` holds short labels and counts, never the food text or photos, and is capped at 2 KB. Undo with `supabase/revert_v33.sql`.

| Event | Props |
|---|---|
| `app_open` | web: `standalone` (installed PWA) |
| `screen_view` | `screen`: Home, Log, Scan, Squad, Progress, Profile |
| `meal_logged` | `method`: search / voice / text / photo / barcode / label, `items`, sometimes `from` (scan, battle) or `pending` |
| `meal_edited` | `items`, `moved` (date changed) |
| `meal_deleted` | none |
| `activity_logged` | `kind`, `minutes`, `source`, `activity` code or `count` |
| `water_added` | `ml`, `vessel` |
| `weight_logged` | none (the weight itself is not sent) |
| `scan_done` | `kind` (label / barcode / plate), `found`, `forced` |
| `squad_opened` | `squad_id` (web also sends `owner`) |
| `challenge_created` | `kind`, `days` |
| `post_deleted` | none |
| `reaction_added` | `emoji`, `kind` (the post's kind), `replaced` (swapped another emoji), `via` (bar / double_tap) |
| `error_shown` | `message` (the error text shown, up to 160 characters), `screen` |

Each row also records the platform (`web` / `android`) and the app version. Web sends from the browser (`src/lib/track.ts`) and from Server Actions (`src/lib/trackServer.ts`). Android sends from `data/Analytics.kt`. Both queue events, send them in the background, and silently stop if the table is missing.

The overview and user pages also read the existing tables (meals, workouts, water, weight, scans, squad posts and so on), and on the user page they show what each person logged.

## Before public launch

This is beta-only tracking. **Before public launch, either cover it in the privacy policy (what is collected, why, how long it's kept, who can see it) or turn it off.**

To turn it off:
- Web: set `BETA_ANALYTICS=false` on Railway and redeploy. It is read at build time, so a restart alone isn't enough.
- Android: add `BETA_ANALYTICS=false` to `local.properties` and build a new APK. Installed APKs keep sending until they are updated.
- Optionally run `supabase/revert_v33.sql` to delete the table and every recorded event. Both clients handle the table going missing.
