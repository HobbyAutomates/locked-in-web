-- v2.18 (schema_v42): food logging and accuracy (spec Area A). Needs schema_v36 (recipes) and v38.
-- Additive and idempotent (safe to re-run). Undo with docs/revert_v42.sql.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it by hand.
-- THIS web copy is the source of truth; the Android repo only points here (docs/schema_v42.sql).
--
-- Every client tolerates each piece being missing: the feature that needs it hides (or, for the two
-- meal_items columns, the insert is retried without them and the range is derived from source +
-- confidence instead, see web src/lib/food/honesty.ts, Android util/FoodHonesty.kt).
--
--   A3  meal_items.kcal_low / kcal_high  int   honest ± range stored with the item (photo gram range,
--                                              menu / order ranges). Null = derive from source.
--   A10 profiles.water_from_food         bool  default false. Dal, chaas, fruit… add to water.
--   A6  leftovers                               "Ate part of it": the rest, one-tap to log later.
--   A7  meal_splits                             a dish split across squad members, pending until accepted.
--   A2  shared_recipes                          a recipe snapshot shared into a squad.
--   A11 pantry_items                            what's in the kitchen (grocery list skips these).
--
-- No new group_posts kinds (the social stream owns those). Sharing a recipe also drops a plain
-- 'message' post into the squad chat, best effort.

-- ---------------------------------------------------------------------------------------------
-- 0. Helper: do two users share a squad? (security definer: group_members RLS hides other rows)
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.shares_squad(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (
    select 1 from bandlog.group_members x join bandlog.group_members y on y.group_id = x.group_id
     where x.user_id = a and y.user_id = b
  );
$$;
revoke all on function bandlog.shares_squad(uuid, uuid) from public, anon;
grant execute on function bandlog.shares_squad(uuid, uuid) to authenticated, service_role;

create or replace function bandlog.is_squad_member(g uuid) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.group_members where group_id = g and user_id = auth.uid());
$$;
revoke all on function bandlog.is_squad_member(uuid) from public, anon;
grant execute on function bandlog.is_squad_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. A3 honest ranges on meal items, A10 water-from-food setting
-- ---------------------------------------------------------------------------------------------
alter table bandlog.meal_items add column if not exists kcal_low int;
alter table bandlog.meal_items add column if not exists kcal_high int;
alter table bandlog.profiles add column if not exists water_from_food boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- 2. A6 leftovers: what's left of a dish after "Ate part of it" (items already scaled to the rest)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.leftovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  items jsonb not null default '[]'::jsonb,
  kcal int not null default 0,
  fraction_left numeric(4,3) not null check (fraction_left > 0 and fraction_left < 1),
  meal_id uuid references bandlog.meals(id) on delete set null,
  created_at timestamptz not null default now(),
  -- set when logged ("used") or dismissed; a leftover older than 3 days stops being suggested.
  used_at timestamptz,
  dismissed_at timestamptz
);
create index if not exists leftovers_user_idx on bandlog.leftovers (user_id, created_at desc);
alter table bandlog.leftovers enable row level security;
drop policy if exists "leftovers own" on bandlog.leftovers;
create policy "leftovers own" on bandlog.leftovers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.leftovers to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. A7 meal splits: one row per squadmate share, pending until they accept (then they log it)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.meal_splits (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  from_name text,
  dish text not null check (char_length(dish) between 1 and 120),
  -- the recipient's share, already scaled (MealItem[] shape)
  items jsonb not null default '[]'::jsonb,
  kcal int not null default 0,
  share numeric(5,4) not null check (share > 0 and share <= 1),
  date date not null,
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_user <> to_user)
);
create index if not exists meal_splits_to_idx on bandlog.meal_splits (to_user, status, created_at desc);
create index if not exists meal_splits_from_idx on bandlog.meal_splits (from_user, created_at desc);
alter table bandlog.meal_splits enable row level security;
drop policy if exists "meal_splits read" on bandlog.meal_splits;
create policy "meal_splits read" on bandlog.meal_splits for select using (from_user = auth.uid() or to_user = auth.uid());
drop policy if exists "meal_splits send" on bandlog.meal_splits;
create policy "meal_splits send" on bandlog.meal_splits for insert
  with check (from_user = auth.uid() and status = 'pending' and bandlog.shares_squad(from_user, to_user));
drop policy if exists "meal_splits decide" on bandlog.meal_splits;
create policy "meal_splits decide" on bandlog.meal_splits for update using (to_user = auth.uid()) with check (to_user = auth.uid());
drop policy if exists "meal_splits withdraw" on bandlog.meal_splits;
create policy "meal_splits withdraw" on bandlog.meal_splits for delete using (from_user = auth.uid() and status = 'pending');
grant select, insert, update, delete on bandlog.meal_splits to authenticated;
grant all on bandlog.meal_splits to service_role;

-- The recipient may only change status / decided_at (not the items or the share).
create or replace function bandlog.meal_splits_guard() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if current_user not in ('postgres', 'service_role') then
    new.from_user := old.from_user; new.to_user := old.to_user; new.from_name := old.from_name;
    new.dish := old.dish; new.items := old.items; new.kcal := old.kcal; new.share := old.share;
    new.date := old.date; new.meal_type := old.meal_type; new.created_at := old.created_at;
    if old.status <> 'pending' then new.status := old.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists meal_splits_guard on bandlog.meal_splits;
create trigger meal_splits_guard before update on bandlog.meal_splits for each row execute function bandlog.meal_splits_guard();

-- ---------------------------------------------------------------------------------------------
-- 4. A2 recipes shared into a squad (a snapshot; members save their own copy into recipes)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.shared_recipes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  name text not null check (char_length(name) between 1 and 120),
  servings numeric(5,2) not null default 1 check (servings > 0),
  cooked_weight_g numeric(7,1),
  items jsonb not null default '[]'::jsonb,
  per_serving jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists shared_recipes_group_idx on bandlog.shared_recipes (group_id, created_at desc);
alter table bandlog.shared_recipes enable row level security;
drop policy if exists "shared_recipes read" on bandlog.shared_recipes;
create policy "shared_recipes read" on bandlog.shared_recipes for select using (bandlog.is_squad_member(group_id));
drop policy if exists "shared_recipes share" on bandlog.shared_recipes;
create policy "shared_recipes share" on bandlog.shared_recipes for insert with check (user_id = auth.uid() and bandlog.is_squad_member(group_id));
drop policy if exists "shared_recipes unshare" on bandlog.shared_recipes;
create policy "shared_recipes unshare" on bandlog.shared_recipes for delete using (user_id = auth.uid());
grant select, insert, delete on bandlog.shared_recipes to authenticated;
grant all on bandlog.shared_recipes to service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. A11 pantry
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  qty text,
  category text,
  in_stock boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists pantry_items_user_name_key on bandlog.pantry_items (user_id, lower(name));
alter table bandlog.pantry_items enable row level security;
drop policy if exists "pantry own" on bandlog.pantry_items;
create policy "pantry own" on bandlog.pantry_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on bandlog.pantry_items to authenticated, service_role;

comment on column bandlog.meal_items.kcal_low is 'v2.18: low end of the honest kcal range for this item (null = derive from source + confidence).';
comment on column bandlog.meal_items.kcal_high is 'v2.18: high end of the honest kcal range for this item.';
comment on column bandlog.profiles.water_from_food is 'v2.18: count water in food (dal, chaas, fruit) toward the day''s water. Off by default.';

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'meal_items_kcal_range', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'meal_items' and column_name = 'kcal_low'),
  'water_from_food', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'water_from_food'),
  'leftovers', to_regclass('bandlog.leftovers') is not null,
  'meal_splits', to_regclass('bandlog.meal_splits') is not null,
  'shared_recipes', to_regclass('bandlog.shared_recipes') is not null,
  'pantry_items', to_regclass('bandlog.pantry_items') is not null
) as result;
