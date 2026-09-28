-- v2.17 (schema_v41): member plates and a tour for new users only. Needs schema_v40 (tour_seen_at).
-- Additive and idempotent (safe to re-run). Undo with docs/revert_v41.sql.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it by hand.
-- THIS web copy is the source of truth; the Android repo only points here.
--
--   member_no   int     1, 2, 3 … in sign-up order (backfilled by profiles.created_at, then id).
--                       New rows get max + 1 from a BEFORE INSERT trigger. Unique.
--   is_founder  boolean true only for the owner's two accounts.
--
-- Plate rule (web src/lib/memberPlate.ts, Android util/MemberPlate.kt), in order:
--   is_founder → gold "FOUNDER"; member_no <= 50 → "OG #07" (gunmetal); otherwise no plate.
-- Both clients read the two columns in their own query. Missing columns (before v41) = no plate.
--
-- Users can't change either column: RLS lets owners update their own profile row, so a BEFORE
-- UPDATE trigger puts the old values back unless the caller is postgres or service_role, and
-- the BEFORE INSERT trigger ignores values a client sends.
--
-- The tour: every profile that exists when this runs gets tour_seen_at = now() where it is null,
-- so no existing account sees the first-run tour. Clients also show it only to accounts created
-- after 2026-09-28T21:00:00Z (the v2.16 release). That client check also covers the time before
-- v41 is applied.
--
-- Squadmates: squad lists are read through security-definer RPCs (squad_board, group_leaderboard,
-- group_members_detail), and profiles RLS is owner-only, so a client can't read another member's
-- plate directly. The existing RPCs aren't in this repo's docs, so they are NOT redefined here.
-- A new RPC, member_plates(g), returns the plate columns for everyone in a squad the caller is in.
-- Clients join it by user_id. Web v2.17 shows plates only on your own Profile, so it doesn't call it
-- yet. It's there for any squad view that wants plates.

-- ---------------------------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles add column if not exists member_no int;
alter table bandlog.profiles add column if not exists is_founder boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- 2. Backfill member_no in sign-up order (only rows that don't have one yet, after the current max)
-- ---------------------------------------------------------------------------------------------
with base as (select coalesce(max(member_no), 0) as n from bandlog.profiles),
ranked as (
  select p.id, (select n from base) + row_number() over (order by p.created_at, p.id) as no
    from bandlog.profiles p
   where p.member_no is null
)
update bandlog.profiles p set member_no = r.no from ranked r where p.id = r.id;

create unique index if not exists profiles_member_no_key on bandlog.profiles (member_no);

-- ---------------------------------------------------------------------------------------------
-- 3. The owner's accounts
-- ---------------------------------------------------------------------------------------------
update bandlog.profiles set is_founder = true
 where id in ('455c4cfc-c6ac-4992-aafb-dae87680b003', '89115cfe-624b-4d8d-8ee0-aa163974c644')
   and is_founder is distinct from true;

-- ---------------------------------------------------------------------------------------------
-- 4. New rows: the next number. An advisory lock stops two sign-ups at the same moment from
--    getting the same number (which the unique index would turn into a failed sign-up).
--    Only postgres / service_role can choose member_no or is_founder on insert.
-- ---------------------------------------------------------------------------------------------
-- The next number, under a lock. Security definer so it sees every row (profiles RLS is owner-only).
create or replace function bandlog.next_member_no() returns int
language plpgsql volatile security definer set search_path = bandlog as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('bandlog.profiles.member_no'));
  select coalesce(max(member_no), 0) + 1 into n from bandlog.profiles;
  return n;
end $$;
revoke all on function bandlog.next_member_no() from public, anon;
grant execute on function bandlog.next_member_no() to authenticated, service_role;

-- Not security definer: current_user here is whoever ran the INSERT (postgres inside the sign-up
-- trigger, authenticated for a client insert).
create or replace function bandlog.profiles_assign_member_no() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if current_user not in ('postgres', 'service_role') then
    new.member_no := null;
    new.is_founder := false;
  end if;
  if new.member_no is null then
    new.member_no := bandlog.next_member_no();
  end if;
  new.is_founder := coalesce(new.is_founder, false);
  return new;
end $$;
drop trigger if exists profiles_assign_member_no on bandlog.profiles;
create trigger profiles_assign_member_no before insert on bandlog.profiles
  for each row execute function bandlog.profiles_assign_member_no();

-- ---------------------------------------------------------------------------------------------
-- 5. Users can't edit either column (the owner-update RLS policy would otherwise allow it)
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.profiles_guard_member_plate() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if current_user not in ('postgres', 'service_role') then
    new.member_no := old.member_no;
    new.is_founder := old.is_founder;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_member_plate on bandlog.profiles;
create trigger profiles_guard_member_plate before update on bandlog.profiles
  for each row execute function bandlog.profiles_guard_member_plate();

-- ---------------------------------------------------------------------------------------------
-- 6. Squadmates' plates: everyone in squad g, only when the caller is in g too
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.member_plates(g uuid)
returns table (user_id uuid, member_no int, is_founder boolean)
language sql stable security definer set search_path = bandlog as $$
  select m.user_id, p.member_no, coalesce(p.is_founder, false)
    from bandlog.group_members m
    join bandlog.profiles p on p.id = m.user_id
   where m.group_id = g
     and exists (select 1 from bandlog.group_members me where me.group_id = g and me.user_id = auth.uid());
$$;
revoke all on function bandlog.member_plates(uuid) from public, anon;
grant execute on function bandlog.member_plates(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. The tour is for new users only: every existing profile counts as having seen it
-- ---------------------------------------------------------------------------------------------
update bandlog.profiles set tour_seen_at = now() where tour_seen_at is null;

comment on column bandlog.profiles.member_no is
  'v2.17: sign-up order (1 = first). Set by trigger profiles_assign_member_no; users cannot change it. <= 50 shows the "OG #nn" plate.';
comment on column bandlog.profiles.is_founder is
  'v2.17: the owner''s accounts. Shows the gold FOUNDER plate. Users cannot change it.';

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'has_member_no', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'member_no'),
  'has_is_founder', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'is_founder'),
  'profiles', (select count(*) from bandlog.profiles),
  'numbered', (select count(*) from bandlog.profiles where member_no is not null),
  'max_member_no', (select max(member_no) from bandlog.profiles),
  'og', (select count(*) from bandlog.profiles where member_no <= 50 and not is_founder),
  'founders', (select count(*) from bandlog.profiles where is_founder),
  'tour_unseen', (select count(*) from bandlog.profiles where tour_seen_at is null)
) as result;
