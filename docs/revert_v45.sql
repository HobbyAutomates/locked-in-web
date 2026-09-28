-- REVERT for schema_v45 (v2.18 platform: ui_lang, blocks, reports, wipe_user). Run only to roll
-- back. Safe with any client: the language stays on each device, blocks fall back to the device
-- list, Report says it'll be sent later, and account deletion still deletes the auth user.
-- Loses data: block lists, reports, the saved UI language.
drop function if exists bandlog.wipe_user(uuid);
drop table if exists bandlog.content_reports;
drop table if exists bandlog.user_blocks;
alter table bandlog.profiles drop constraint if exists profiles_ui_lang_check;
alter table bandlog.profiles drop column if exists ui_lang;
notify pgrst, 'reload schema';
