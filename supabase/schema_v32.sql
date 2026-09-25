-- v2.9 (schema_v32, area "sources"): foods.source_ref for the "Where's this from?" sheet. Idempotent.
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
-- (schema_v31 is the v2.9 "social" area's; the two are independent and can run in either order.)
--
-- bandlog.foods had no dataset id: ids are slugs ("usda-oats", "ifct-paneer"), so the app could not
-- link a USDA row to its FoodData Central page. source_ref holds the dataset's own id:
--   usda / usda_foundation → the FDC id (https://fdc.nal.usda.gov/food-details/<fdc_id>)
--   ifct                   → the IFCT 2017 food code (e.g. "A001"), shown as text
--   everything else        → null (off rows already carry `barcode`; dish/custom/ai have no id)
--
-- Clients tolerate the column being missing: src/lib/foodSearch.ts foodMeta() retries its select
-- without it and the sheet falls back to an FDC search link. Rows get their ids when
-- scripts/import-foods.mts is next run (it now writes source_ref, and skips it until this is applied).

alter table bandlog.foods add column if not exists source_ref text;

comment on column bandlog.foods.source_ref is
  'v2.9: the source dataset''s own id - USDA FDC id for usda rows, IFCT 2017 code for ifct rows; null otherwise. Used for the source links in the app.';

-- The two hand-added USDA rows in scripts/import-foods-gapfill.mjs name their FDC ids in its comments.
update bandlog.foods set source_ref = '174288' where id = 'usda-besan' and source_ref is null;
update bandlog.foods set source_ref = '170150' where id = 'usda-sesame-seeds' and source_ref is null;

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'has_column', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'foods' and column_name = 'source_ref'),
  'with_ref', (select count(*) from bandlog.foods where source_ref is not null)
) as result;
