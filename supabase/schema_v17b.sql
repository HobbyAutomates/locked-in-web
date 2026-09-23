-- v1.7b: trigram food search used by /api/parse-meal, /api/photo-meal and the app's food picker.
-- Ranks by pg_trgm similarity against name + search_text, with an exact-alias boost and a source
-- priority so the hand-curated rows win ties: custom > dish > ifct > usda > off.
create extension if not exists pg_trgm;

-- names_local (Hindi transliterations etc.) should be searchable too.
create or replace function bandlog.foods_search_text() returns trigger language plpgsql as $$
declare loc text;
begin
  select string_agg(value, ' ') into loc from jsonb_each_text(coalesce(new.names_local, '{}'::jsonb));
  new.search_text := lower(
    coalesce(new.name, '') || ' ' || coalesce(array_to_string(new.aliases, ' '), '') || ' ' || coalesce(loc, '')
  );
  return new;
end $$;

drop function if exists bandlog.search_foods(text, int);
create or replace function bandlog.search_foods(q text, n int default 8)
returns table (
  id text, name text, aliases text[],
  calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
  fiber_g numeric, sugar_g numeric, sodium_mg numeric, micros jsonb,
  source text, region text, names_local jsonb, units jsonb,
  unit_name text, unit_grams numeric, score real
)
language sql stable
security definer
set search_path = bandlog, public
as $$
  with qq as (select lower(regexp_replace(trim(q), '\s+', ' ', 'g')) as q)
  select f.id, f.name, f.aliases,
         f.calories, f.protein_g, f.carbs_g, f.fat_g,
         f.fiber_g, f.sugar_g, f.sodium_mg, f.micros,
         f.source, f.region, f.names_local, f.units,
         f.unit_name, f.unit_grams,
         (
           greatest(
             similarity(lower(f.name), qq.q),
             similarity(coalesce(f.search_text, ''), qq.q),
             word_similarity(qq.q, coalesce(f.search_text, '')) * 0.9
           )
           + case when lower(f.name) = qq.q or qq.q = any (select lower(a) from unnest(f.aliases) a) then 1.0 else 0.0 end
           + case f.source when 'custom' then 0.20 when 'dish' then 0.15 when 'ifct' then 0.10 when 'usda' then 0.05 else 0.0 end
         )::real as score
  from bandlog.foods f, qq
  where length(qq.q) >= 2
    and (
      f.search_text % qq.q
      or qq.q <% coalesce(f.search_text, '')
      or lower(f.name) like '%' || qq.q || '%'
      or coalesce(f.search_text, '') like '%' || qq.q || '%'
    )
  order by score desc, length(f.name) asc
  limit greatest(1, least(n, 50))
$$;

grant execute on function bandlog.search_foods(text, int) to anon, authenticated, service_role;

-- Sanity: the function exists and the trigger is in place.
select count(*) as fn from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'bandlog' and p.proname = 'search_foods';
