-- v2.15 (schema_v38): accuracy — per-user "calories per roti" overrides, the beta correction log,
-- the beta entry log, web-sourced food rows, and three optional meal_items columns.
-- Additive and idempotent: new tables, nullable columns, one widened check. Safe to re-run.
-- Undo with docs/revert_v38.sql.
--
-- NOT APPLIED YET. The v2.15 clients tolerate this file being missing: override reads come back
-- empty (the per-unit editor still works, it just isn't remembered), correction / event writes fail
-- silently, the web lookup cache write is skipped, and meal saves retry without the new columns.
--
-- Who writes what (see docs/v215-api.md):
--   user_food_overrides  web + Android, through GET/PUT /api/food-overrides (service role, own rows)
--                        or directly through PostgREST under RLS.
--   food_corrections     POST /api/corrections (service role, user_id from the token). Insert/select own.
--   log_events           POST /api/log-event (web + Android) while BETA_ANALYTICS is on. Insert/select own.
--   /admin reads food_corrections + log_events with the service role.

-- ---------------------------------------------------------------------------------------------
-- 1. Per-user per-food unit calories ("my roti is 95 kcal").
--    food_key = the normalised food name (src/lib/perUnit.ts overrideKey → foodKey: lowercase,
--    quantities stripped, "2 Roti" → "roti"), or "id:<food_id>" when the name normalises to nothing.
--    unit = the unit's noun ("roti", "egg", "katori", "slice") or '100g' for a loose food, where the
--    numbers are per 100 g.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.user_food_overrides (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_key text not null check (char_length(food_key) between 1 and 120),
  unit text not null check (char_length(unit) between 1 and 40),
  kcal_per_unit numeric(7,1) not null check (kcal_per_unit >= 0 and kcal_per_unit <= 5000),
  protein_per_unit numeric(6,1) check (protein_per_unit is null or protein_per_unit between 0 and 500),
  carbs_per_unit numeric(6,1) check (carbs_per_unit is null or carbs_per_unit between 0 and 1000),
  fat_per_unit numeric(6,1) check (fat_per_unit is null or fat_per_unit between 0 and 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, food_key, unit)
);
alter table bandlog.user_food_overrides enable row level security;
drop policy if exists "food overrides own" on bandlog.user_food_overrides;
create policy "food overrides own" on bandlog.user_food_overrides for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on bandlog.user_food_overrides to authenticated;
grant all on bandlog.user_food_overrides to service_role;
comment on table bandlog.user_food_overrides is
  'v2.15: kcal (and optional macros) per unit a person set for a food; the next log of that food uses it. Own rows only.';

-- ---------------------------------------------------------------------------------------------
-- 2. The correction log (beta): what we estimated vs what the person says it really is.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.food_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_id uuid references bandlog.meals(id) on delete set null,
  created_at timestamptz not null default now(),
  item_name text not null check (char_length(item_name) between 1 and 160),
  food_id text,
  input_kind text not null check (input_kind in ('text', 'photo', 'barcode', 'label', 'manual')),
  grams numeric(7,1),
  unit text check (unit is null or char_length(unit) <= 40),
  count numeric(6,2),
  app_kcal numeric(7,1),
  app_protein numeric(6,1),
  app_carbs numeric(6,1),
  app_fat numeric(6,1),
  user_kcal numeric(7,1) not null check (user_kcal >= 0 and user_kcal <= 20000),
  user_protein numeric(6,1),
  user_carbs numeric(6,1),
  user_fat numeric(6,1),
  source text check (source is null or char_length(source) <= 300),
  note text check (note is null or char_length(note) <= 1000),
  scan_id uuid,
  raw_input text check (raw_input is null or char_length(raw_input) <= 2000)
);
create index if not exists food_corrections_created_idx on bandlog.food_corrections (created_at desc);
create index if not exists food_corrections_user_idx on bandlog.food_corrections (user_id, created_at desc);
alter table bandlog.food_corrections enable row level security;
drop policy if exists "food corrections insert own" on bandlog.food_corrections;
create policy "food corrections insert own" on bandlog.food_corrections for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "food corrections select own" on bandlog.food_corrections;
create policy "food corrections select own" on bandlog.food_corrections for select to authenticated
  using (user_id = auth.uid());
revoke all on bandlog.food_corrections from anon;
grant select, insert on bandlog.food_corrections to authenticated;
grant all on bandlog.food_corrections to service_role;
comment on table bandlog.food_corrections is
  'v2.15 beta: every "Correct the numbers" save — app estimate vs the person''s numbers, with input kind and source. Insert/select own; /admin reads all via the service role.';

-- ---------------------------------------------------------------------------------------------
-- 3. The entry log (beta): every meal logged, item edited / deleted / skipped, scan accepted /
--    dismissed, and note typed. Gated by BETA_ANALYTICS on the clients.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.log_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('log', 'edit', 'delete', 'skip', 'scan_accept', 'scan_dismiss', 'note')),
  meal_id uuid,
  item_name text check (item_name is null or char_length(item_name) <= 160),
  payload jsonb not null default '{}'::jsonb,
  app_version text check (app_version is null or char_length(app_version) <= 20),
  platform text check (platform is null or platform in ('web', 'android')),
  constraint log_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint log_events_payload_size check (pg_column_size(payload) <= 16384)
);
create index if not exists log_events_created_idx on bandlog.log_events (created_at desc);
create index if not exists log_events_user_idx on bandlog.log_events (user_id, created_at desc);
create index if not exists log_events_kind_idx on bandlog.log_events (kind, created_at desc);
alter table bandlog.log_events enable row level security;
drop policy if exists "log events insert own" on bandlog.log_events;
create policy "log events insert own" on bandlog.log_events for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "log events select own" on bandlog.log_events;
create policy "log events select own" on bandlog.log_events for select to authenticated
  using (user_id = auth.uid());
revoke all on bandlog.log_events from anon;
grant select, insert on bandlog.log_events to authenticated;
grant all on bandlog.log_events to service_role;
comment on table bandlog.log_events is
  'v2.15 beta entry log (log/edit/delete/skip/scan_accept/scan_dismiss/note) with before/after numbers in payload. Insert/select own; /admin reads all. Off with BETA_ANALYTICS=false.';

-- ---------------------------------------------------------------------------------------------
-- 4. bandlog.foods: allow source 'web' (webFood.ts caches good web lookups). search_foods' score
--    CASE has no branch for it, so 'web' rows rank with the 0 bonus, below every curated source.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.foods drop constraint if exists foods_source_check;
alter table bandlog.foods add constraint foods_source_check
  check (source in ('custom', 'dish', 'ifct', 'usda', 'off', 'ai', 'web'));

-- ---------------------------------------------------------------------------------------------
-- 5. meal_items: the item's v2.15 fields. (Items live in bandlog.meal_items columns, not jsonb,
--    so these need DDL.) All nullable; older clients never send them.
--      user_verified  the person typed these numbers ("✓ Your numbers")
--      per_unit_kcal  kcal of ONE unit when the person set it (count × this = calories)
--      source_urls    up to 3 web pages the numbers came from
-- ---------------------------------------------------------------------------------------------
alter table bandlog.meal_items
  add column if not exists user_verified boolean,
  add column if not exists per_unit_kcal numeric(7,1),
  add column if not exists source_urls jsonb;
alter table bandlog.meal_items drop constraint if exists meal_items_source_urls_array;
alter table bandlog.meal_items add constraint meal_items_source_urls_array
  check (source_urls is null or (jsonb_typeof(source_urls) = 'array' and jsonb_array_length(source_urls) <= 3));

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'user_food_overrides', to_regclass('bandlog.user_food_overrides') is not null,
  'food_corrections', to_regclass('bandlog.food_corrections') is not null,
  'log_events', to_regclass('bandlog.log_events') is not null,
  'foods_source_check', (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'bandlog.foods'::regclass and conname = 'foods_source_check'),
  'meal_items_cols', (select json_agg(column_name) from information_schema.columns where table_schema = 'bandlog' and table_name = 'meal_items' and column_name in ('user_verified', 'per_unit_kcal', 'source_urls')),
  'policies', (select json_agg(tablename || ': ' || policyname) from pg_policies where schemaname = 'bandlog' and tablename in ('user_food_overrides', 'food_corrections', 'log_events'))
) as result;
