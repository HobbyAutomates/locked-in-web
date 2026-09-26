-- Undo docs/schema_v37.sql (v2.14). Drops the coach + buddy tables and the new profile columns.
-- Data in those tables is lost; take a backup first (scripts/backup-tables.mjs).
drop function if exists bandlog.buddy_nudge(uuid);
drop function if exists bandlog.my_buddies();
drop function if exists bandlog.logged_on(uuid, date);
drop function if exists bandlog.buddy_accept(text);
drop function if exists bandlog.buddy_invite_info(text);
drop function if exists bandlog.buddy_invite();
drop table if exists bandlog.buddy_invites;
drop table if exists bandlog.buddies;
drop function if exists bandlog.coach_prune();
drop table if exists bandlog.coach_safety_flags;
drop table if exists bandlog.coach_notes;
drop table if exists bandlog.coach_messages;
drop table if exists bandlog.coach_memory;
delete from bandlog.notifications where kind in ('coach', 'buddy');
alter table bandlog.notifications drop constraint if exists notifications_kind_check;
alter table bandlog.notifications add constraint notifications_kind_check
  check (kind in ('nudge', 'protein', 'fasting', 'checkin', 'system'));
drop trigger if exists profiles_guard_coach_style on bandlog.profiles;
drop function if exists bandlog.guard_coach_style();
alter table bandlog.profiles drop constraint if exists profiles_coach_style_check;
alter table bandlog.profiles drop constraint if exists profiles_training_days_check;
alter table bandlog.profiles drop constraint if exists profiles_heard_from_check;
alter table bandlog.profiles
  drop column if exists coach_style,
  drop column if exists heard_from,
  drop column if exists obstacles,
  drop column if exists training_days,
  drop column if exists sports,
  drop column if exists onboarded_v2,
  drop column if exists first_challenge,
  drop column if exists coach_note_time,
  drop column if exists coach_quiet_from,
  drop column if exists coach_quiet_to,
  drop column if exists coach_weekly_roast,
  drop column if exists coach_remember,
  drop column if exists milestones_seen;
