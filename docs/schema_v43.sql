-- v2.18 coach stream (schema_v43): Area B (coach & health) + Area C (training). Additive, idempotent.
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
-- Undo with docs/revert_v43.sql. Needs v37 (coach_*), v36 (fasting_sessions) and nothing newer.
-- v42 (food) and v44 (social) are independent of this file; apply in any order.
--
--   daily_checkins    B4 the 5-second sleep / stress / mood tap (one row per user per day), plus the
--                     Android Health Connect resting heart rate / sleep minutes when available (B8).
--   supplements       B7 the user's supplements (name, kind, dose, unit, reminder time).
--   supplement_logs   B7 one row per supplement per day taken (the streak).
--   coach_reviews     B2 the weekly check-in (one per week) and B5 plateau findings, stored so the
--                     model runs once a week, not on every open.
--   festival_modes    B9 festival / wedding date ranges: targets at maintenance, streak protected.
--   cycle_settings    B6 optional, PRIVATE cycle tracking (own row only; no squad / coach-of-others
--                     access, never included in exports shared with others).
--   form_checks       C2 AI form check summaries (exercise, reps, % clean, tips). No video is stored.
--   fasting_sessions.preset  B10 which Indian fasting preset started a fast (navratri, ramadan…).
--
-- Clients tolerate every object here being missing (web src/lib/v218/schema.ts missingV43; Android
-- data/V218Api.kt NotYetAvailable): the check-in card, supplements, weekly review, festival / cycle
-- cards hide or show "Coming with the next update"; form checks and fasts still run, unsaved.

-- ---------------------------------------------------------------------------------------------
-- B4 / B8 daily check-in
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.daily_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  sleep_hours numeric(3,1) check (sleep_hours is null or sleep_hours between 0 and 14),
  sleep_quality smallint check (sleep_quality is null or sleep_quality between 1 and 5),
  stress smallint check (stress is null or stress between 1 and 5),
  mood smallint check (mood is null or mood between 1 and 5),
  resting_hr smallint check (resting_hr is null or resting_hr between 30 and 130),
  hc_sleep_min int check (hc_sleep_min is null or hc_sleep_min between 0 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table bandlog.daily_checkins enable row level security;
drop policy if exists "daily_checkins own" on bandlog.daily_checkins;
create policy "daily_checkins own" on bandlog.daily_checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.daily_checkins to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- B7 supplements
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  kind text not null default 'custom' check (kind in ('creatine', 'whey', 'vitamin_d', 'iron', 'omega3', 'multivitamin', 'b12', 'custom')),
  dose numeric(8,2) check (dose is null or dose > 0),
  unit text not null default 'serving' check (char_length(unit) <= 12),
  remind_at time,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists supplements_user_idx on bandlog.supplements (user_id, active);
alter table bandlog.supplements enable row level security;
drop policy if exists "supplements own" on bandlog.supplements;
create policy "supplements own" on bandlog.supplements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.supplements to authenticated, service_role;

create table if not exists bandlog.supplement_logs (
  supplement_id uuid not null references bandlog.supplements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  taken_at timestamptz not null default now(),
  primary key (supplement_id, date)
);
create index if not exists supplement_logs_user_idx on bandlog.supplement_logs (user_id, date desc);
alter table bandlog.supplement_logs enable row level security;
drop policy if exists "supplement_logs own" on bandlog.supplement_logs;
create policy "supplement_logs own" on bandlog.supplement_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.supplement_logs to authenticated, service_role;

-- Reminders already sent today (the web cron's de-dupe; Android schedules its own alarms).
create table if not exists bandlog.supplement_reminders_sent (
  supplement_id uuid not null references bandlog.supplements(id) on delete cascade,
  date date not null,
  primary key (supplement_id, date)
);
alter table bandlog.supplement_reminders_sent enable row level security;
grant all on bandlog.supplement_reminders_sent to service_role;

-- ---------------------------------------------------------------------------------------------
-- B2 / B5 coach reviews
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.coach_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  kind text not null check (kind in ('weekly', 'plateau')),
  text text not null check (char_length(text) <= 2000),
  focus text,
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, kind)
);
alter table bandlog.coach_reviews enable row level security;
drop policy if exists "coach_reviews own read" on bandlog.coach_reviews;
create policy "coach_reviews own read" on bandlog.coach_reviews for select using (user_id = auth.uid());
grant select on bandlog.coach_reviews to authenticated;
grant all on bandlog.coach_reviews to service_role;

-- ---------------------------------------------------------------------------------------------
-- B9 festival / wedding mode
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.festival_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'other' check (kind in ('diwali', 'holi', 'eid', 'navratri', 'shaadi', 'trip', 'exams', 'other')),
  name text not null check (char_length(name) between 1 and 40),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date < 21)
);
create index if not exists festival_modes_user_idx on bandlog.festival_modes (user_id, end_date desc);
alter table bandlog.festival_modes enable row level security;
drop policy if exists "festival_modes own" on bandlog.festival_modes;
create policy "festival_modes own" on bandlog.festival_modes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.festival_modes to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- B6 cycle settings (private)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.cycle_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  last_period_start date,
  cycle_length smallint not null default 28 check (cycle_length between 21 and 40),
  period_length smallint not null default 5 check (period_length between 2 and 9),
  updated_at timestamptz not null default now()
);
alter table bandlog.cycle_settings enable row level security;
drop policy if exists "cycle_settings own" on bandlog.cycle_settings;
create policy "cycle_settings own" on bandlog.cycle_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.cycle_settings to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- C2 form checks
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.form_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null check (exercise in ('squat', 'pushup', 'lunge')),
  reps int not null check (reps between 0 and 500),
  clean_pct smallint check (clean_pct between 0 and 100),
  tips jsonb not null default '[]'::jsonb,
  platform text check (platform in ('web', 'android')),
  created_at timestamptz not null default now()
);
create index if not exists form_checks_user_idx on bandlog.form_checks (user_id, created_at desc);
alter table bandlog.form_checks enable row level security;
drop policy if exists "form_checks own" on bandlog.form_checks;
create policy "form_checks own" on bandlog.form_checks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.form_checks to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- B10 fasting preset
-- ---------------------------------------------------------------------------------------------
alter table bandlog.fasting_sessions add column if not exists preset text;
alter table bandlog.fasting_sessions drop constraint if exists fasting_sessions_preset_check;
alter table bandlog.fasting_sessions add constraint fasting_sessions_preset_check
  check (preset is null or preset in ('navratri', 'ramadan', 'ekadashi', 'jain', 'somvar'));

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'daily_checkins', to_regclass('bandlog.daily_checkins') is not null,
  'supplements', to_regclass('bandlog.supplements') is not null,
  'supplement_logs', to_regclass('bandlog.supplement_logs') is not null,
  'supplement_reminders_sent', to_regclass('bandlog.supplement_reminders_sent') is not null,
  'coach_reviews', to_regclass('bandlog.coach_reviews') is not null,
  'festival_modes', to_regclass('bandlog.festival_modes') is not null,
  'cycle_settings', to_regclass('bandlog.cycle_settings') is not null,
  'form_checks', to_regclass('bandlog.form_checks') is not null,
  'fasting_preset', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'fasting_sessions' and column_name = 'preset')
) as result;
