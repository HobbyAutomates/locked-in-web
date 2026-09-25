# Admin panel and beta usage events

Private to the owner. This covers v2.10 and the closed beta with friends who agreed to have their usage tracked for testing.

## Opening the panel

1. Set `ADMIN_EMAILS` on Railway (and in `.env.local` for dev) to a comma-separated list of the email addresses allowed in, for example `ADMIN_EMAILS=you@example.com`. Matching ignores case. If it is empty or unset, nobody can get in.
2. The panel also needs `SUPABASE_SERVICE_ROLE_KEY`, which the app already uses server-side. Never give it a `NEXT_PUBLIC_` prefix.
3. Sign in to the web app with that address (it must be a confirmed email), then open `/admin`.

Anyone else, whether signed in or not, gets a normal 404, so the panel's existence isn't revealed. The check runs on the server twice: `src/proxy.ts` rewrites non-admin `/admin` requests to an unknown path before routing, so the 404 looks the same as any other, and every admin page calls `requireAdmin()` (`src/lib/admin/auth.ts`) as well. Any future `/admin` route handler must also call it first. All admin queries use the service-role client on the server and never reach the browser.

Pages:
- `/admin`: overview. Total users, new users per day, DAU/WAU/MAU, rows logged per day per table, scans by kind, app events by name, and estimated AI cost from the `usage` saved on scan reports. Prices are in `src/lib/admin/pricing.ts`.
- `/admin/users`: every auth user joined with `bandlog.profiles`. Sortable by any column.
- `/admin/users/<id>`: one user's timeline, counts per feature, squads and recent app events.

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
| `error_shown` | `message` (the error text shown, up to 160 characters), `screen` |

Each row also records the platform (`web` / `android`) and the app version. Web sends from the browser (`src/lib/track.ts`) and from Server Actions (`src/lib/trackServer.ts`). Android sends from `data/Analytics.kt`. Both queue events, send them in the background, and silently stop if the table is missing.

The overview and user pages also read the existing tables (meals, workouts, water, weight, scans, squad posts and so on), and on the user page they show what each person logged.

## Before public launch

This is beta-only tracking. **Before public launch, either cover it in the privacy policy (what is collected, why, how long it's kept, who can see it) or turn it off.**

To turn it off:
- Web: set `BETA_ANALYTICS=false` on Railway and redeploy. It is read at build time, so a restart alone isn't enough.
- Android: add `BETA_ANALYTICS=false` to `local.properties` and build a new APK. Installed APKs keep sending until they are updated.
- Optionally run `supabase/revert_v33.sql` to delete the table and every recorded event. Both clients handle the table going missing.
