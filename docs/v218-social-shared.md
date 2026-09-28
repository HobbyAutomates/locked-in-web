# v2.18 social stream: shared contract (web ⇄ Android)

Spec: `C:\Users\Aditya\LockedIn-backups\v218-spec.md`, Areas D (D1–D12) and E (E1–E5).
Web branch `v218/social` (worktree `C:\Users\Aditya\wt\v218-social-web`) is the source for the ids,
numbers and rules below. Each pure web module has an Android twin with the same names and results;
`scripts/check-v218-social.ts` pins the numbers and the Android unit tests pin the same ones.

## Schema (written, NOT applied)

| file | what |
|---|---|
| `docs/schema_v44.sql` / `docs/revert_v44.sql` | Area D: freezes, referrals, verified squads, coach access, stamps + 7 reactions, live sessions, pledges, event badges, packs, leagues |
| `docs/schema_v45.sql` / `docs/revert_v45.sql` | Area E: `profiles.ui_lang`, `user_blocks`, `content_reports`, `wipe_user()` |

Every client must tolerate both being missing: read each feature's table / RPC in its own call and on a
missing-table / missing-function error (`42P01`, `42703`, `42883`, `PGRST202`, `PGRST204`, `PGRST205`,
or "does not exist" / "could not find") hide the feature or show "Coming with the next update".

## Area D

| # | web pure module | Android twin | server |
|---|---|---|---|
| D1 Wrapped | `src/lib/social/wrapped.ts` (+ canvas `wrappedCard.ts`) | `util/Wrapped.kt` | none (client-side from logs) |
| D2 Referrals | `src/lib/social/referrals.ts` | `util/Referrals.kt` | `my_referral_code()`, `referral_claim(p_code)` → jsonb `{ok, reason, referrer_name, bonus}`, `my_referrals()`; columns `profiles.referral_code`, `profiles.referral_pro_days` |
| D3 Verified squads | — | — | `groups.verified / org_name / org_kind`, `squad_verifications`, `request_squad_verification(g, p_org, p_kind, p_proof)`; admin approves on web `/admin/social` |
| D4 Coach view | `src/lib/social/coachView.ts` | `util/CoachView.kt` | `coach_grant(p_username)`, `coach_revoke(p_other)`, `my_coaches()`, `my_clients()`, `client_overview(p_client, p_days)`; table `coach_comments` (insert as coach) |
| D5 Freezes | `src/lib/social/freezes.ts` | `util/Freezes.kt` | `freeze_sync()` → `(tokens, earned_now, used_now, used_days date[])`; `freeze_gift(p_to)` → tokens left; tables `streak_freezes`, `freeze_events` (own read); `day_streak` counts frozen days |
| D6 Stamps + reactions | `src/lib/social/stamps.ts`, `src/lib/reactions.ts` | `util/Stamps.kt`, `util/Reactions.kt` | `post_stamps` (upsert/delete own), `post_stamp_counts(p_posts uuid[])` → `(post_id, clean, cheat, mine)` |
| D7 Live sessions | `src/lib/social/live.ts` | `util/LiveSquad.kt` | `profiles.live_share` (default false), `live_sessions` (own row upsert/delete), `squad_live(g)`, `live_cheer(p_user)` → boolean |
| D8 Pledges | `src/lib/social/pledges.ts` | `util/Pledges.kt` | table `pledges` (own CRUD, squad read), `squad_pledges(g)` |
| D9 Seasonal events | `src/lib/social/seasonal.ts` | `util/Seasonal.kt` | table `event_badges` (own insert) |
| D10 Transformation story | web page `/story` (canvas + MediaRecorder → .webm) | frame-sequence share (PNG frames via ACTION_SEND_MULTIPLE) | none (progress_photos + weight_log) |
| D11 Packs | `src/lib/social/packs.ts` | `util/Packs.kt` | `pack_unlocks` (own insert with `via='beta_free'`), `profiles.badge_skin`, cover id `<motif>-gold` |
| D12 Leagues | `src/lib/social/leagues.ts` (`LEAGUES_ENABLED = false`) | `util/Leagues.kt` (same flag, off) | `squad_leagues`, `league_weeks`, `league_table(g)`, `app_config.leagues` |

### Numbers and strings to keep identical

- **Freezes**: max 3; earn per perfect Mon–Sun IST week (last 2 completed weeks checked per sync);
  auto-use only when tokens cover the whole empty run ending yesterday and the day before the run is
  active or frozen; never before the first log; gift once per recipient per 7 days, recipient < 3.
  Local key `li-freeze-sync` (sync at most once a day). Texts: "No freezes", "1 freeze", "3 freezes";
  hints in `earnHint()`.
- **Referrals**: code = 6 chars of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; link `<site>/r/<CODE>`; device key
  `li-ref`; beta with no end date → 7 days banked (`referral_pro_days`), else `pro_until = max(now,
  pro_until) + 7d` and free → pro. Claim messages in `claimMessage()`.
- **Reactions** (bar order): `❤️ 🔥 👍 😂 😮 💪 🥗 🍗 🏋️ 🙌 💯 😤 🫡` (❤️ = U+2764 U+FE0F, 🏋️ = U+1F3CB U+FE0F).
- **Stamps**: `clean` / `cheat`; labels "CLEAN" / "CHEAT"; majority shows as the big stamp, tie shows none;
  only `meal` / `photo` posts with a photo.
- **Live**: heartbeat every 4 min; fresh = seen ≤ 20 min and started ≤ 4 h; cheer cooldown 10 min;
  line "Ayan is training now 🔥" (first name).
- **Pledges**: kinds `log_days`, `train_days`, `protein_days`, `custom`; 1–90 days; stake text ≤ 120,
  ₹0–1,00,000; `MONEY_STEP_NOTE` = "Paying into the pot in the app is coming soon. For now it's on your honour."
- **Seasonal**: ids `diwali-protein-<year>` (Diwali −10 … +4, 10 protein days; Diwali 2026-11-08,
  2027-10-29, 2028-10-17), `monsoon-steps-<year>` (1 Jul–30 Sep, 8,000+ steps on 30 days),
  `new-year-<year>` (1–31 Jan, 25 log days and 12 training days). Badge metals / gems in `seasonal.ts`.
- **Packs**: `covers-gold` ₹149, `skin-obsidian` ₹99, `skin-rose` ₹99; label "₹149 · free in the beta".
  Gold cover = the motif's DARK svg with every hex colour mapped by luma (0.299R+0.587G+0.114B)/255 onto
  the ramp 0 → #0b0906, 0.3 → #5e4518, 0.62 → #d9b872, 1 → #fbe7a8 (linear between stops, lower-case hex).
  Skin metals: obsidian `#8a8f98 #2a2c31 #060607`, rose `#ffd9cf #c98a7a #5a2e25`.
- **Leagues**: tiers Diamond, Platinum, Gold, Silver, Bronze (1..5); movers = 0 below 5 squads, else
  max(1, floor(n × 0.2)); flag OFF.

## Area E

| # | web | Android |
|---|---|---|
| E1 Offline logging | `src/lib/social/offlineQueue.ts` (pure), IndexedDB store `li-offline`/`queue`, service worker caches the app shell; chip "3 waiting to sync" | DataStore-backed queue (`data/OfflineQueue.kt`), replay on network return / app open; same chip |
| E2 Language | `src/lib/social/i18n.ts` (en / hinglish / hi, same keys), `regionalFoods.ts` (Marathi / Tamil / Bengali → canonical names, applied to the food picker query) | `util/I18n.kt`, `util/RegionalFoods.kt`; picker in Preferences |
| E3 Widgets | — | Glance widget: calories left + day streak (+ Wear OS tile module only if it builds cleanly) |
| E4 Health Connect | — | weight, steps, resting heart rate reads (Mi / Amazfit via their apps) |
| E5 Must-haves | `/forgot` + `/reset` (Supabase recovery email), `/api/account/delete` (service role: `wipe_user`, storage cleanup, auth user delete), report + block in squads, `/api/export` CSV + `/profile/export` printable PDF. Google sign-in: TODO (no OAuth client configured) | forgot password (Supabase `/auth/v1/recover`), delete account (calls the web route with the bearer token), report + block, CSV share + PDF via `PdfDocument` |

- Language keys and strings: `STRINGS` in `i18n.ts`. Device key / cookie `li-lang`.
- Offline: `MAX_TRIES` 5, `QUEUE_LIMIT` 200; queue only when offline or on a network error.
- Delete confirm word `DELETE`; user buckets `avatars`, `progress-photos`, `meal-photos`, `scan-photos`, `group-photos`.
- Report reasons: `spam`, `abuse`, `nudity`, `self_harm`, `other`. Device block-list key `li-blocked`.

## Added during the build

- **D10 story** pure module: `src/lib/social/story.ts` (Android `util/Story.kt`): photos oldest → newest,
  at most 24 (evenly thinned, first and last kept), weight from the photo or the nearest weight_log
  entry within 7 days, delta vs the first frame (1 decimal), captions "Day N" / "−4.2 kg". Opt-in key
  `li-story-optin`. Web reel: 720 × 1280 canvas + MediaRecorder (mp4 where supported, else webm).
- **Freeze chip** on Home reads the count the daily sync stored (`li-freeze-tokens`), so it costs no request.
- **Web routes**: `/social` (hub, one row on Profile), `/streak`, `/invite`, `/r/<code>`, `/wrapped/<week|month|year>`,
  `/pledges`, `/events`, `/coach-access`, `/clients`, `/clients/<id>`, `/story`, `/packs`, `/leagues` (404 while
  the flags are off), `/squad/<id>/verify`, `/profile/export`, `/profile/delete`, `/forgot`, `/reset`,
  `/admin/social`, `GET /api/export?kind=all|meals|workouts|activities|weights|water`,
  `POST /api/account/delete` `{ "confirm": "DELETE" }` (cookie or bearer).
- **Before shipping** (owner): apply `schema_v44.sql` then `schema_v45.sql`; add `<site>/reset` to Supabase
  Auth → URL configuration → Redirect URLs so the reset email can open it; `SUPABASE_SERVICE_ROLE_KEY` must be
  set on the server for export and account deletion (it already is for admin).
- **Google sign-in**: not built. No Google OAuth client is configured in Supabase; `GOOGLE_SIGN_IN_ENABLED`
  (web `lib/social/safety.ts`) stays false and the login page has a TODO where the button goes.
