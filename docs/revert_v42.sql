-- REVERT for schema_v42 (v2.18 food: meal_items.kcal_low/high, profiles.water_from_food, leftovers,
-- meal_splits, shared_recipes, pantry_items, shares_squad(), is_squad_member()).
-- Run only to roll back. Safe with any client: every v2.18 food feature hides when its table is
-- missing, and meal_items inserts are retried without kcal_low / kcal_high.
-- Data in the four tables is lost (leftovers, pending splits, shared recipes, pantry).

drop table if exists bandlog.pantry_items;
drop table if exists bandlog.shared_recipes;
drop trigger if exists meal_splits_guard on bandlog.meal_splits;
drop table if exists bandlog.meal_splits;
drop function if exists bandlog.meal_splits_guard();
drop table if exists bandlog.leftovers;

alter table bandlog.profiles drop column if exists water_from_food;
alter table bandlog.meal_items drop column if exists kcal_high;
alter table bandlog.meal_items drop column if exists kcal_low;

drop function if exists bandlog.is_squad_member(uuid);
drop function if exists bandlog.shares_squad(uuid, uuid);

notify pgrst, 'reload schema';
