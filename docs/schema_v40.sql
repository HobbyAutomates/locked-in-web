-- v2.16 (schema_v40): profiles.cover_preset + profiles.tour_seen_at. Additive and idempotent.
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
-- Undo with docs/revert_v40.sql. Needs nothing newer than v39.
--
--   cover_preset  The Profile cover the user picked (boards CoverPicker / CoverPresets): one of the
--                 34 preset ids in docs/v216-shared.md ("plates-light" … "ember-dark"). Null = the
--                 default plates cover (#01). Clients ignore unknown ids and show the default.
--   tour_seen_at  When the account finished or skipped the v2.16 first-run tour (boards TourF1–F5).
--                 Null = not seen. Clients also remember "seen" per device, so this is only the
--                 cross-device copy.
--
-- Clients tolerate both columns being missing: web src/lib/data.ts getV216Profile() reads them in
-- their own query (available = false → the cover lives in local storage, the tour uses the device
-- flag only) and src/lib/v216Actions.ts treats a missing-column error as "not stored". Android does
-- the same. Existing RLS on bandlog.profiles (owner-only read/write) already covers the new columns.

alter table bandlog.profiles add column if not exists cover_preset text;
alter table bandlog.profiles add column if not exists tour_seen_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_cover_preset_format') then
    alter table bandlog.profiles add constraint profiles_cover_preset_format
      check (cover_preset is null or cover_preset ~ '^[a-z]{2,16}-(light|dark)$');
  end if;
end $$;

comment on column bandlog.profiles.cover_preset is
  'v2.16: Profile cover preset id (e.g. plates-light … ember-dark, see docs/v216-shared.md). Null = default plates cover.';
comment on column bandlog.profiles.tour_seen_at is
  'v2.16: when the first-run tour was finished or skipped on any device. Null = not seen.';

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'has_cover_preset', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'cover_preset'),
  'has_tour_seen_at', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'tour_seen_at'),
  'covers_set', (select count(*) from bandlog.profiles where cover_preset is not null)
) as result;
