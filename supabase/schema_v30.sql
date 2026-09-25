-- v2.8 (schema_v30): meal types. Idempotent: safe to re-run.
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
--
-- bandlog.meals.meal_type: breakfast | lunch | dinner | snack. Home groups meals into
-- Breakfast · Lunch · Dinner · Snacks. Clients tolerate the column being null (they fall back to
-- the hour rule below) and missing (they retry the insert / update without it).
--
-- The hour rule (Asia/Kolkata, the zone every "today" in the app uses):
--   04:00–10:59 breakfast · 11:00–15:59 lunch · 16:00–18:59 snack · 19:00–03:59 dinner
-- Mirrors src/lib/mealType.ts (web) and util/MealTypes.kt (Android); keep all three in lockstep.
--
-- meal_type never changes how a meal is counted: daily_stats.meals is still one per meals row.

-- ---------------------------------------------------------------------------------------------
-- 1. The column and its check constraint.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.meals add column if not exists meal_type text;

-- Named, so a re-run (or a column that already exists without a check) ends with exactly one.
alter table bandlog.meals drop constraint if exists meals_meal_type_check;
alter table bandlog.meals add constraint meals_meal_type_check check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));

-- ---------------------------------------------------------------------------------------------
-- 2. Backfill existing meals from created_at's hour in India. Only rows still null, so a re-run
--    never overwrites a type the user picked.
-- ---------------------------------------------------------------------------------------------
update bandlog.meals
set meal_type = case
  when extract(hour from (created_at at time zone 'Asia/Kolkata')) between 4 and 10 then 'breakfast'
  when extract(hour from (created_at at time zone 'Asia/Kolkata')) between 11 and 15 then 'lunch'
  when extract(hour from (created_at at time zone 'Asia/Kolkata')) between 16 and 18 then 'snack'
  else 'dinner'
end
where meal_type is null
  and created_at is not null;

-- ---------------------------------------------------------------------------------------------
-- 3. Verification: every meal typed, counts per type, and the constraint in place.
-- ---------------------------------------------------------------------------------------------
select
  count(*) as meals,
  count(*) filter (where meal_type is null) as untyped,
  count(*) filter (where meal_type = 'breakfast') as breakfast,
  count(*) filter (where meal_type = 'lunch') as lunch,
  count(*) filter (where meal_type = 'dinner') as dinner,
  count(*) filter (where meal_type = 'snack') as snack,
  (select count(*) from pg_constraint where conname = 'meals_meal_type_check' and conrelid = 'bandlog.meals'::regclass) as check_constraints
from bandlog.meals;
