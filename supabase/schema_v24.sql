-- v2.4: shared food-image cache (web + Android), image_url on presets / saved meals / foods,
-- and a public `food-images` Storage bucket the server writes to with the service-role key.
-- Idempotent: safe to re-run.

create table if not exists bandlog.food_images (
  key text primary key,          -- normalised name: lowercase, trimmed, quantities stripped ("2 roti" -> "roti")
  query text,                    -- the search that produced it
  url text,                      -- public URL in Storage (never a hotlink); null when miss
  source text,                   -- google | off | ddg | wikimedia
  width int,
  height int,
  created_at timestamptz default now(),
  miss boolean default false
);
alter table bandlog.food_images enable row level security;
-- Server-only: no user policies. The service role bypasses RLS.
revoke all on bandlog.food_images from anon, authenticated;
grant all on bandlog.food_images to service_role;

alter table bandlog.food_presets add column if not exists image_url text;
alter table bandlog.saved_meals add column if not exists image_url text;
alter table bandlog.foods add column if not exists image_url text;

-- Preferences → Tracking → Weight units (display only; weights are always stored in kg).
alter table bandlog.profiles add column if not exists units text default 'metric';
alter table bandlog.profiles drop constraint if exists profiles_units_check;
alter table bandlog.profiles add constraint profiles_units_check check (units in ('metric', 'imperial'));

insert into storage.buckets (id, name, public) values ('food-images', 'food-images', true)
on conflict (id) do update set public = true;
drop policy if exists "food images public read" on storage.objects;
create policy "food images public read" on storage.objects for select using (bucket_id = 'food-images');

notify pgrst, 'reload schema';

select json_build_object(
  'food_images', to_regclass('bandlog.food_images') is not null,
  'image_url_cols', (select json_agg(table_name order by table_name) from information_schema.columns
                      where table_schema = 'bandlog' and column_name = 'image_url' and table_name in ('food_presets','saved_meals','foods')),
  'units_col', (select count(*) from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'units'),
  'food_images_rows', (select count(*) from bandlog.food_images),
  'food_images_hits', (select count(*) from bandlog.food_images where url is not null),
  'presets_with_image', (select count(*) from bandlog.food_presets where image_url is not null),
  'bucket_public', (select public from storage.buckets where id = 'food-images'),
  'policy', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'food images public read')
) as result;
