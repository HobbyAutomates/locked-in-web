-- v2.18 "platform" (schema_v45): Area E of docs v218-spec. UI language, report + block in
-- squads, and the account-deletion wipe. Independent of schema_v44; needs
-- v20 / v26 for the squad tables. Additive and idempotent. Undo with docs/revert_v45.sql.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it by hand.
-- THIS web copy is the source of truth; the Android repo only points here.
--
-- Clients tolerate this file missing: the language lives on the device (web localStorage +
-- cookie `li-lang`, Android SharedPreferences) and is only mirrored to profiles.ui_lang; block
-- lists fall back to the device; "Report" says it will be sent with the next update; account
-- deletion still works (the server deletes the auth user, which cascades) but without the
-- squad-ownership hand-over below.

-- ---------------------------------------------------------------------------------------------
-- 1. E2 UI language: 'en' English, 'hinglish' Hinglish (Roman), 'hi' Hindi (Devanagari).
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles add column if not exists ui_lang text;
alter table bandlog.profiles drop constraint if exists profiles_ui_lang_check;
alter table bandlog.profiles add constraint profiles_ui_lang_check check (ui_lang is null or ui_lang in ('en', 'hinglish', 'hi'));

-- ---------------------------------------------------------------------------------------------
-- 2. E5 Report and block in squads.
--    Blocking hides the person's posts, messages and reactions from me in every squad (client
--    side filter) and stops their nudges / cheers / freeze gifts reaching me (not enforced here;
--    those RPCs are rate-limited and squad-only already). Reports go to the admin queue.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table bandlog.user_blocks enable row level security;
drop policy if exists "blocks own all" on bandlog.user_blocks;
create policy "blocks own all" on bandlog.user_blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
grant select, insert, delete on bandlog.user_blocks to authenticated;
grant all on bandlog.user_blocks to service_role;

create table if not exists bandlog.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user uuid references auth.users(id) on delete set null,
  group_id uuid references bandlog.groups(id) on delete set null,
  post_id uuid,
  reason text not null check (reason in ('spam', 'abuse', 'nudity', 'self_harm', 'other')),
  note text not null default '' check (length(note) <= 500),
  snapshot text not null default '' check (length(snapshot) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists content_reports_status_idx on bandlog.content_reports (status, created_at desc);
alter table bandlog.content_reports enable row level security;
drop policy if exists "reports own read" on bandlog.content_reports;
create policy "reports own read" on bandlog.content_reports for select using (reporter_id = auth.uid());
drop policy if exists "reports own insert" on bandlog.content_reports;
create policy "reports own insert" on bandlog.content_reports for insert
  with check (reporter_id = auth.uid() and (group_id is null or bandlog.is_member(group_id)));
grant select, insert on bandlog.content_reports to authenticated;
grant all on bandlog.content_reports to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. E5 Account deletion. The web route /api/account/delete (service role) calls this, removes
--    the person's storage files, then deletes the auth user (every bandlog table cascades on
--    auth.users). Squads they own pass to the longest-standing other member first, so deleting
--    an account never deletes other people's squad; a squad with nobody else is deleted.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.wipe_user(u uuid) returns jsonb
language plpgsql security definer set search_path = bandlog as $$
declare
  g record;
  heir uuid;
  moved int := 0;
  dropped int := 0;
  t record;
  n int;
  total int := 0;
begin
  if u is null then raise exception 'No user'; end if;
  for g in select x.id from bandlog.groups x where x.owner_id = u loop
    select m.user_id into heir from bandlog.group_members m where m.group_id = g.id and m.user_id <> u order by m.joined_at limit 1;
    if heir is null then
      delete from bandlog.groups where id = g.id;
      dropped := dropped + 1;
    else
      update bandlog.groups set owner_id = heir where id = g.id;
      moved := moved + 1;
    end if;
  end loop;
  -- Every bandlog table with a user_id column (belt and braces: they all cascade anyway).
  for t in select c.table_name from information_schema.columns c
            join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
           where c.table_schema = 'bandlog' and c.column_name = 'user_id' loop
    execute format('delete from bandlog.%I where user_id = $1', t.table_name) using u;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  delete from bandlog.profiles where id = u;
  return jsonb_build_object('squads_handed_over', moved, 'squads_deleted', dropped, 'rows', total);
end $$;
revoke all on function bandlog.wipe_user(uuid) from public, anon, authenticated;
grant execute on function bandlog.wipe_user(uuid) to service_role;

notify pgrst, 'reload schema';

-- Applied 2026-09-29 as migration v45b: pin search_path on the two v44 helpers (Supabase linter).
alter function bandlog.soc_today() set search_path = bandlog;
alter function bandlog.soc_trusted() set search_path = bandlog;
