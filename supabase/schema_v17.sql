-- v1.7: real food database (IFCT + USDA + Open Food Facts), barcode cache, photo meals, scan lenses
alter table bandlog.foods
  add column if not exists fiber_g numeric(6,1),
  add column if not exists sugar_g numeric(6,1),
  add column if not exists sodium_mg numeric(7,1),
  add column if not exists micros jsonb default '{}',
  add column if not exists source text default 'custom',          -- ifct | usda | off | custom | dish
  add column if not exists region text,                            -- north | south | east | west | pan-india | western
  add column if not exists names_local jsonb default '{}',         -- {"hi":"छोले","kn":"..."}
  add column if not exists units jsonb default '[]',               -- [{"name":"katori","grams":150},...]
  add column if not exists barcode text,
  add column if not exists search_text text;
create or replace function bandlog.foods_search_text() returns trigger language plpgsql as $$
begin
  new.search_text := lower(coalesce(new.name,'') || ' ' || coalesce(array_to_string(new.aliases,' '),''));
  return new;
end $$;
drop trigger if exists foods_search_text_trg on bandlog.foods;
create trigger foods_search_text_trg before insert or update on bandlog.foods for each row execute procedure bandlog.foods_search_text();
create index if not exists foods_barcode on bandlog.foods(barcode) where barcode is not null;
create extension if not exists pg_trgm;
create index if not exists foods_name_trgm on bandlog.foods using gin (name gin_trgm_ops);
create index if not exists foods_search_trgm on bandlog.foods using gin (search_text gin_trgm_ops);

create table if not exists bandlog.barcode_cache (
  barcode text primary key,
  product jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table bandlog.barcode_cache enable row level security;
drop policy if exists "barcodes readable" on bandlog.barcode_cache;
create policy "barcodes readable" on bandlog.barcode_cache for select using (auth.role() in ('authenticated','service_role'));

alter table bandlog.label_scans
  add column if not exists kind text default 'label' check (kind in ('label','barcode','photo')),
  add column if not exists lens text default 'protein',
  add column if not exists image_path text;
alter table bandlog.meals add column if not exists photo_path text;
alter table bandlog.meal_items add column if not exists micros jsonb default '{}';

-- Anyone signed in can read the shared food DB; writes only via service role.
drop policy if exists "foods readable" on bandlog.foods;
create policy "foods readable" on bandlog.foods for select using (auth.role() in ('authenticated','service_role'));
grant all on all tables in schema bandlog to anon, authenticated, service_role;

insert into storage.buckets (id, name, public) values ('meal-photos','meal-photos', false) on conflict (id) do nothing;
select count(*) as foods from bandlog.foods;
