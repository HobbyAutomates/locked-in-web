-- v2.8 (file v28): foods.source check constraint adding 'ai' for live-lookup cache rows. Runs after v27 (challenges, other branch).
-- src/lib/liveFood.ts when the plate-scan cross-validation (src/lib/scanFlows.ts, plateFlow) finds
-- no acceptable table match for an item (see foodSearch.ts's isAcceptableMatch).
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
--
-- bandlog.foods.source has no existing CHECK constraint (schema_v17.sql only sets a default), so
-- "ai" already inserts today; this file makes the allowed set explicit and documents that it
-- deliberately ranks below every curated source.

alter table bandlog.foods
  drop constraint if exists foods_source_check;

alter table bandlog.foods
  add constraint foods_source_check check (source in ('custom', 'dish', 'ifct', 'usda', 'off', 'ai'));

comment on constraint foods_source_check on bandlog.foods is
  'v2.7: adds ai for live nutrition lookups cached by src/lib/liveFood.ts. The search_foods score CASE (schema_v25.sql) has no branch for ai, so it falls to the else bonus of 0.0, lower than every curated source (custom .20, dish .15, ifct .10, usda .05) with no RPC change needed.';
