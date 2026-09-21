-- Band Log schema. Run once in Supabase > SQL Editor of your EXISTING project.
-- Everything lives in its own schema "bandlog" so it stays separate from other apps in the same project.
-- After running: Project Settings > API > "Exposed schemas" -> add bandlog.

create schema if not exists bandlog;
grant usage on schema bandlog to anon, authenticated, service_role;
alter default privileges in schema bandlog grant all on tables to anon, authenticated, service_role;
alter default privileges in schema bandlog grant all on sequences to anon, authenticated, service_role;

create extension if not exists "pgcrypto";

-- Profiles: one row per user, holds targets
create table if not exists bandlog.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  weekly_workout_target int not null default 3,
  protein_target_g int not null default 120,
  calorie_target int not null default 2200,
  created_at timestamptz not null default now()
);

-- Create the profile automatically on signup
create or replace function bandlog.handle_new_user()
returns trigger language plpgsql security definer set search_path = bandlog as $$
begin
  insert into bandlog.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created_bandlog on auth.users;
create trigger on_auth_user_created_bandlog
  after insert on auth.users
  for each row execute procedure bandlog.handle_new_user();

-- Workouts
create table if not exists bandlog.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  muscles text[] not null default '{}',
  band_level text not null default 'Medium' check (band_level in ('Light','Medium','Heavy')),
  resistance_kg numeric(5,1),
  minutes int,
  exercises text default '',
  notes text default '',
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_date on bandlog.workouts(user_id, date desc);

-- Food table (per 100 g). Shared reference data, readable by everyone signed in.
create table if not exists bandlog.foods (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  calories numeric(7,1) not null,
  protein_g numeric(6,1) not null,
  carbs_g numeric(6,1) not null,
  fat_g numeric(6,1) not null,
  unit_name text,          -- e.g. 'roti', 'egg', 'scoop', 'bowl', 'cup'
  unit_grams numeric(6,1)  -- grams per one unit
);

-- Meals
create table if not exists bandlog.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  raw_text text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists meals_user_date on bandlog.meals(user_id, date desc);

create table if not exists bandlog.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references bandlog.meals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id text,
  name text not null,
  grams numeric(7,1) not null,
  calories numeric(7,1) not null,
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  source text not null default 'table' check (source in ('table','estimated')),
  confidence numeric(3,2)
);
create index if not exists meal_items_meal on bandlog.meal_items(meal_id);

-- Row level security: each user sees only their own rows
alter table bandlog.profiles enable row level security;
alter table bandlog.workouts enable row level security;
alter table bandlog.meals enable row level security;
alter table bandlog.meal_items enable row level security;
alter table bandlog.foods enable row level security;

drop policy if exists "own profile" on bandlog.profiles;
create policy "own profile" on bandlog.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own workouts" on bandlog.workouts;
create policy "own workouts" on bandlog.workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own meals" on bandlog.meals;
create policy "own meals" on bandlog.meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own meal items" on bandlog.meal_items;
create policy "own meal items" on bandlog.meal_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "foods readable" on bandlog.foods;
create policy "foods readable" on bandlog.foods for select using (auth.role() = 'authenticated');

-- Grants for already-created tables (default privileges only cover future ones)
grant all on all tables in schema bandlog to anon, authenticated, service_role;
grant all on all sequences in schema bandlog to anon, authenticated, service_role;

-- Create a profile row for every existing account in this project (harmless for other apps' users:
-- rows are empty defaults and RLS hides them). Lets you sign in with an account you already have.
insert into bandlog.profiles (id) select id from auth.users on conflict do nothing;
