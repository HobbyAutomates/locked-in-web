-- REVERT for schema_v34 (profiles.hide_numbers, profiles.waist_cm). Run only to roll back.
-- Safe with any client: both apps read these columns in a separate query and treat a missing
-- column as "off / not entered". Dropping them loses users' hide-numbers choice and waist entries.
alter table bandlog.profiles drop constraint if exists profiles_waist_cm_range;
alter table bandlog.profiles drop column if exists waist_cm;
alter table bandlog.profiles drop column if exists hide_numbers;
notify pgrst, 'reload schema';
