-- v1.3 additions: feedback on parsed meals, saved meals, label scans
create table if not exists bandlog.meal_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references bandlog.meals(id) on delete cascade,
  raw_text text not null default '',
  rating text not null check (rating in ('up','down')),
  correction text default '',
  created_at timestamptz not null default now()
);
create table if not exists bandlog.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',
  calories numeric(7,1) not null default 0,
  protein_g numeric(6,1) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists bandlog.label_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null default '',
  verdict text not null default '',
  report jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table bandlog.meal_feedback enable row level security;
alter table bandlog.saved_meals enable row level security;
alter table bandlog.label_scans enable row level security;
drop policy if exists "own feedback" on bandlog.meal_feedback;
create policy "own feedback" on bandlog.meal_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own saved meals" on bandlog.saved_meals;
create policy "own saved meals" on bandlog.saved_meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own scans" on bandlog.label_scans;
create policy "own scans" on bandlog.label_scans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant all on all tables in schema bandlog to anon, authenticated, service_role;
select table_name from information_schema.tables where table_schema='bandlog' order by 1;
