-- v1.9: Indian food presets with serving sizes, cooking-fat add-ons, per-user lens + sharing prefs
create table if not exists bandlog.food_presets (
  id text primary key,
  food_id text references bandlog.foods(id),
  label text not null,               -- "Dal"
  label_hi text,                     -- "दाल"
  category text not null,            -- breakfast | staple | dal | sabzi | protein | snack | drink | sweet | fat
  servings jsonb not null default '[]', -- [{"label":"1 katori","grams":150},{"label":"2 katori","grams":300}]
  default_serving text,              -- label of the usual one
  sort int default 100,
  icon text                          -- name of an inline icon in the apps
);
alter table bandlog.food_presets enable row level security;
drop policy if exists "presets readable" on bandlog.food_presets;
create policy "presets readable" on bandlog.food_presets for select using (auth.role() in ('authenticated','service_role'));
alter table bandlog.profiles
  add column if not exists lens_default text default 'protein' check (lens_default in ('protein','goal','snack','cutting','bulking')),
  add column if not exists share_stats boolean default true;   -- Groups: share protein/calories, not just streaks
alter table bandlog.meal_items add column if not exists unit text, add column if not exists servings numeric(6,2), add column if not exists cooked_in text;
grant all on all tables in schema bandlog to anon, authenticated, service_role;
select count(*) as presets from bandlog.food_presets;
