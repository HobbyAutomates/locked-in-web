-- v2.0: Groups (squads), daily wrap, restaurant portions
create table if not exists bandlog.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,                         -- 6-char invite code, e.g. LOCKD7
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists bandlog.group_members (
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
-- Per-user daily rollup the squad board reads (written by the apps after each save; recomputable).
create table if not exists bandlog.daily_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  trained boolean not null default false,
  protein_g numeric(6,1) not null default 0,
  calories numeric(7,1) not null default 0,
  burned numeric(7,1) not null default 0,
  meals int not null default 0,
  week_streak int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
create table if not exists bandlog.nudges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'nudge',
  created_at timestamptz not null default now()
);
alter table bandlog.groups enable row level security;
alter table bandlog.group_members enable row level security;
alter table bandlog.daily_stats enable row level security;
alter table bandlog.nudges enable row level security;

-- helper: is the caller a member of the group?
create or replace function bandlog.is_member(g uuid) returns boolean language sql security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.group_members m where m.group_id = g and m.user_id = auth.uid());
$$;

drop policy if exists "groups read member" on bandlog.groups;
create policy "groups read member" on bandlog.groups for select using (bandlog.is_member(id) or owner_id = auth.uid());
drop policy if exists "groups insert own" on bandlog.groups;
create policy "groups insert own" on bandlog.groups for insert with check (owner_id = auth.uid());
drop policy if exists "groups update owner" on bandlog.groups;
create policy "groups update owner" on bandlog.groups for update using (owner_id = auth.uid());
drop policy if exists "groups delete owner" on bandlog.groups;
create policy "groups delete owner" on bandlog.groups for delete using (owner_id = auth.uid());

drop policy if exists "members read" on bandlog.group_members;
create policy "members read" on bandlog.group_members for select using (bandlog.is_member(group_id));
drop policy if exists "members join self" on bandlog.group_members;
create policy "members join self" on bandlog.group_members for insert with check (user_id = auth.uid());
drop policy if exists "members leave self" on bandlog.group_members;
create policy "members leave self" on bandlog.group_members for delete using (user_id = auth.uid());
drop policy if exists "members update self" on bandlog.group_members;
create policy "members update self" on bandlog.group_members for update using (user_id = auth.uid());

-- Squad-mates can read each other's rollups (share_stats decides what the apps SHOW; RLS just gates group membership).
drop policy if exists "stats own" on bandlog.daily_stats;
create policy "stats own" on bandlog.daily_stats for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "stats squad read" on bandlog.daily_stats;
create policy "stats squad read" on bandlog.daily_stats for select using (
  exists (select 1 from bandlog.group_members a join bandlog.group_members b on a.group_id = b.group_id where a.user_id = auth.uid() and b.user_id = daily_stats.user_id)
);
drop policy if exists "nudges member" on bandlog.nudges;
create policy "nudges member" on bandlog.nudges for all using (bandlog.is_member(group_id)) with check (from_user = auth.uid() and bandlog.is_member(group_id));

-- Join by code without being able to read the groups table first.
create or replace function bandlog.join_group(p_code text, p_name text) returns uuid language plpgsql security definer set search_path = bandlog as $$
declare gid uuid;
begin
  select id into gid from bandlog.groups where code = upper(trim(p_code));
  if gid is null then raise exception 'No group with that code'; end if;
  insert into bandlog.group_members (group_id, user_id, display_name) values (gid, auth.uid(), coalesce(p_name,'')) on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return gid;
end $$;
grant execute on function bandlog.join_group(text, text) to authenticated;
grant execute on function bandlog.is_member(uuid) to authenticated;
grant all on all tables in schema bandlog to anon, authenticated, service_role;
select 'ok' as v20;
