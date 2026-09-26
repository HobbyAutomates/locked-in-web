-- v2.13 "big release" (schema_v36): Pro tier (beta = everyone), push notifications + nudge
-- notifications, body measurements, richer progress photos, recipes, fasting, diet modes +
-- adaptive weekly targets, routines, menu scans.
-- Additive and idempotent: only new tables, new nullable/defaulted columns, one widened check,
-- one guard trigger. Safe to re-run. Undo with supabase/revert_v36.sql.
--
-- Both v2.13 clients must tolerate this file not being applied yet (feature hidden / "needs the
-- server update"), same convention as v35.

-- ---------------------------------------------------------------------------------------------
-- 1. Pro tier. Price ₹700 / month. During the beta EVERY account (existing and new) is on
--    plan 'beta', which has every Pro feature. Payments are not wired yet (no processor).
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles
  add column if not exists plan text not null default 'beta',
  add column if not exists pro_until timestamptz;
alter table bandlog.profiles drop constraint if exists profiles_plan_check;
alter table bandlog.profiles add constraint profiles_plan_check check (plan in ('free', 'beta', 'pro'));
update bandlog.profiles set plan = 'beta' where plan is null or plan = 'free';

-- Users may update their own profile row (policy "own profile"), so plan / pro_until are guarded:
-- only service_role (server) can change them. Clients silently keep the old values.
create or replace function bandlog.guard_plan() returns trigger
language plpgsql security definer set search_path = bandlog as $$
begin
  -- security definer makes current_user the owner, so check session_user (the SQL console runs
  -- as postgres; API requests run as authenticator with a JWT role).
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    new.plan := old.plan;
    new.pro_until := old.pro_until;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_plan on bandlog.profiles;
create trigger profiles_guard_plan before update on bandlog.profiles
  for each row execute function bandlog.guard_plan();

-- Single source of truth for "does this user get Pro features".
create or replace function bandlog.has_pro(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select coalesce((select p.plan in ('beta', 'pro') and (p.pro_until is null or p.pro_until > now())
                   from bandlog.profiles p where p.id = u), true);
$$;
revoke all on function bandlog.has_pro(uuid) from public, anon;
grant execute on function bandlog.has_pro(uuid) to authenticated, service_role;

-- Public pricing / flags the clients read (no secrets here).
create table if not exists bandlog.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table bandlog.app_config enable row level security;
drop policy if exists "app config read" on bandlog.app_config;
create policy "app config read" on bandlog.app_config for select using (true);
grant select on bandlog.app_config to anon, authenticated;
grant all on bandlog.app_config to service_role;
insert into bandlog.app_config (key, value) values
  ('pro', '{"price_inr": 700, "period": "month", "beta_all_pro": true, "payments_enabled": false}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2. Notifications: web push (iPhone home-screen app + desktop) subscriptions, and an inbox that
--    nudges (and later other events) write into. Android polls the inbox (no FCM project yet).
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user_idx on bandlog.push_subscriptions (user_id);
alter table bandlog.push_subscriptions enable row level security;
drop policy if exists "push subs own" on bandlog.push_subscriptions;
create policy "push subs own" on bandlog.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.push_subscriptions to authenticated, service_role;

create table if not exists bandlog.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('nudge', 'protein', 'fasting', 'checkin', 'system')),
  title text not null,
  body text not null default '',
  url text,
  created_at timestamptz not null default now(),
  pushed_at timestamptz,
  read_at timestamptz
);
create index if not exists notifications_user_created_idx on bandlog.notifications (user_id, created_at desc);
alter table bandlog.notifications enable row level security;
drop policy if exists "notifications own read" on bandlog.notifications;
create policy "notifications own read" on bandlog.notifications for select using (user_id = auth.uid());
drop policy if exists "notifications own update" on bandlog.notifications;
create policy "notifications own update" on bandlog.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications own insert" on bandlog.notifications;
create policy "notifications own insert" on bandlog.notifications for insert
  with check (user_id = auth.uid() and kind in ('protein', 'fasting', 'checkin'));
grant select, insert, update on bandlog.notifications to authenticated;
grant all on bandlog.notifications to service_role;

-- A nudge writes a notification for the person nudged.
create or replace function bandlog.nudge_to_notification() returns trigger
language plpgsql security definer set search_path = bandlog as $$
declare
  who text;
  squad text;
begin
  select coalesce(nullif(p.name, ''), 'A squadmate') into who from bandlog.profiles p where p.id = new.from_user;
  select g.name into squad from bandlog.groups g where g.id = new.group_id;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (new.to_user, 'nudge', coalesce(who, 'A squadmate') || ' nudged you',
          'Time to lock in' || coalesce(' with ' || squad, '') || '.', '/squad');
  return new;
end $$;
drop trigger if exists nudges_notify on bandlog.nudges;
create trigger nudges_notify after insert on bandlog.nudges
  for each row execute function bandlog.nudge_to_notification();

-- ---------------------------------------------------------------------------------------------
-- 3. Body measurements (cm / %). One row per entry; several per day allowed.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  waist_cm numeric(5,1), chest_cm numeric(5,1), hips_cm numeric(5,1), neck_cm numeric(5,1),
  arm_cm numeric(5,1), thigh_cm numeric(5,1), calf_cm numeric(5,1),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or body_fat_pct between 2 and 70),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists body_measurements_user_date_idx on bandlog.body_measurements (user_id, date);
alter table bandlog.body_measurements enable row level security;
drop policy if exists "measurements own" on bandlog.body_measurements;
create policy "measurements own" on bandlog.body_measurements for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.body_measurements to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Progress photos: editable details (edit/delete already allowed by "progress photos own").
-- ---------------------------------------------------------------------------------------------
alter table bandlog.progress_photos
  add column if not exists weight_kg numeric(5,1),
  add column if not exists pose text,
  add column if not exists updated_at timestamptz;
alter table bandlog.progress_photos drop constraint if exists progress_photos_pose_check;
alter table bandlog.progress_photos add constraint progress_photos_pose_check
  check (pose is null or pose in ('front', 'side', 'back', 'other'));

-- ---------------------------------------------------------------------------------------------
-- 5. Recipes: items [{name, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, food_id?}] and the
--    per-serving totals computed by the client.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  servings numeric(5,2) not null default 1 check (servings > 0),
  cooked_weight_g numeric(7,1),
  items jsonb not null default '[]'::jsonb,
  per_serving jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_user_idx on bandlog.recipes (user_id, updated_at desc);
alter table bandlog.recipes enable row level security;
drop policy if exists "recipes own" on bandlog.recipes;
create policy "recipes own" on bandlog.recipes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.recipes to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. Fasting sessions.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.fasting_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  target_hours numeric(4,1) not null default 16 check (target_hours between 1 and 72),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists fasting_user_started_idx on bandlog.fasting_sessions (user_id, started_at desc);
alter table bandlog.fasting_sessions enable row level security;
drop policy if exists "fasting own" on bandlog.fasting_sessions;
create policy "fasting own" on bandlog.fasting_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.fasting_sessions to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 7. Diet modes, adaptive weekly targets, protein nudge, fasting protocol (profile settings).
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles
  add column if not exists diet_mode text not null default 'balanced',
  add column if not exists adaptive_targets boolean not null default false,
  add column if not exists protein_nudge boolean not null default true,
  add column if not exists protein_nudge_time time not null default '16:00',
  add column if not exists fasting_hours numeric(4,1);
alter table bandlog.profiles drop constraint if exists profiles_diet_mode_check;
alter table bandlog.profiles add constraint profiles_diet_mode_check check (diet_mode in
  ('balanced', 'high_protein', 'vegetarian', 'eggetarian', 'vegan', 'jain', 'keto', 'low_carb', 'mediterranean'));

create table if not exists bandlog.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  avg_weight_kg numeric(5,2),
  trend_kg_per_week numeric(5,2),
  avg_kcal int,
  old_target int,
  new_target int,
  reason text,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table bandlog.weekly_checkins enable row level security;
drop policy if exists "checkins own" on bandlog.weekly_checkins;
create policy "checkins own" on bandlog.weekly_checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.weekly_checkins to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 8. Training routines: days [{weekday 1-7 | null, name, exercises: [{name, sets, reps, rest_s,
--    muscles: [..]}]}]. One active routine drives "Today's session".
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  days jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routines_user_idx on bandlog.routines (user_id);
create unique index if not exists routines_one_active on bandlog.routines (user_id) where active;
alter table bandlog.routines enable row level security;
drop policy if exists "routines own" on bandlog.routines;
create policy "routines own" on bandlog.routines for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.routines to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 9. Restaurant menu scans live in label_scans with kind 'menu'.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.label_scans drop constraint if exists label_scans_kind_check;
alter table bandlog.label_scans add constraint label_scans_kind_check check (kind in ('label', 'barcode', 'photo', 'menu'));
