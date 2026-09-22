-- v1.5: profile stats, explicit macro targets, weight log
alter table bandlog.profiles
  add column if not exists name text default '',
  add column if not exists dob date,
  add column if not exists gender text check (gender in ('male','female','other')),
  add column if not exists height_cm numeric(5,1),
  add column if not exists weight_kg numeric(5,1),
  add column if not exists goal_weight_kg numeric(5,1),
  add column if not exists goal_type text default 'maintain' check (goal_type in ('lose','maintain','gain')),
  add column if not exists goal_speed_kg_wk numeric(3,2) default 0.5,
  add column if not exists step_goal int default 8000,
  add column if not exists carb_target_g int,
  add column if not exists fat_target_g int,
  add column if not exists reminders jsonb default '{}';
create table if not exists bandlog.weight_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric(5,1) not null,
  note text default '',
  created_at timestamptz not null default now()
);
create index if not exists weight_log_user_date on bandlog.weight_log(user_id, date desc);
alter table bandlog.weight_log enable row level security;
drop policy if exists "own weights" on bandlog.weight_log;
create policy "own weights" on bandlog.weight_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant all on all tables in schema bandlog to anon, authenticated, service_role;
select column_name from information_schema.columns where table_schema='bandlog' and table_name='profiles' order by ordinal_position;
