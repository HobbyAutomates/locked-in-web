-- REVERT for schema_v40 (profiles.cover_preset, profiles.tour_seen_at). Run only to roll back.
-- Safe with any client: both apps read these columns in a separate query and fall back to local
-- storage / the device flag when they're missing. Dropping them loses users' saved covers (they go
-- back to the default plates cover unless the browser / phone kept a local copy) and the account's
-- "tour seen" flag (a device that never saw the tour would show it once).
alter table bandlog.profiles drop constraint if exists profiles_cover_preset_format;
alter table bandlog.profiles drop column if exists tour_seen_at;
alter table bandlog.profiles drop column if exists cover_preset;
notify pgrst, 'reload schema';
