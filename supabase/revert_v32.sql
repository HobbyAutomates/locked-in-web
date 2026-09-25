-- REVERT for schema_v32 (foods.source_ref). Run only to roll the database back to v2.8/v2.9-without-sources-links.
-- Safe with any client: every reader retries without the column (src/lib/foodSearch.ts foodMeta),
-- and the USDA link falls back to an FDC search. Dropping it loses only the stored FDC ids / IFCT codes.
alter table bandlog.foods drop column if exists source_ref;
notify pgrst, 'reload schema';
