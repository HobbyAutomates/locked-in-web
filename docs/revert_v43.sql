-- REVERT for schema_v43 (v2.18 coach stream). Run only to roll back.
-- Safe with any client: both apps treat every v43 object as optional (the check-in, supplements,
-- weekly review, festival / cycle cards hide; form checks and fasts still run, just unsaved).
-- Dropping these tables DELETES users' check-ins, supplement lists and streaks, weekly reviews,
-- festival dates, cycle settings and form-check history. Export first if in doubt.
alter table bandlog.fasting_sessions drop constraint if exists fasting_sessions_preset_check;
alter table bandlog.fasting_sessions drop column if exists preset;
drop table if exists bandlog.form_checks;
drop table if exists bandlog.cycle_settings;
drop table if exists bandlog.festival_modes;
drop table if exists bandlog.coach_reviews;
drop table if exists bandlog.supplement_reminders_sent;
drop table if exists bandlog.supplement_logs;
drop table if exists bandlog.supplements;
drop table if exists bandlog.daily_checkins;
notify pgrst, 'reload schema';
