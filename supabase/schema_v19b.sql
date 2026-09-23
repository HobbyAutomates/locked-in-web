-- v1.9b: meal items may now come straight from a scan report ("Log 1 serving"), a preset or a search.
-- Presets/search rows are priced from bandlog.foods so they stay 'table'; a scan carries the
-- label's own per-100 g numbers, hence its own source value.
alter table bandlog.meal_items drop constraint if exists meal_items_source_check;
alter table bandlog.meal_items add constraint meal_items_source_check check (source in ('table','estimated','scan'));
select pg_get_constraintdef(oid) as meal_items_source from pg_constraint where conrelid = 'bandlog.meal_items'::regclass and conname = 'meal_items_source_check';
