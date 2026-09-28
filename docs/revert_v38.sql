-- Undo docs/schema_v38.sql (v2.15 accuracy). Drops the overrides, correction log and entry log
-- tables (their data is lost — take a backup first: scripts/backup-tables.mjs), removes the web
-- food rows and puts the foods.source check back to its v28 set, and drops the meal_items columns.
drop table if exists bandlog.log_events;
drop table if exists bandlog.food_corrections;
drop table if exists bandlog.user_food_overrides;

delete from bandlog.foods where source = 'web';
alter table bandlog.foods drop constraint if exists foods_source_check;
alter table bandlog.foods add constraint foods_source_check
  check (source in ('custom', 'dish', 'ifct', 'usda', 'off', 'ai'));

alter table bandlog.meal_items drop constraint if exists meal_items_source_urls_array;
alter table bandlog.meal_items
  drop column if exists user_verified,
  drop column if exists per_unit_kcal,
  drop column if exists source_urls;

notify pgrst, 'reload schema';
