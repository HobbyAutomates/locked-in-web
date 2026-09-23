-- v1.8: activity MET table (Compendium 2024 via OpenNutriTracker) + exercise log
create table if not exists bandlog.activities (
  code text primary key,
  name text not null,
  description text default '',
  met numeric(4,1) not null,
  category text not null,
  tags text[] default '{}',
  source text default 'compendium2024'
);
alter table bandlog.activities enable row level security;
drop policy if exists "activities readable" on bandlog.activities;
create policy "activities readable" on bandlog.activities for select using (auth.role() in ('authenticated','service_role'));
create table if not exists bandlog.exercise_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  activity_code text references bandlog.activities(code),
  name text not null,
  minutes int not null,
  intensity text default 'medium' check (intensity in ('low','medium','high')),
  kcal numeric(7,1) not null,
  source text default 'manual' check (source in ('manual','workout','health','describe')),
  note text default '',
  created_at timestamptz not null default now()
);
create index if not exists exercise_log_user_date on bandlog.exercise_log(user_id, date desc);
alter table bandlog.exercise_log enable row level security;
drop policy if exists "own exercise" on bandlog.exercise_log;
create policy "own exercise" on bandlog.exercise_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant all on all tables in schema bandlog to anon, authenticated, service_role;
