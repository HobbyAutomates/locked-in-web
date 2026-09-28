-- REVERT for schema_v41 (profiles.member_no, profiles.is_founder, their triggers, member_plates()).
-- Run only to roll back. Safe with any client: both apps read the plate columns in their own query
-- and show no plate at all when they're missing (never FOUNDER). The tour stays new-users-only
-- through the client's created-at check.
--
-- NOT undone: the tour_seen_at backfill. It can't tell which rows were null before, and clearing
-- it would bring the tour back for everyone. If you need to, clear it by hand for chosen accounts.
drop function if exists bandlog.member_plates(uuid);
drop trigger if exists profiles_guard_member_plate on bandlog.profiles;
drop function if exists bandlog.profiles_guard_member_plate();
drop trigger if exists profiles_assign_member_no on bandlog.profiles;
drop function if exists bandlog.profiles_assign_member_no();
drop function if exists bandlog.next_member_no();
drop index if exists bandlog.profiles_member_no_key;
alter table bandlog.profiles drop column if exists is_founder;
alter table bandlog.profiles drop column if exists member_no;
notify pgrst, 'reload schema';
