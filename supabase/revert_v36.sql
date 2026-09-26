-- Undo schema_v36.sql. Drops the v2.13 tables (their data is lost — back them up first with
-- scripts/backup-tables.mjs) and the added columns.
drop trigger if exists nudges_notify on bandlog.nudges;
drop function if exists bandlog.nudge_to_notification();
drop trigger if exists profiles_guard_plan on bandlog.profiles;
drop function if exists bandlog.guard_plan();
drop function if exists bandlog.has_pro(uuid);
drop table if exists bandlog.notifications;
drop table if exists bandlog.push_subscriptions;
drop table if exists bandlog.app_config;
drop table if exists bandlog.body_measurements;
drop table if exists bandlog.recipes;
drop table if exists bandlog.fasting_sessions;
drop table if exists bandlog.weekly_checkins;
drop table if exists bandlog.routines;
alter table bandlog.progress_photos drop constraint if exists progress_photos_pose_check;
alter table bandlog.progress_photos drop column if exists weight_kg, drop column if exists pose, drop column if exists updated_at;
alter table bandlog.profiles drop constraint if exists profiles_plan_check;
alter table bandlog.profiles drop constraint if exists profiles_diet_mode_check;
alter table bandlog.profiles drop column if exists plan, drop column if exists pro_until,
  drop column if exists diet_mode, drop column if exists adaptive_targets, drop column if exists protein_nudge,
  drop column if exists protein_nudge_time, drop column if exists fasting_hours;
delete from bandlog.label_scans where kind = 'menu';
alter table bandlog.label_scans drop constraint if exists label_scans_kind_check;
alter table bandlog.label_scans add constraint label_scans_kind_check check (kind in ('label', 'barcode', 'photo'));
