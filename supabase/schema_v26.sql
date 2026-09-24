-- v2.6: Water v2 (reminders, glass size, vessels) + Squads v2 (usernames, icons, public/private with
-- join requests, chat + feed posts, flame leaderboard, member details). Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- 1. Profiles: username + water settings
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles
  add column if not exists username text,
  add column if not exists water_reminder_from time default '08:00',
  add column if not exists water_reminder_to time default '22:00',
  add column if not exists water_reminder_every_min int default 0,
  add column if not exists water_glass_ml int default 250;

alter table bandlog.profiles drop constraint if exists profiles_username_format;
alter table bandlog.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
alter table bandlog.profiles drop constraint if exists profiles_water_every_check;
alter table bandlog.profiles add constraint profiles_water_every_check check (water_reminder_every_min is null or water_reminder_every_min in (0, 30, 60, 120, 180, 240));
alter table bandlog.profiles drop constraint if exists profiles_water_glass_check;
alter table bandlog.profiles add constraint profiles_water_glass_check check (water_glass_ml is null or water_glass_ml between 50 and 2000);
create unique index if not exists profiles_username_key on bandlog.profiles (username);

-- Backfill: email local-part, lowercased, only [a-z0-9_], padded to 3 and cut to 17, then _2, _3... on collision.
do $$
declare
  r record;
  base text;
  cand text;
  i int;
begin
  for r in select p.id, u.email from bandlog.profiles p join auth.users u on u.id = p.id where p.username is null order by u.created_at loop
    base := regexp_replace(lower(split_part(coalesce(r.email, ''), '@', 1)), '[^a-z0-9_]', '', 'g');
    if length(base) < 3 then base := rpad(coalesce(nullif(base, ''), 'user'), 3, '0'); end if;
    base := left(base, 17);
    cand := base;
    i := 1;
    while exists (select 1 from bandlog.profiles x where x.username = cand) loop
      i := i + 1;
      cand := base || '_' || i;
    end loop;
    update bandlog.profiles set username = cand where id = r.id;
  end loop;
end $$;

-- Is this username free (and well-formed)? The caller's own current username counts as available.
create or replace function bandlog.username_available(u text) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select lower(trim(coalesce(u, ''))) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from bandlog.profiles p where p.username = lower(trim(u)) and p.id is distinct from auth.uid());
$$;
grant execute on function bandlog.username_available(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Water: which vessel each row came from
-- ---------------------------------------------------------------------------------------------
alter table bandlog.water_log add column if not exists vessel text;
alter table bandlog.water_log drop constraint if exists water_log_vessel_check;
alter table bandlog.water_log add constraint water_log_vessel_check check (vessel is null or vessel in ('glass', 'bottle', 'large', 'custom'));

-- ---------------------------------------------------------------------------------------------
-- 3. Groups: description, icon, tags, join policy, invite_code (= code)
-- ---------------------------------------------------------------------------------------------
alter table bandlog.groups
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists tags text[] default '{}',
  add column if not exists join_policy text default 'open';
alter table bandlog.groups drop constraint if exists groups_join_policy_check;
alter table bandlog.groups add constraint groups_join_policy_check check (join_policy in ('open', 'request'));
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'groups' and column_name = 'invite_code') then
    alter table bandlog.groups add column invite_code text generated always as (code) stored;
  end if;
end $$;
update bandlog.groups set join_policy = 'open' where join_policy is null;

-- Icons for the seeded public squads.
update bandlog.groups set icon = 'trophy' where icon is null and name = 'Locked In Bengaluru';
update bandlog.groups set icon = 'flame' where icon is null and name = 'Cutting Season';
update bandlog.groups set icon = 'biceps' where icon is null and name = 'Bulk Szn';
update bandlog.groups set icon = 'runner' where icon is null and name = '10k Steps Club';

-- ---------------------------------------------------------------------------------------------
-- 4. Join requests (private squads: request, owner approves)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
create unique index if not exists group_join_requests_pending_key on bandlog.group_join_requests (group_id, user_id) where status = 'pending';
create index if not exists group_join_requests_group_idx on bandlog.group_join_requests (group_id, status);
alter table bandlog.group_join_requests enable row level security;
drop policy if exists "requests read own or owner" on bandlog.group_join_requests;
create policy "requests read own or owner" on bandlog.group_join_requests for select using (
  user_id = auth.uid() or exists (select 1 from bandlog.groups g where g.id = group_id and g.owner_id = auth.uid())
);
drop policy if exists "requests cancel own" on bandlog.group_join_requests;
create policy "requests cancel own" on bandlog.group_join_requests for delete using (user_id = auth.uid());

-- Look a squad up by its invite code (the /join/<code> page) without being able to read groups.
create or replace function bandlog.group_by_code(p_code text)
returns table (id uuid, name text, description text, icon text, cover_url text, tagline text, is_public boolean, join_policy text, member_count bigint, joined boolean, requested boolean)
language sql stable security definer set search_path = bandlog as $$
  select g.id, g.name, g.description, g.icon, g.cover_url, g.tagline, coalesce(g.is_public, false), coalesce(g.join_policy, 'open'),
         (select count(*) from bandlog.group_members m where m.group_id = g.id),
         exists (select 1 from bandlog.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
         exists (select 1 from bandlog.group_join_requests r where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending')
  from bandlog.groups g
  where g.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
grant execute on function bandlog.group_by_code(text) to authenticated;

-- Join an open squad at once, or file a request for a private one. Returns 'member' | 'joined' | 'requested'.
create or replace function bandlog.request_join(g uuid) returns text
language plpgsql security definer set search_path = bandlog as $$
declare
  pol text;
  nm text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select coalesce(gr.join_policy, 'open') into pol from bandlog.groups gr where gr.id = g;
  if pol is null then raise exception 'No squad with that link'; end if;
  if exists (select 1 from bandlog.group_members m where m.group_id = g and m.user_id = auth.uid()) then return 'member'; end if;
  if pol = 'open' then
    select coalesce(p.name, '') into nm from bandlog.profiles p where p.id = auth.uid();
    insert into bandlog.group_members (group_id, user_id, display_name) values (g, auth.uid(), coalesce(nm, '')) on conflict (group_id, user_id) do nothing;
    return 'joined';
  end if;
  insert into bandlog.group_join_requests (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return 'requested';
end $$;
grant execute on function bandlog.request_join(uuid) to authenticated;

create or replace function bandlog.approve_join(req uuid) returns void
language plpgsql security definer set search_path = bandlog as $$
declare
  gid uuid;
  uid uuid;
begin
  select q.group_id, q.user_id into gid, uid from bandlog.group_join_requests q join bandlog.groups g on g.id = q.group_id where q.id = req and g.owner_id = auth.uid();
  if gid is null then raise exception 'Only the squad owner can approve requests'; end if;
  insert into bandlog.group_members (group_id, user_id, display_name)
  values (gid, uid, coalesce((select p.name from bandlog.profiles p where p.id = uid), ''))
  on conflict (group_id, user_id) do nothing;
  update bandlog.group_join_requests set status = 'approved' where id = req;
end $$;
grant execute on function bandlog.approve_join(uuid) to authenticated;

create or replace function bandlog.decline_join(req uuid) returns void
language plpgsql security definer set search_path = bandlog as $$
begin
  update bandlog.group_join_requests q set status = 'declined'
  from bandlog.groups g
  where q.id = req and g.id = q.group_id and g.owner_id = auth.uid();
  if not found then raise exception 'Only the squad owner can decline requests'; end if;
end $$;
grant execute on function bandlog.decline_join(uuid) to authenticated;

-- Owner's list of pending requests with who is asking (empty for non-owners).
create or replace function bandlog.group_requests(g uuid)
returns table (id uuid, user_id uuid, name text, username text, avatar_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not exists (select 1 from bandlog.groups gr where gr.id = g and gr.owner_id = auth.uid()) then return; end if;
  return query
  select q.id, q.user_id, bandlog.member_name(q.user_id, ''), p.username, p.avatar_path, q.created_at
  from bandlog.group_join_requests q
  left join bandlog.profiles p on p.id = q.user_id
  where q.group_id = g and q.status = 'pending'
  order by q.created_at;
end $$;
grant execute on function bandlog.group_requests(uuid) to authenticated;

-- Legacy join by code (Android <= 2.5): a request-only squad files a request instead of joining.
create or replace function bandlog.join_group(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = bandlog as $$
declare
  gid uuid;
  pol text;
  own uuid;
begin
  select gr.id, coalesce(gr.join_policy, 'open'), gr.owner_id into gid, pol, own from bandlog.groups gr where gr.code = upper(trim(p_code));
  if gid is null then raise exception 'No group with that code'; end if;
  if pol = 'request' and own <> auth.uid() and not exists (select 1 from bandlog.group_members m where m.group_id = gid and m.user_id = auth.uid()) then
    insert into bandlog.group_join_requests (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
    return gid;
  end if;
  insert into bandlog.group_members (group_id, user_id, display_name) values (gid, auth.uid(), coalesce(p_name, ''))
  on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return gid;
end $$;
grant execute on function bandlog.join_group(text, text) to authenticated;

-- Public squads now carry icon / description / policy.
drop function if exists bandlog.public_groups();
create function bandlog.public_groups()
returns table (id uuid, name text, tagline text, cover_url text, member_count bigint, joined boolean, icon text, description text, join_policy text)
language sql stable security definer set search_path = bandlog as $$
  select g.id, g.name, g.tagline, g.cover_url,
         (select count(*) from bandlog.group_members m where m.group_id = g.id),
         exists (select 1 from bandlog.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
         g.icon, g.description, coalesce(g.join_policy, 'open')
  from bandlog.groups g
  where coalesce(g.is_public, false)
  order by g.created_at;
$$;
grant execute on function bandlog.public_groups() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Posts: chat messages + the feed (meals, workouts, PRs, photos)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message', 'meal', 'workout', 'pr', 'photo')),
  body text not null default '' check (length(body) <= 1000),
  ref_id uuid,
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists group_posts_group_created_idx on bandlog.group_posts (group_id, created_at desc);
create unique index if not exists group_posts_ref_key on bandlog.group_posts (group_id, user_id, kind, ref_id) where ref_id is not null;
alter table bandlog.group_posts enable row level security;
drop policy if exists "posts members read" on bandlog.group_posts;
create policy "posts members read" on bandlog.group_posts for select using (bandlog.is_member(group_id));
drop policy if exists "posts author insert" on bandlog.group_posts;
create policy "posts author insert" on bandlog.group_posts for insert with check (user_id = auth.uid() and bandlog.is_member(group_id));
drop policy if exists "posts author delete" on bandlog.group_posts;
create policy "posts author delete" on bandlog.group_posts for delete using (
  user_id = auth.uid() or exists (select 1 from bandlog.groups g where g.id = group_id and g.owner_id = auth.uid())
);

-- Newest first, before `before` (null = now), with each author's name / username / avatar.
-- `kinds` filters ('{message}' for Chat, '{meal,workout,pr,photo}' for Feed); null = everything.
drop function if exists bandlog.group_feed(uuid, timestamptz, int);
drop function if exists bandlog.group_feed(uuid, timestamptz, int, text[]);
create function bandlog.group_feed(g uuid, before timestamptz default null, n int default 30, kinds text[] default null)
returns table (id uuid, group_id uuid, user_id uuid, kind text, body text, ref_id uuid, photo_path text, created_at timestamptz, author_name text, author_username text, author_avatar_path text)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select p.id, p.group_id, p.user_id, p.kind, p.body, p.ref_id, p.photo_path, p.created_at,
         bandlog.member_name(p.user_id, (select m.display_name from bandlog.group_members m where m.group_id = p.group_id and m.user_id = p.user_id)),
         pr.username, pr.avatar_path
  from bandlog.group_posts p
  left join bandlog.profiles pr on pr.id = p.user_id
  where p.group_id = g
    and p.created_at < coalesce(before, now() + interval '1 minute')
    and (kinds is null or p.kind = any (kinds))
  order by p.created_at desc
  limit greatest(1, least(coalesce(n, 30), 100));
end $$;
grant execute on function bandlog.group_feed(uuid, timestamptz, int, text[]) to authenticated;

-- Auto-post one row to every squad the caller is in (meal / workout / pr / photo). Re-posting the same
-- ref_id updates the body. Skipped when the caller shares "streaks only". Returns rows written.
create or replace function bandlog.post_to_my_groups(p_kind text, p_body text, p_ref uuid default null, p_photo text default null) returns int
language plpgsql security definer set search_path = bandlog as $$
declare
  c int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_kind not in ('meal', 'workout', 'pr', 'photo') then raise exception 'Unknown post kind'; end if;
  if exists (select 1 from bandlog.profiles p where p.id = auth.uid() and p.share_stats = false) then return 0; end if;
  insert into bandlog.group_posts (group_id, user_id, kind, body, ref_id, photo_path)
  select m.group_id, auth.uid(), p_kind, left(coalesce(p_body, ''), 1000), p_ref, p_photo
  from bandlog.group_members m where m.user_id = auth.uid()
  on conflict (group_id, user_id, kind, ref_id) where ref_id is not null
  do update set body = excluded.body, photo_path = coalesce(excluded.photo_path, bandlog.group_posts.photo_path);
  get diagnostics c = row_count;
  return c;
end $$;
grant execute on function bandlog.post_to_my_groups(text, text, uuid, text) to authenticated;

-- Photos for posts: private bucket, "<uid>/<file>"; readable by the uploader and anyone sharing a squad with them.
insert into storage.buckets (id, name, public) values ('group-photos', 'group-photos', false) on conflict (id) do nothing;
drop policy if exists "group photos own write" on storage.objects;
create policy "group photos own write" on storage.objects for insert with check (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "group photos own update" on storage.objects;
create policy "group photos own update" on storage.objects for update using (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "group photos own delete" on storage.objects;
create policy "group photos own delete" on storage.objects for delete using (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "group photos squad read" on storage.objects;
create policy "group photos squad read" on storage.objects for select using (
  bucket_id = 'group-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from bandlog.group_members a join bandlog.group_members b on a.group_id = b.group_id
      where a.user_id = auth.uid() and b.user_id::text = (storage.foldername(name))[1]
    )
  )
);

-- ---------------------------------------------------------------------------------------------
-- 6. Flames (current day streak) + week points, leaderboard, member details
-- ---------------------------------------------------------------------------------------------
-- Consecutive Asia/Kolkata days, ending today or yesterday, with any meal, workout or exercise_log row
-- (the same rule as the apps' activityDayStreak).
create or replace function bandlog.day_streak(u uuid) returns int
language sql stable security definer set search_path = bandlog as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date as d),
  days as (
    select m.date from bandlog.meals m, t where m.user_id = u and m.date between t.d - 400 and t.d
    union select w.date from bandlog.workouts w, t where w.user_id = u and w.date between t.d - 400 and t.d
    union select e.date from bandlog.exercise_log e, t where e.user_id = u and e.date between t.d - 400 and t.d
  ),
  s as (
    select case when exists (select 1 from days, t where days.date = t.d) then (select d from t)
                when exists (select 1 from days, t where days.date = t.d - 1) then (select d from t) - 1 end as start
  ),
  ranked as (
    select (s.start - days.date) as off, (row_number() over (order by days.date desc) - 1) as rn
    from days, s where s.start is not null and days.date <= s.start
  )
  select count(*)::int from ranked where off = rn;
$$;
revoke all on function bandlog.day_streak(uuid) from public, anon;
grant execute on function bandlog.day_streak(uuid) to authenticated;

-- This week's points (Mon-Sun, IST): 10 per training day (workout, or 10+ min exercise) + 5 per day with a meal.
create or replace function bandlog.week_points(u uuid) returns int
language sql stable security definer set search_path = bandlog as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date as d),
  w as (select t.d - (extract(isodow from t.d)::int - 1) as ws, t.d from t),
  trained as (
    select x.date from bandlog.workouts x, w where x.user_id = u and x.date between w.ws and w.d
    union select e.date from bandlog.exercise_log e, w where e.user_id = u and e.date between w.ws and w.d and e.minutes >= 10
  ),
  ate as (select distinct m.date from bandlog.meals m, w where m.user_id = u and m.date between w.ws and w.d)
  select (10 * (select count(*) from trained) + 5 * (select count(*) from ate))::int;
$$;
revoke all on function bandlog.week_points(uuid) from public, anon;
grant execute on function bandlog.week_points(uuid) to authenticated;

drop function if exists bandlog.group_leaderboard(uuid);
create function bandlog.group_leaderboard(g uuid)
returns table (rank int, user_id uuid, name text, username text, avatar_path text, flames int, week_points int, is_owner boolean)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  with r as (
    select m.user_id as uid, bandlog.member_name(m.user_id, m.display_name) as nm, p.username as un, p.avatar_path as av,
           bandlog.day_streak(m.user_id) as fl, bandlog.week_points(m.user_id) as wp, (gr.owner_id = m.user_id) as own, m.joined_at as ja
    from bandlog.group_members m
    join bandlog.groups gr on gr.id = m.group_id
    left join bandlog.profiles p on p.id = m.user_id
    where m.group_id = g
  )
  select (row_number() over (order by r.fl desc, r.wp desc, r.ja))::int, r.uid, r.nm, r.un, r.av, r.fl, r.wp, r.own
  from r
  order by r.fl desc, r.wp desc, r.ja;
end $$;
grant execute on function bandlog.group_leaderboard(uuid) to authenticated;

drop function if exists bandlog.group_members_detail(uuid);
create function bandlog.group_members_detail(g uuid)
returns table (id uuid, name text, username text, avatar_path text, is_owner boolean, flames int, joined_at timestamptz)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select m.user_id, bandlog.member_name(m.user_id, m.display_name), p.username, p.avatar_path, (gr.owner_id = m.user_id), bandlog.day_streak(m.user_id), m.joined_at
  from bandlog.group_members m
  join bandlog.groups gr on gr.id = m.group_id
  left join bandlog.profiles p on p.id = m.user_id
  where m.group_id = g
  order by (gr.owner_id = m.user_id) desc, m.joined_at;
end $$;
grant execute on function bandlog.group_members_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants + reload
-- ---------------------------------------------------------------------------------------------
grant all on bandlog.group_join_requests to authenticated, service_role;
grant all on bandlog.group_posts to authenticated, service_role;
grant all on all tables in schema bandlog to anon, authenticated, service_role;
notify pgrst, 'reload schema';

select json_build_object(
  'profile_cols', (select json_agg(column_name order by column_name) from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name in ('username', 'water_reminder_from', 'water_reminder_to', 'water_reminder_every_min', 'water_glass_ml')),
  'water_cols', (select json_agg(column_name) from information_schema.columns where table_schema = 'bandlog' and table_name = 'water_log' and column_name = 'vessel'),
  'group_cols', (select json_agg(column_name order by column_name) from information_schema.columns where table_schema = 'bandlog' and table_name = 'groups' and column_name in ('description', 'icon', 'tags', 'join_policy', 'invite_code')),
  'tables', json_build_array(to_regclass('bandlog.group_join_requests') is not null, to_regclass('bandlog.group_posts') is not null),
  'bucket', (select count(*) from storage.buckets where id = 'group-photos'),
  'functions', (select json_agg(proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bandlog' and proname in ('username_available', 'group_by_code', 'request_join', 'approve_join', 'decline_join', 'group_requests', 'join_group', 'public_groups', 'group_feed', 'post_to_my_groups', 'day_streak', 'week_points', 'group_leaderboard', 'group_members_detail')),
  'usernames', (select count(*) from bandlog.profiles where username is not null),
  'no_username', (select count(*) from bandlog.profiles where username is null),
  'sample_usernames', (select json_agg(username) from (select username from bandlog.profiles where username is not null limit 5) s)
) as result;
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'bandlog.water_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%vessel%' loop
    execute format('alter table bandlog.water_log drop constraint %I', c.conname);
  end loop;
end $$;
alter table bandlog.water_log add constraint water_log_vessel_check check (vessel is null or vessel in ('glass','bottle','large','custom','reminder','widget'));
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'bandlog.water_log'::regclass and contype='c';
