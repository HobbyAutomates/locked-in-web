-- v2.5: single-unit preset defaults, five distinct milks, Hinglish/Hindi food aliases that
-- search_foods checks first, and general (non-band) workouts.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- 1. Milk: five different foods. Toned is NOT full cream; "doodh" / "normal milk" = full cream.
--    Per 100 ml (density ~1.03, logged as grams 1:1 like every drink in the app).
-- ---------------------------------------------------------------------------------------------
insert into bandlog.foods (id, name, aliases, calories, protein_g, carbs_g, fat_g, unit_name, unit_grams, source, region, names_local, units)
values
  ('milk-full', 'Milk (full cream)', array['milk','full cream milk','full fat milk','whole milk','doodh','dudh','normal milk','plain milk','regular milk','malai doodh','cow milk'],
     66, 3.2, 4.8, 3.9, 'glass', 250, 'custom', 'IN', '{"hi":"फुल क्रीम दूध"}'::jsonb,
     '[{"name":"glass","grams":250},{"name":"cup","grams":150},{"name":"tbsp","grams":15}]'::jsonb),
  ('milk-toned', 'Milk (toned)', array['toned milk','toned doodh','amul taaza','nandini blue'],
     58, 3.1, 4.7, 3.0, 'glass', 250, 'custom', 'IN', '{"hi":"टोंड दूध"}'::jsonb,
     '[{"name":"glass","grams":250},{"name":"cup","grams":150},{"name":"tbsp","grams":15}]'::jsonb),
  ('milk-double-toned', 'Milk (double toned)', array['double toned milk','double toned doodh','amul slim','nandini green'],
     45, 3.1, 4.7, 1.5, 'glass', 250, 'custom', 'IN', '{"hi":"डबल टोंड दूध"}'::jsonb,
     '[{"name":"glass","grams":250},{"name":"cup","grams":150},{"name":"tbsp","grams":15}]'::jsonb),
  ('milk-skimmed', 'Milk (skimmed)', array['skim milk','skimmed milk','fat free milk','low fat milk'],
     35, 3.4, 4.9, 0.1, 'glass', 250, 'custom', 'IN', '{"hi":"स्किम्ड दूध"}'::jsonb,
     '[{"name":"glass","grams":250},{"name":"cup","grams":150},{"name":"tbsp","grams":15}]'::jsonb),
  ('milk-buffalo', 'Milk (buffalo)', array['buffalo milk','bhains ka doodh','bhains doodh'],
     97, 3.7, 5.2, 6.9, 'glass', 250, 'custom', 'IN', '{"hi":"भैंस का दूध"}'::jsonb,
     '[{"name":"glass","grams":250},{"name":"cup","grams":150},{"name":"tbsp","grams":15}]'::jsonb)
on conflict (id) do update set
  name = excluded.name, aliases = excluded.aliases,
  calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
  unit_name = excluded.unit_name, unit_grams = excluded.unit_grams, source = excluded.source,
  names_local = excluded.names_local, units = excluded.units;

insert into bandlog.food_presets (id, food_id, label, label_hi, category, servings, default_serving, sort, icon)
values
  ('milk-full',         'milk-full',         'Milk (full cream)',   'फुल क्रीम दूध / मलाई वाला दूध', 'drink', '[{"label":"1 glass","grams":250},{"label":"1 cup","grams":150},{"label":"½ glass","grams":125}]'::jsonb, '1 glass', 40, 'glass'),
  ('milk-toned',        'milk-toned',        'Milk (toned)',        'टोंड दूध',                     'drink', '[{"label":"1 glass","grams":250},{"label":"1 cup","grams":150},{"label":"½ glass","grams":125}]'::jsonb, '1 glass', 41, 'glass'),
  ('milk-double-toned', 'milk-double-toned', 'Milk (double toned)', 'डबल टोंड दूध',                 'drink', '[{"label":"1 glass","grams":250},{"label":"1 cup","grams":150},{"label":"½ glass","grams":125}]'::jsonb, '1 glass', 42, 'glass'),
  ('milk-skimmed',      'milk-skimmed',      'Milk (skimmed)',      'स्किम्ड दूध',                    'drink', '[{"label":"1 glass","grams":250},{"label":"1 cup","grams":150},{"label":"½ glass","grams":125}]'::jsonb, '1 glass', 43, 'glass'),
  ('milk-buffalo',      'milk-buffalo',      'Milk (buffalo)',      'भैंस का दूध',                   'drink', '[{"label":"1 glass","grams":250},{"label":"1 cup","grams":150},{"label":"½ glass","grams":125}]'::jsonb, '1 glass', 44, 'glass')
on conflict (id) do update set
  food_id = excluded.food_id, label = excluded.label, label_hi = excluded.label_hi, category = excluded.category,
  servings = excluded.servings, default_serving = excluded.default_serving, sort = excluded.sort, icon = excluded.icon;

-- ---------------------------------------------------------------------------------------------
-- 2. Count presets default to ONE unit (the stepper picks the number). Missing 1-unit rows added.
-- ---------------------------------------------------------------------------------------------
update bandlog.food_presets set servings = '[{"label":"1 idli","grams":40},{"label":"2 idli","grams":80},{"label":"3 idli","grams":120},{"label":"4 idli","grams":160}]'::jsonb, default_serving = '1 idli' where id = 'idli';
update bandlog.food_presets set servings = '[{"label":"1 egg","grams":60},{"label":"2 eggs","grams":120},{"label":"3 eggs","grams":180}]'::jsonb, default_serving = '1 egg' where id = 'omelette';
update bandlog.food_presets set servings = '[{"label":"1 momo","grams":35},{"label":"6 momos","grams":210},{"label":"10 momos","grams":350}]'::jsonb, default_serving = '1 momo' where id in ('momos', 'r-momos');
update bandlog.food_presets set default_serving = '1 thepla' where id = 'thepla';
update bandlog.food_presets set default_serving = '1 vada' where id = 'medu-vada';
update bandlog.food_presets set default_serving = '1 roti' where id in ('roti', 'makki-roti');
update bandlog.food_presets set default_serving = '1 phulka' where id = 'phulka';
update bandlog.food_presets set default_serving = '1 egg' where id in ('boiled-egg', 'egg-whole', 'egg-bhurji');
update bandlog.food_presets set default_serving = '1 egg white' where id = 'egg-white';
update bandlog.food_presets set default_serving = '1 pav' where id = 'pav';
update bandlog.food_presets set default_serving = '1 slice' where id in ('bread-white', 'r-pizza');
update bandlog.food_presets set default_serving = '1 piece' where id in ('dhokla', 'pakora', 'kaju-katli', 'barfi', 'rasmalai', 'gulab-jamun', 'rasgulla');
update bandlog.food_presets set default_serving = '1 chilla' where id = 'besan-chilla';
update bandlog.food_presets set default_serving = '1 biscuit' where id = 'marie-biscuit';
update bandlog.food_presets set default_serving = '1 date' where id = 'dates';
update bandlog.food_presets set default_serving = '1 scoop' where id = 'whey';
update bandlog.food_presets set default_serving = '1 paratha' where id in ('aloo-paratha', 'plain-paratha');
update bandlog.food_presets set default_serving = '1 dosa' where id in ('plain-dosa', 'rava-dosa');

-- Every preset's servings list starts with its default serving (so count presets start with 1 unit).
update bandlog.food_presets p
set servings = (
  select coalesce(jsonb_agg(s order by (s->>'label') = p.default_serving desc, ord), '[]'::jsonb)
  from jsonb_array_elements(p.servings) with ordinality as t(s, ord)
)
where p.default_serving is not null
  and p.servings->0->>'label' is distinct from p.default_serving
  and exists (select 1 from jsonb_array_elements(p.servings) s where s->>'label' = p.default_serving);

-- ---------------------------------------------------------------------------------------------
-- 3. Aliases: Hinglish / Hindi words → the right food row. search_foods checks these first.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.food_aliases (
  alias text primary key,          -- normalised: lowercase, single spaces
  food_id text not null references bandlog.foods(id) on delete cascade,
  weight int default 100           -- tie-break when two aliases hit (higher wins)
);
alter table bandlog.food_aliases enable row level security;
drop policy if exists "aliases readable" on bandlog.food_aliases;
create policy "aliases readable" on bandlog.food_aliases for select using (true);
grant select on bandlog.food_aliases to anon, authenticated;
grant all on bandlog.food_aliases to service_role;

insert into bandlog.food_aliases (alias, food_id, weight) values
  -- full cream = the default "milk"
  ('milk', 'milk-full', 100), ('doodh', 'milk-full', 100), ('dudh', 'milk-full', 100), ('दूध', 'milk-full', 100),
  ('normal milk', 'milk-full', 100), ('plain milk', 'milk-full', 100), ('regular milk', 'milk-full', 100),
  ('normal doodh', 'milk-full', 100), ('full cream milk', 'milk-full', 100), ('full cream', 'milk-full', 100),
  ('full fat milk', 'milk-full', 100), ('malai doodh', 'milk-full', 100), ('malai wala doodh', 'milk-full', 100),
  ('cow milk', 'milk-full', 100), ('gai ka doodh', 'milk-full', 100), ('whole milk', 'milk-full', 100),
  ('फुल क्रीम दूध', 'milk-full', 100), ('मलाई वाला दूध', 'milk-full', 100), ('amul gold', 'milk-full', 100),
  -- toned
  ('toned', 'milk-toned', 110), ('toned doodh', 'milk-toned', 110), ('toned dudh', 'milk-toned', 110), ('toned milk', 'milk-toned', 110),
  ('टोंड दूध', 'milk-toned', 110), ('टोंड', 'milk-toned', 110), ('amul taaza', 'milk-toned', 110), ('nandini blue', 'milk-toned', 110),
  -- double toned
  ('double toned', 'milk-double-toned', 120), ('double toned milk', 'milk-double-toned', 120), ('double toned doodh', 'milk-double-toned', 120),
  ('डबल टोंड दूध', 'milk-double-toned', 120), ('nandini green', 'milk-double-toned', 120), ('amul slim', 'milk-double-toned', 120),
  ('amul slim n trim', 'milk-double-toned', 120),
  -- skimmed
  ('skim milk', 'milk-skimmed', 120), ('skimmed milk', 'milk-skimmed', 120), ('skim', 'milk-skimmed', 110), ('skimmed', 'milk-skimmed', 110),
  ('स्किम्ड दूध', 'milk-skimmed', 120), ('fat free milk', 'milk-skimmed', 120),
  -- buffalo
  ('bhains ka doodh', 'milk-buffalo', 120), ('bhains ka dudh', 'milk-buffalo', 120), ('buffalo milk', 'milk-buffalo', 120), ('भैंस का दूध', 'milk-buffalo', 120),
  -- staples
  ('roti', 'roti', 100), ('chapati', 'roti', 100), ('chapathi', 'roti', 100), ('phulka', 'roti', 100), ('रोटी', 'roti', 100), ('चपाती', 'roti', 100),
  ('dal', 'dal-cooked', 100), ('daal', 'dal-cooked', 100), ('dhal', 'dal-cooked', 100), ('दाल', 'dal-cooked', 100),
  ('curd', 'curd', 100), ('dahi', 'curd', 100), ('दही', 'curd', 100),
  ('paneer', 'ifct-paneer', 100), ('पनीर', 'ifct-paneer', 100),
  ('egg', 'egg', 100), ('eggs', 'egg', 100), ('anda', 'egg', 100), ('ande', 'egg', 100), ('अंडा', 'egg', 100), ('अंडे', 'egg', 100),
  ('rice', 'rice-cooked', 100), ('chawal', 'rice-cooked', 100), ('चावल', 'rice-cooked', 100),
  ('chai', 'tea', 100), ('tea', 'tea', 100), ('चाय', 'tea', 100),
  ('whey', 'whey', 100), ('whey protein', 'whey', 100), ('protein shake', 'whey', 100), ('whey shake', 'whey', 100), ('scoop', 'whey', 90),
  ('protein powder', 'whey', 100), ('व्हे प्रोटीन', 'whey', 100)
on conflict (alias) do update set food_id = excluded.food_id, weight = excluded.weight;

-- ---------------------------------------------------------------------------------------------
-- 4. search_foods: alias hits first (exact > alias starts with query > query starts with alias),
--    then the v1.7b trigram ranking. Same signature and columns as before.
-- ---------------------------------------------------------------------------------------------
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
  with qq as (select lower(regexp_replace(trim(q), '\s+', ' ', 'g')) as q),
  al as (
    select a.food_id,
           max(
             case
               when a.alias = qq.q then 3.0
               when length(qq.q) >= 3 and a.alias like qq.q || '%' then 2.0
               when qq.q like a.alias || ' %' then 1.5
               else 0
             end + coalesce(a.weight, 100) / 1000.0
           ) as boost
    from bandlog.food_aliases a, qq
    where a.alias = qq.q
       or (length(qq.q) >= 3 and a.alias like qq.q || '%')
       or qq.q like a.alias || ' %'
    group by a.food_id
  )
  select f.id, f.name, f.aliases,
         f.calories, f.protein_g, f.carbs_g, f.fat_g,
         f.fiber_g, f.sugar_g, f.sodium_mg, f.micros,
         f.source, f.region, f.names_local, f.units,
         f.unit_name, f.unit_grams,
         (
           coalesce(al.boost, 0)
           + greatest(
               similarity(lower(f.name), qq.q),
               similarity(coalesce(f.search_text, ''), qq.q),
               word_similarity(qq.q, coalesce(f.search_text, '')) * 0.9
             )
           + case when lower(f.name) = qq.q or qq.q = any (select lower(x) from unnest(f.aliases) x) then 1.0 else 0.0 end
           + case f.source when 'custom' then 0.20 when 'dish' then 0.15 when 'ifct' then 0.10 when 'usda' then 0.05 else 0.0 end
         )::real as score
  from bandlog.foods f
  cross join qq
  left join al on al.food_id = f.id
  where length(qq.q) >= 2
    and (
      al.food_id is not null
      or f.search_text % qq.q
      or qq.q <% coalesce(f.search_text, '')
      or lower(f.name) like '%' || qq.q || '%'
      or coalesce(f.search_text, '') like '%' || qq.q || '%'
    )
  order by (al.food_id is not null) desc, score desc, length(f.name) asc
  limit greatest(1, least(n, 50))
$$;
grant execute on function bandlog.search_foods(text, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. General workouts: gym / bodyweight / bands / cardio / sport / yoga.
--    exercises_json = [{ "name": string, "sets": [{ "kg": number|null, "reps": number }] }]
-- ---------------------------------------------------------------------------------------------
alter table bandlog.workouts
  add column if not exists kind text default 'bands',
  add column if not exists exercises_json jsonb;
update bandlog.workouts set kind = 'bands' where kind is null;
alter table bandlog.workouts drop constraint if exists workouts_kind_check;
alter table bandlog.workouts add constraint workouts_kind_check check (kind in ('gym', 'bodyweight', 'bands', 'cardio', 'sport', 'yoga'));

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------------------------
select json_build_object(
  'toned_doodh', (select json_agg(s.name order by ord) from (select name, row_number() over () ord from bandlog.search_foods('toned doodh', 3)) s),
  'doodh', (select json_agg(s.name order by ord) from (select name, row_number() over () ord from bandlog.search_foods('doodh', 3)) s),
  'normal_milk', (select json_agg(s.name order by ord) from (select name, row_number() over () ord from bandlog.search_foods('normal milk', 3)) s),
  'hindi_doodh', (select json_agg(s.name order by ord) from (select name, row_number() over () ord from bandlog.search_foods('दूध', 3)) s),
  'double_toned', (select json_agg(s.name order by ord) from (select name, row_number() over () ord from bandlog.search_foods('double toned', 2)) s),
  'aliases', (select count(*) from bandlog.food_aliases),
  'milk_presets', (select json_agg(p.id || '→' || p.food_id || ' ' || f.calories || 'kcal' order by p.sort) from bandlog.food_presets p join bandlog.foods f on f.id = p.food_id where p.id like 'milk-%'),
  'multi_unit_defaults', (select json_agg(id || ':' || default_serving) from bandlog.food_presets where default_serving ~ '^[2-9]'),
  'default_not_first', (select count(*) from bandlog.food_presets where servings->0->>'label' is distinct from default_serving),
  'workout_cols', (select json_agg(column_name) from information_schema.columns where table_schema = 'bandlog' and table_name = 'workouts' and column_name in ('kind', 'exercises_json')),
  'workouts_not_bands', (select count(*) from bandlog.workouts where kind is distinct from 'bands')
) as result;
